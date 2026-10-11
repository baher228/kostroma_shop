import React,{useRef,useState} from 'react';
import { api } from '../../api';
import { Feedback } from '../../components/ui';
import { messageOf } from '../../shared/format';
import type { GmailDelivery,GmailDeliverySettings,GmailHealth,Session } from '../../types';

const labels:Record<GmailDelivery['status'],string>={queued:'В очереди',preparing:'Готовим пакет',ready:'Готов',sending:'Отправляем',sent:'Отправлен',failed:'Ошибка',unknown:'Проверяем отправку'};
export const GmailDeliveryPanel=({session,health,settings,deliveries,onChanged}:{session:Session;health:GmailHealth|null;settings:GmailDeliverySettings;deliveries:GmailDelivery[];onChanged:()=>Promise<void>})=>{
  const manager=session.user.role==='manager';
  const [recipient,setRecipient]=useState(settings.recipient??'');
  const [senders,setSenders]=useState(settings.allowedSenders.join('\n'));
  const [autoSend,setAutoSend]=useState(settings.autoSend);
  const [busy,setBusy]=useState('');const pending=useRef(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const action=async(id:string,operation:()=>Promise<void>)=>{
    if(pending.current)return;pending.current=true;setBusy(id);setError('');setNotice('');
    try{await operation();}catch(e){setError(messageOf(e));}finally{pending.current=false;setBusy('');}
  };
  const save=()=>action('settings',async()=>{
    const value={recipient:recipient.trim()||null,allowedSenders:senders.split(/[\n,;]+/).map(email=>email.trim()).filter(Boolean),autoSend};
    const result=await api.promotions.saveGmailSettings(session.token,value);
    setRecipient(result.settings.recipient??'');setSenders(result.settings.allowedSenders.join('\n'));setAutoSend(result.settings.autoSend);
    setNotice('Настройки почты сохранены.');await onChanged();
  });
  const download=(job:GmailDelivery)=>action(job.id,async()=>{
    const file=await api.promotions.downloadGmailPackage(session.token,job.id);
    const url=URL.createObjectURL(file.blob);const link=document.createElement('a');link.href=url;link.download=file.fileName||'promotions.zip';link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return <section className="gmail-delivery-panel">
    <h4>Настройки импорта и отправки</h4>
    <div className="gmail-delivery-settings">
      <label>Кому отправлять ценники и постеры<input type="email" autoComplete="off" placeholder="recipient@example.com" value={recipient} disabled={!manager||Boolean(busy)} onChange={e=>setRecipient(e.target.value)}/></label>
      <label>Принимать письма от<textarea rows={3} placeholder="sender@example.com — один адрес на строке" value={senders} disabled={!manager||Boolean(busy)} onChange={e=>setSenders(e.target.value)}/></label>
      <p className="batch-hint">Принимаются только точные адреса из списка и письма, подлинность которых подтвердил Gmail. Пустой список приостанавливает импорт.</p>
      <label className="gmail-auto-send"><input type="checkbox" checked={autoSend} disabled={!manager||Boolean(busy)} onChange={e=>setAutoSend(e.target.checked)}/>Автоматически отправлять пакет после импорта накладной</label>
      <p className="batch-hint">Отправитель — подключённый Gmail. ZIP содержит ценники A4, доступные постеры и список товаров без постеров. Для большого пакета письмо содержит защищённую ссылку на 7 дней.</p>
      <p className="batch-hint">Лимит — 5 писем каждому получателю за 24 часа. После достижения лимита пакет остаётся в очереди.</p>
      {health?.connected&&!health.canSend&&<p className="batch-hint">Для отправки подключите Gmail повторно и разрешите отправку писем. Чтение почты доступно после настройки разрешённых отправителей.</p>}
      {manager&&<div><button className="secondary" disabled={Boolean(busy)||Boolean(health?.running)} onClick={()=>void save()}>{busy==='settings'?'Сохраняем...':'Сохранить настройки'}</button></div>}
    </div>
    <Feedback error={error} notice={notice}/>
    <details className="gmail-history">
    <summary>Пакеты и отправки{deliveries.length > 0 ? ` · ${deliveries.length}` : ''}</summary>
    {deliveries.length===0?<p className="batch-hint">Пакеты появятся после новых накладных из почты. Существующие акции можно отправить через «Пакет ценников» в общей таблице.</p>
      :<ul className="gmail-import-list" tabIndex={0} aria-label="История пакетов и отправок">{deliveries.map(job=><li key={job.id}>
        <div><strong>{job.manual?'Пакет из общей таблицы':'Пакет из письма'} · {new Date(job.createdAt).toLocaleString('ru-RU')}</strong><span className={`gmail-import-status ${job.status==='sent'?'success':job.status==='failed'?'failed':''}`}>{labels[job.status]}</span></div>
        <small>{job.mailbox} → {job.recipient??settings.recipient??'Получатель не указан'}{job.sentAt?` · ${new Date(job.sentAt).toLocaleString('ru-RU')}`:''}</small>
        {job.manifest&&<p>Ценников: {job.manifest.priceTags}. Постеров: {job.manifest.posters}. Товары: {job.manifest.products.join(', ')}.</p>}
        {job.manifest?.missingPosters.map(name=><p key={name}>Для товара «{name}» постеров ещё нет.</p>)}
        {job.manifest?.missingPrices.map(name=><p key={`price-${name}`}>Для товара «{name}» отсутствует старая или новая цена.</p>)}
        {job.error&&<p>{job.error}</p>}
        <div className="gmail-package-actions">
          {job.downloadAvailable&&<button className="secondary" disabled={Boolean(busy)} onClick={()=>void download(job)}>Скачать ZIP</button>}
          {manager&&['ready','failed','queued'].includes(job.status)&&<button className="secondary" disabled={Boolean(busy)||!health?.canSend||!settings.recipient||Boolean(health.running)} onClick={()=>void action(job.id,async()=>{
            await api.promotions.sendGmailPackage(session.token,job.id);setNotice('Пакет поставлен в очередь. Отправка выполняется при следующей проверке почты.');await onChanged();
          })}>Отправить</button>}
          {job.status==='unknown'&&<button className="secondary" onClick={()=>void action(job.id,onChanged)} disabled={Boolean(busy)}>Обновить статус</button>}
        </div>
      </li>)}</ul>}
    </details>
  </section>;
};
