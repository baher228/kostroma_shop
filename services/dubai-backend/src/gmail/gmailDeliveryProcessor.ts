import * as repository from '../repositories/gmailDeliveryRepository';
import { withGmailPollLock } from '../repositories/gmailImportsRepository';
import { listPromotionRowsForGmailMessage } from '../repositories/promotionRowsRepository';
import { getConnectedGmailClient } from './gmailOAuth';
import { buildPromotionPackage,buildPackageMimeMessage,promotionPackageText } from './gmailPromotionPackage';
import { uploadObject,downloadObject,createEmailPackageDownloadUrl } from '../services/r2StorageService';

const defaults={repository,withLock:withGmailPollLock,getConnection:getConnectedGmailClient,rowsForMessage:listPromotionRowsForGmailMessage,
  build:buildPromotionPackage,upload:uploadObject,download:downloadObject,downloadUrl:createEmailPackageDownloadUrl};
const safeFailure='Не удалось сформировать пакет. Проверьте доступ к папке постеров и данные акции, затем повторите подготовку.';
export const createGmailDeliveryProcessor=(overrides:Partial<typeof defaults>={})=>{
  const deps={...defaults,...overrides};
  return async()=>deps.withLock(async signal=>{
    const settings=await deps.repository.readGmailDeliverySettings();
    const connection=await deps.getConnection().catch(()=>null);
    const jobs=await deps.repository.pendingGmailDeliveries();
    for(const initial of jobs){
      signal.throwIfAborted();
      let job={...initial};
      const patch=async(value:Partial<repository.GmailDelivery>)=>{signal.throwIfAborted();await deps.repository.updateGmailDelivery(job.id,value);job={...job,...value};};
      if(job.status==='sending'||job.status==='unknown'){
        await patch({status:'unknown',error:'Отправка не подтверждена. Проверяем папку «Отправленные»; автоматического повтора не будет.'});
        if(connection&&connection.mailbox===job.mailbox&&connection.client.findSentMessage){
          try{
            const sent=await connection.client.findSentMessage(job.send_message_id);
            if(sent)await patch({status:'sent',gmail_sent_id:sent,sent_at:new Date(),error:null});
          }catch{ /* Keep uncertain deliveries fenced from another send. */ }
        }
        continue;
      }
      if(job.status==='queued'||job.status==='preparing'){
        if(job.message_id&&!await deps.repository.messageImportsComplete(job.mailbox,job.message_id)){
          await patch({error:'Не все вложения письма импортированы. Проверьте историю импорта.'});continue;
        }
        try{
          if(job.attempts>=3)throw new Error('Preparation attempts exhausted.');
          const rows=job.rows_snapshot??(job.message_id?await deps.rowsForMessage(job.mailbox,job.message_id):[]);
          await patch({status:'preparing',rows_snapshot:rows,attempts:job.attempts+1,error:null});
          const result=await deps.build(rows,signal);
          signal.throwIfAborted();
          const key=`promotions/email-packages/${job.id}/promotions.zip`;
          await deps.upload({key,body:result.zip,contentType:'application/zip'});
          await patch({status:'ready',storage_key:key,manifest:result.manifest,error:null});
        }catch(error){
          signal.throwIfAborted();
          await patch({status:job.attempts>=3?'failed':'queued',error:error instanceof Error&&error.message.startsWith('Пакет превышает')?error.message:safeFailure});
          continue;
        }
      }
      if(job.status!=='ready')continue;
      const waiting=!connection?'Подключите Gmail для отправки пакета.':connection.mailbox!==job.mailbox?'Пакет создан для другого Gmail-аккаунта. Подключите исходный аккаунт.'
        :!connection.canSend?'Подключите Gmail повторно и разрешите отправку писем.':!settings.recipient?'Укажите получателя в настройках почты.'
          :!job.manual&&!settings.autoSend?'Автоматическая отправка выключена. Можно отправить пакет вручную.':null;
      if(waiting){await patch({error:waiting});continue;}
      // Prepare all fallible local/storage work before the durable send fence.
      let raw:string;
      try{
        if(!job.storage_key||!job.manifest||!job.rows_snapshot)throw new Error('Package is incomplete.');
        const archive=await deps.download(job.storage_key);
        let text=promotionPackageText(job.manifest,job.rows_snapshot);
        const asLink=archive.body.length>18*1024*1024;
        if(asLink)text+='\n\nПакет превышает размер вложения. Защищённая ссылка на ZIP (действует 7 дней):\n'+await deps.downloadUrl(job.storage_key);
        raw=buildPackageMimeMessage({from:connection!.mailbox,to:settings.recipient!,messageId:job.send_message_id,text,...(!asLink?{zip:archive.body}:{})});
      }catch{await patch({status:'failed',error:'Не удалось прочитать сохранённый пакет. Повторите подготовку.'});continue;}
      await patch({status:'sending',recipient:settings.recipient,error:null});
      try{
        signal.throwIfAborted();
        if(!connection!.client.sendMessage)throw new Error('Gmail sender unavailable.');
        const sent=await connection!.client.sendMessage(raw,signal);
        await patch({status:'sent',gmail_sent_id:sent,sent_at:new Date(),error:null});
      }catch(error){
        signal.throwIfAborted();
        const candidate=error as {response?:{status?:number};code?:number};
        const code=Number(candidate.response?.status??candidate.code);
        const rejected=code>=400&&code<500&&code!==408;
        await patch({status:rejected?'failed':'unknown',error:rejected?'Gmail отклонил отправку. Проверьте разрешение отправки и лимиты аккаунта; можно повторить вручную.'
          :'Отправка не подтверждена. Проверяем папку «Отправленные»; автоматического повтора не будет.'});
      }
    }
    return true;
  });
};
export const processGmailDeliveries=createGmailDeliveryProcessor();
