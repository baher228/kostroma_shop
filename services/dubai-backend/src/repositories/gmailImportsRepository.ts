import { randomUUID } from 'crypto';
import { opsDb, withOpsSession, withOpsTransaction } from '../db/opsDb';
import { deleteObject } from '../services/r2StorageService';

export type GmailImportStatus = 'processing' | 'success' | 'failed' | 'skipped';
export type GmailImportMetadata = {
  mailbox?: string;
  messageId: string; attachmentId: string | null; attachmentKey: string;
  filename: string; mimeType: string; sender: string; subject: string;
  receivedAt: string | null;
};
export type GmailImport = GmailImportMetadata & {
  id: string; fileHash: string | null; status: GmailImportStatus; error: string | null;
  retryable: boolean; attemptCount: number; promotionDocumentId: string | null;
  createdAt: string; processedAt: string | null; updatedAt: string;
};
const date = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const mapImport = (row: Record<string, any>): GmailImport => ({
  id: row.id, mailbox: row.mailbox,messageId: row.message_id, attachmentId: row.attachment_id, attachmentKey: row.attachment_key,
  filename: row.filename, mimeType: row.mime_type, sender: row.sender, subject: row.subject || '',
  receivedAt: date(row.received_at), fileHash: row.file_hash, status: row.status, error: row.error,
  retryable: row.retryable, attemptCount: Number(row.attempt_count), promotionDocumentId: row.promotion_document_id,
  createdAt: date(row.created_at)!, processedAt: date(row.processed_at), updatedAt: date(row.updated_at)!,
});

