import { randomUUID } from 'crypto';
import { opsDb } from '../db/opsDb';
import { config } from '../config/config';
import { validateEmailAddress } from '../gmail/gmailSenderPolicy';
import type { PromotionTableRow } from './promotionRowsRepository';

export type GmailDeliverySettings = { recipient: string | null; allowedSenders: string[]; autoSend: boolean };
export const parseGmailDeliverySettings = (body: unknown): GmailDeliverySettings => {
  if (!body || typeof body!=='object' || Array.isArray(body)) throw new Error('Укажите настройки почты.');
  const value=body as Record<string,unknown>;
  if (!Array.isArray(value.allowedSenders) || value.allowedSenders.length>50) throw new Error('Укажите до 50 адресов разрешённых отправителей.');
  const allowedSenders=[...new Set(value.allowedSenders.map(validateEmailAddress))];
  const recipient=value.recipient===null || value.recipient==='' ? null : validateEmailAddress(value.recipient);
  if (typeof value.autoSend!=='boolean') throw new Error('Укажите режим автоматической отправки.');
  if (value.autoSend && (!recipient || !allowedSenders.length)) throw new Error('Для автоматической отправки укажите получателя и разрешённых отправителей.');
  return {recipient,allowedSenders,autoSend:value.autoSend};
};
export const readGmailDeliverySettings = async (): Promise<GmailDeliverySettings> => {
  const row=(await opsDb.query('SELECT recipient,allowed_senders,auto_send FROM gmail_delivery_settings WHERE singleton=TRUE;')).rows[0];
  return row ? {recipient:row.recipient,allowedSenders:row.allowed_senders,autoSend:row.auto_send}
    : {recipient:null,allowedSenders:config.gmailAllowedSenders,autoSend:false};
};
export const saveGmailDeliverySettings = async (settings: GmailDeliverySettings) => {
  await opsDb.query(`INSERT INTO gmail_delivery_settings (singleton,recipient,allowed_senders,auto_send) VALUES(TRUE,$1,$2,$3)
    ON CONFLICT(singleton) DO UPDATE SET recipient=EXCLUDED.recipient,allowed_senders=EXCLUDED.allowed_senders,auto_send=EXCLUDED.auto_send,updated_at=NOW();`,[settings.recipient,settings.allowedSenders,settings.autoSend]);
};
export type PackageManifest = { products: string[]; priceTags: number; posters: number; missingPosters: string[]; missingPrices: string[]; files: string[] };
export type GmailDelivery = {
  id:string; mailbox:string; message_id:string|null; status:'queued'|'preparing'|'ready'|'sending'|'sent'|'failed'|'unknown';
  manual:boolean; rows_snapshot:PromotionTableRow[]|null; storage_key:string|null; manifest:PackageManifest|null;
  recipient:string|null; send_message_id:string; gmail_sent_id:string|null; error:string|null; attempts:number;
  created_at:Date; updated_at:Date; sent_at:Date|null; send_started_at:Date|null;
};
export const deliveryView = (row: GmailDelivery) => ({id:row.id,mailbox:row.mailbox,status:row.status,manual:row.manual,
  recipient:row.recipient,manifest:row.manifest,downloadAvailable:Boolean(row.storage_key),error:row.error,
  createdAt:row.created_at,sentAt:row.sent_at});
export const listGmailDeliveries = async () => (await opsDb.query<GmailDelivery>('SELECT * FROM gmail_deliveries ORDER BY created_at DESC LIMIT 20;')).rows.map(deliveryView);
export const getGmailDelivery = async (id:string) => (await opsDb.query<GmailDelivery>('SELECT * FROM gmail_deliveries WHERE id=$1;',[id])).rows[0]??null;
export const pendingGmailDeliveries = async () => (await opsDb.query<GmailDelivery>("SELECT * FROM gmail_deliveries WHERE status IN ('queued','preparing','ready','sending','unknown') ORDER BY updated_at,id LIMIT 5;")).rows;
export const updateGmailDelivery = async (id:string,patch:Partial<GmailDelivery>) => {
  const allowed=['status','rows_snapshot','storage_key','manifest','recipient','gmail_sent_id','error','attempts','manual','sent_at','send_started_at'] as const;
  const entries=Object.entries(patch).filter(([key])=>allowed.includes(key as typeof allowed[number]));
  if (!entries.length) return;
  const values=entries.map(([key,value])=>['rows_snapshot','manifest'].includes(key)&&value!==null?JSON.stringify(value):value);
  await opsDb.query(`UPDATE gmail_deliveries SET ${entries.map(([key],index)=>`${key}=$${index+2}`).join(',')},updated_at=NOW() WHERE id=$1;`,[id,...values]);
};
export const createManualGmailDelivery = async (mailbox:string,requestId:string,rows:PromotionTableRow[]) => {
  const id=randomUUID();
  const result=await opsDb.query<GmailDelivery>(`INSERT INTO gmail_deliveries (id,mailbox,source_key,manual,rows_snapshot,send_message_id)
    VALUES($1,$2,$3,TRUE,$4,$5) ON CONFLICT(mailbox,source_key) DO UPDATE SET source_key=gmail_deliveries.source_key RETURNING *;`,
    [id,mailbox,`manual:${requestId}`,JSON.stringify(rows),`affera-promotions-${id}@affera.co.uk`]);
  return result.rows[0];
};
export const messageImportsComplete = async (mailbox:string,messageId:string) => {
  const result=await opsDb.query<{complete:boolean}>(`SELECT NOT EXISTS(SELECT 1 FROM gmail_imports WHERE mailbox=$1 AND message_id=$2 AND status IN ('processing','failed')) AS complete;`,[mailbox,messageId]);
  return result.rows[0].complete;
};

// All sends reserve their slot while holding withGmailPollLock. Uncertain
// Gmail acknowledgements count too; a definitive rejection does not.
export const canSendGmailToRecipient = async (recipient:string) => {
  const result=await opsDb.query<{allowed:boolean}>(`SELECT count(*) < 5 AS allowed FROM gmail_deliveries
    WHERE lower(recipient)=$1 AND status IN ('sent','sending','unknown')
      AND COALESCE(sent_at,send_started_at)>NOW()-INTERVAL '24 hours';`,[validateEmailAddress(recipient)]);
  return result.rows[0].allowed;
};
