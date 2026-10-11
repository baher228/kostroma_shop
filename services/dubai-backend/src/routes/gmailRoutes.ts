import { Express, Request, Response } from 'express';
import { requireOpsRole } from '../auth/middleware';
import { GmailImportStatus, listGmailImports } from '../repositories/gmailImportsRepository';
import { getGmailHealth, GmailDisabledError, pollGmailNow } from '../gmail/gmailPoller';
import { GmailPollBusyError } from '../gmail/gmailService';
import { sanitizedGmailError } from '../gmail/gmailClient';
import { getGmailConnectionStatus } from '../gmail/gmailOAuth';
import { getConnectedGmailClient } from '../gmail/gmailOAuth';
import { withGmailPollLock } from '../repositories/gmailImportsRepository';
import * as delivery from '../repositories/gmailDeliveryRepository';
import { listPromotionRows } from '../repositories/promotionRowsRepository';
import { downloadObject } from '../services/r2StorageService';

const statuses = new Set<GmailImportStatus>(['processing','success','failed','skipped']);
const integer = (value: unknown,fallback: number,min: number,max: number) => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('Некорректные параметры списка импорта.');
  return number;
};
export const registerGmailRoutes = (app: Express) => {
  app.get('/api/promotions/gmail/imports',async (req: Request,res: Response) => {
    let options: { limit: number; offset: number; status?: GmailImportStatus };
    try {
      const status = req.query.status === undefined ? undefined : String(req.query.status) as GmailImportStatus;
      if (status && !statuses.has(status)) throw new Error('Некорректный статус импорта.');
      options = { limit: integer(req.query.limit,50,1,100),offset: integer(req.query.offset,0,0,100000),status };
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Некорректные параметры.' }); return;
    }
    try {
      const [imports,connection,settings,deliveries]=await Promise.all([listGmailImports(options),getGmailConnectionStatus(),delivery.readGmailDeliverySettings(),delivery.listGmailDeliveries()]);
      res.json({imports,health:{...getGmailHealth(),...connection},settings,deliveries});
    }
    catch { res.status(503).json({ message: 'История импорта временно недоступна.',health: getGmailHealth() }); }
  });
  app.put('/api/promotions/gmail/settings',requireOpsRole('manager'),async(req,res)=>{
    let settings:delivery.GmailDeliverySettings;
    try{settings=delivery.parseGmailDeliverySettings(req.body);}catch(error){res.status(400).json({message:error instanceof Error?error.message:'Проверьте настройки почты.'});return;}
    try{
      const saved=await withGmailPollLock(async()=>{await delivery.saveGmailDeliverySettings(settings);return true;});
      if(!saved){res.status(409).json({message:'Проверка почты или подготовка пакета уже выполняется. Повторите сохранение после завершения.'});return;}
      res.json({settings});
    }catch{res.status(503).json({message:'Не удалось сохранить настройки почты.'});}
  });
  app.post('/api/promotions/gmail/packages',requireOpsRole('manager'),async(req,res)=>{
    const {rowNumbers,requestId}=req.body??{};
    if(!Array.isArray(rowNumbers)||!rowNumbers.length||rowNumbers.length>500||rowNumbers.some(value=>!Number.isSafeInteger(value)||value<1)
      ||typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)){
      res.status(400).json({message:'Выберите от 1 до 500 строк акции.'});return;
    }
    try{
      const result=await withGmailPollLock(async()=>{
        const settings=await delivery.readGmailDeliverySettings();
        if(!settings.recipient)throw new Error('Укажите получателя в разделе «Документы → Почта».');
        const connection=await getConnectedGmailClient();
        if(connection.mailbox==='legacy')throw new Error('Подключите Gmail через приложение для отправки пакетов.');
        const numbers=new Set<number>(rowNumbers);
        const rows=(await listPromotionRows()).filter(row=>numbers.has(row.rowNumber));
        if(rows.length!==numbers.size)throw new Error('Некоторые выбранные строки уже удалены. Обновите таблицу.');
        return delivery.deliveryView(await delivery.createManualGmailDelivery(connection.mailbox,requestId,rows));
      });
      if(!result){res.status(409).json({message:'Проверка почты уже выполняется. Повторите действие после завершения.'});return;}
      res.status(202).json({delivery:result});
    }catch(error){res.status(400).json({message:error instanceof Error&&/^(Укажите|Подключите|Некоторые)/.test(error.message)?error.message:'Не удалось поставить пакет в очередь.'});}
  });
  app.post('/api/promotions/gmail/packages/:id/send',requireOpsRole('manager'),async(req,res)=>{
    try{
      const result=await withGmailPollLock(async()=>{
        const job=await delivery.getGmailDelivery(String(req.params.id));
        if(!job)return 'missing';
        if(['sent','sending','unknown'].includes(job.status))return 'fenced';
        const connection=await getConnectedGmailClient();
        const settings=await delivery.readGmailDeliverySettings();
        if(connection.mailbox!==job.mailbox||!connection.canSend||!settings.recipient)return 'configuration';
        await delivery.updateGmailDelivery(job.id,{manual:true,status:job.storage_key?'ready':'queued',attempts:0,error:null});
        return 'queued';
      });
      if(result==='missing'){res.status(404).json({message:'Пакет не найден.'});return;}
      if(result!=='queued'){res.status(409).json({message:result==='fenced'?'Пакет уже отправлен или отправка не подтверждена. Проверьте папку «Отправленные».':'Подключите исходный Gmail с разрешением отправки, укажите получателя и дождитесь окончания проверки почты.'});return;}
      res.status(202).json({ok:true});
    }catch{res.status(503).json({message:'Не удалось поставить пакет в очередь отправки.'});}
  });
  app.get('/api/promotions/gmail/packages/:id/package.zip',async(req,res)=>{
    try{
      const job=await delivery.getGmailDelivery(String(req.params.id));
      if(!job?.storage_key){res.status(404).json({message:'Пакет ещё не сформирован.'});return;}
      const file=await downloadObject(job.storage_key);
      res.setHeader('Content-Type','application/zip');res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Disposition',`attachment; filename="promotions-${job.id}.zip"`);
      res.send(file.body);
    }catch{res.status(503).json({message:'Не удалось скачать пакет. Повторите попытку.'});}
  });
  app.post('/api/promotions/gmail/poll',requireOpsRole('manager'),async (_req: Request,res: Response) => {
    try { res.json({ result: await pollGmailNow(),health: getGmailHealth() }); }
    catch (error) {
      res.status(error instanceof GmailPollBusyError ? 409 : 503).json({
        message: error instanceof GmailPollBusyError || error instanceof GmailDisabledError ? error.message : sanitizedGmailError(error),
        health: getGmailHealth(),
      });
    }
  });
};