// One session lock serializes polls across backend replicas. It is released by
// PostgreSQL on process death; processing claims may then be safely recovered.
export const withGmailPollLock = async <T>(callback: (signal: AbortSignal) => Promise<T>): Promise<T | null> => withOpsSession(async (client) => {
  const controller = new AbortController();
  const lost = () => controller.abort(new Error('Gmail poll database lock lost.'));
  // pg emits an error when an idle reserved session loses its connection.
  // Abort work and retain a listener until the pool releases this connection.
  client.on('error',lost);
  try {
    const lock = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(40002) AS locked;');
    if (!lock.rows[0]?.locked) return null;
    const result = await callback(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } finally {
    if (!controller.signal.aborted) await client.query('SELECT pg_advisory_unlock(40002);').catch(lost);
    client.removeListener('error',lost);
  }
});

export const recoverGmailImportObjects = async () => {
  await withOpsTransaction(async () => {
    // A worker whose poll session died may still hold an import transaction.
    // Lock claim+pending rows and skip those owned by such active transactions,
    // so cleanup cannot remove their not-yet-visible committed source object.
    const gmail = await opsDb.query<{ storage_key: string }>(`SELECT pending.storage_key FROM promotion_import_objects pending
      JOIN gmail_imports gmail ON gmail.id=pending.gmail_import_id
      WHERE NOT EXISTS (SELECT 1 FROM promotion_storage_documents document WHERE document.storage_key=pending.storage_key)
      FOR UPDATE OF gmail,pending SKIP LOCKED;`);
    const manual = await opsDb.query<{ storage_key: string }>(`SELECT pending.storage_key FROM promotion_import_objects pending
      WHERE pending.gmail_import_id IS NULL AND pending.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (SELECT 1 FROM promotion_storage_documents document WHERE document.storage_key=pending.storage_key)
      FOR UPDATE OF pending SKIP LOCKED;`);
    for (const object of [...gmail.rows,...manual.rows]) {
      await deleteObject(object.storage_key);
      await opsDb.query('DELETE FROM promotion_import_objects WHERE storage_key=$1;', [object.storage_key]);
    }
  });
};

// Call only under withGmailPollLock. Atomic upsert handles repeated MIME parts
// and failed retries; success/skipped/deterministic failures remain terminal.
export const claimGmailImport = async (input: GmailImportMetadata, maxAttempts: number) => {
  const result = await opsDb.query<{ id: string; attempt_count: number }>(
    `INSERT INTO gmail_imports (id,message_id,attachment_id,attachment_key,filename,mime_type,sender,subject,received_at,status,attempt_count,mailbox)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'processing',1,$11)
     ON CONFLICT (mailbox,message_id,attachment_key) DO UPDATE SET
       status='processing',error=NULL,retryable=FALSE,attempt_count=gmail_imports.attempt_count+1,updated_at=NOW()
     WHERE (gmail_imports.status='failed' AND gmail_imports.retryable=TRUE OR gmail_imports.status='processing')
       AND gmail_imports.attempt_count < $10
     RETURNING id,attempt_count;`,
    [randomUUID(),input.messageId,input.attachmentId,input.attachmentKey,input.filename,input.mimeType,input.sender,input.subject,input.receivedAt,maxAttempts,input.mailbox ?? 'legacy'],
  );
  const row = result.rows[0];
  return row ? { id: row.id, attemptCount: Number(row.attempt_count) } : null;
};

export const failExhaustedGmailImports = async (maxAttempts: number) => {
  await opsDb.query(`UPDATE gmail_imports SET status='failed',retryable=FALSE,error='interrupted_import: исчерпан лимит попыток',processed_at=NOW(),updated_at=NOW()
    WHERE status='processing' AND attempt_count >= $1;`, [maxAttempts]);
};
export const setGmailImportHash = async (id: string, hash: string,attemptCount: number) => {
  await opsDb.query("UPDATE gmail_imports SET file_hash=$2,updated_at=NOW() WHERE id=$1 AND status='processing' AND attempt_count=$3;", [id,hash,attemptCount]);
};
export const hasSuccessfulGmailImportHash = async (hash: string, excludeId: string) => {
  const result = await opsDb.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM gmail_imports WHERE file_hash=$1 AND id<>$2 AND status='success') AS exists;`, [hash,excludeId]);
  return Boolean(result.rows[0]?.exists);
};
export const completeGmailImport = async (id: string, status: Exclude<GmailImportStatus, 'processing'>, options: {
  error?: string | null; retryable?: boolean; promotionDocumentId?: string | null; attemptCount?: number;
} = {}) => {
  await opsDb.query(`UPDATE gmail_imports SET status=$2,error=$3,retryable=$4,promotion_document_id=$5,processed_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='processing' AND ($6::integer IS NULL OR attempt_count=$6);`,
    [id,status,options.error?.slice(0,2000) ?? null,options.retryable ?? false,options.promotionDocumentId ?? null,options.attemptCount ?? null]);
};
export const listGmailImports = async (options: { limit?: number; offset?: number; status?: GmailImportStatus } = {}) => {
  const result = await opsDb.query(`SELECT * FROM gmail_imports WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC,id LIMIT $2 OFFSET $3;`,
    [options.status ?? null,options.limit ?? 50,options.offset ?? 0]);
  return result.rows.map(mapImport);
};

export const getGmailPollCursor = async (query: string) => {
  const result = await opsDb.query<{ page_token: string | null }>('SELECT page_token FROM gmail_poll_state WHERE singleton=TRUE AND query=$1;', [query]);
  return result.rows[0]?.page_token || undefined;
};
export const setGmailPollCursor = async (query: string,pageToken?: string) => {
  await opsDb.query(`INSERT INTO gmail_poll_state (singleton,query,page_token) VALUES (TRUE,$1,$2)
    ON CONFLICT (singleton) DO UPDATE SET query=EXCLUDED.query,page_token=EXCLUDED.page_token,updated_at=NOW();`, [query,pageToken || null]);
};
export const getLastSuccessfulGmailImportAt = async () => {
  const result = await opsDb.query<{ processed_at: Date | string }>("SELECT processed_at FROM gmail_imports WHERE status='success' ORDER BY processed_at DESC LIMIT 1;");
  return result.rows[0] ? date(result.rows[0].processed_at) : null;
};
