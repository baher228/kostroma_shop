import { randomUUID } from 'crypto';
import { TextDecoder } from 'util';
import { opsDb, withOpsTransaction } from '../db/opsDb';
import { createPromotionDocument } from '../repositories/promotionDocumentsRepository';
import type { PromotionDocument } from '../repositories/promotionDocumentsRepository';
import { completeGmailImport } from '../repositories/gmailImportsRepository';
import { hasPromotionPriceListItems } from '../repositories/promotionPriceListRepository';
import { createPromotionDocumentStorageKey, promotionDocumentDownloadContentType } from './promotionDocumentStorageService';
import { importPromotionInvoice, parsePromotionInvoice } from './promotionInvoiceImportService';
import { importPromotionPlan, parsePromotionPlan } from './promotionPlanImportService';
import { importPromotionPriceList, parsePromotionPriceList } from './promotionPriceListImportService';
import { uploadObject, deleteObject } from './r2StorageService';

export type ImportablePromotionDocumentType = 'invoice' | 'two_month_plan' | 'retail_price_list';
export type PromotionDocumentImportInput = {
  documentType: ImportablePromotionDocumentType;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  uploadedBy: string | null;
  gmailImportId?: string;
  gmailImportAttempt?: number;
  signal?: AbortSignal;
};
export type PromotionDocumentImportResult = {
  document: PromotionDocument;
  import: Awaited<ReturnType<typeof importPromotionInvoice>> | Awaited<ReturnType<typeof importPromotionPlan>> | Awaited<ReturnType<typeof importPromotionPriceList>>;
};

export class PromotionImportPrerequisiteError extends Error {
  constructor() {
    super('Сначала загрузите XLSX прайс розничных цен. Без него накладная не сможет посчитать разницу и проценты акций.');
    this.name = 'PromotionImportPrerequisiteError';
  }
}

export const validatePromotionCsv = (buffer: Buffer) => {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new Error('CSV должен содержать корректный текст UTF-8.'); }
  if (!text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) {
    throw new Error('CSV содержит пустые или бинарные данные.');
  }
  if (text.split(/\r?\n/).some((line) => line.length > 100_000)) {
    throw new Error('Строка CSV слишком длинная.');
  }
  return text;
};

export const validatePromotionDocumentFile = async (input: Pick<PromotionDocumentImportInput, 'documentType' | 'fileName' | 'buffer'>) => {
  if (!input.buffer.byteLength) throw new Error('Файл пустой.');
  if (input.buffer.byteLength > 25 * 1024 * 1024) throw new Error('Размер файла превышает 25 МБ.');
  const name = input.fileName.toLowerCase();
  if (input.documentType === 'invoice') {
    if (!name.endsWith('.pdf')) throw new Error('Накладная должна быть в формате PDF.');
    await parsePromotionInvoice(input.buffer);
  } else if (input.documentType === 'retail_price_list') {
    if (!name.endsWith('.xlsx')) throw new Error('Прайс розничных цен должен быть в формате XLSX.');
    await parsePromotionPriceList({ buffer: input.buffer, sourceDocumentId: '', sourceFileName: input.fileName });
  } else if (input.documentType === 'two_month_plan') {
    if (!/\.(xlsx|xls|csv)$/i.test(name)) throw new Error('План на два месяца должен быть в формате Excel или CSV.');
    if (name.endsWith('.csv')) validatePromotionCsv(input.buffer);
    await parsePromotionPlan(input.buffer, input.fileName);
  } else {
    throw new Error('Неизвестный тип документа.');
  }
};

const dependencies = {
  validate: validatePromotionDocumentFile,
  hasPriceList: hasPromotionPriceListItems,
  upload: uploadObject,
  deleteObject,
  createDocument: createPromotionDocument,
  transaction: withOpsTransaction,
  invoice: importPromotionInvoice,
  plan: importPromotionPlan,
  priceList: importPromotionPriceList,
  completeGmail: completeGmailImport,
  query: opsDb.query,
};

// Dependency injection keeps tests entirely local, including R2 and PostgreSQL.
export const createPromotionDocumentImporter = (overrides: Partial<typeof dependencies> = {}) => {
  const deps = { ...dependencies, ...overrides };
  return async (input: PromotionDocumentImportInput) => {
    if (input.documentType === 'invoice' && !(await deps.hasPriceList())) throw new PromotionImportPrerequisiteError();
    await deps.validate(input);
    input.signal?.throwIfAborted();
    const contentType = promotionDocumentDownloadContentType({ ...input });
    const key = createPromotionDocumentStorageKey(input.documentType, `${randomUUID()}_${input.fileName}`);
    await deps.query('INSERT INTO promotion_import_objects (storage_key, gmail_import_id) VALUES ($1,$2);', [key, input.gmailImportId ?? null]);
    let completed: PromotionDocumentImportResult | undefined;
    try {
      await deps.upload({ key, body: input.buffer, contentType });
      input.signal?.throwIfAborted();
      return await deps.transaction(async () => {
        input.signal?.throwIfAborted();
        if (input.gmailImportId) {
          // Fence an old worker whose advisory-lock connection died while R2
          // was uploading. Recovery increments attempt_count; FOR UPDATE also
          // prevents another claim racing the atomic document/success commit.
          const claim = await deps.query(`SELECT id FROM gmail_imports WHERE id=$1 AND status='processing' AND attempt_count=$2 FOR UPDATE;`,
            [input.gmailImportId,input.gmailImportAttempt]);
          if (!claim.rows.length) throw new Error('Gmail attachment claim expired.');
        }
        const pending = await deps.query('SELECT storage_key FROM promotion_import_objects WHERE storage_key=$1 FOR UPDATE;', [key]);
        if (!pending.rows.length) throw new Error('Promotion document upload claim expired.');
        const document = await deps.createDocument({
          documentType: input.documentType, fileName: input.fileName, contentType,
          storageKey: key, sizeBytes: input.buffer.byteLength, uploadedBy: input.uploadedBy,
        });
        const parserInput = { buffer: input.buffer, sourceDocumentId: document.id, sourceFileName: input.fileName };
        const result = input.documentType === 'invoice' ? await deps.invoice(parserInput)
          : input.documentType === 'retail_price_list' ? await deps.priceList(parserInput) : await deps.plan(parserInput);
        input.signal?.throwIfAborted();
        if (input.gmailImportId) {
          await deps.completeGmail(input.gmailImportId, 'success', { promotionDocumentId: document.id,attemptCount: input.gmailImportAttempt });
        }
        await deps.query('DELETE FROM promotion_import_objects WHERE storage_key = $1;', [key]);
        completed = { document, import: result };
        return completed;
      });
    } catch (error) {
      // Preserve the original parser/storage/DB error even if cleanup fails.
      try {
        const committed = await deps.query('SELECT id FROM promotion_storage_documents WHERE storage_key = $1 LIMIT 1;', [key]);
        // A connection can fail after COMMIT reached PostgreSQL. Never delete a
        // successfully committed document's object based on an ambiguous error.
        if (completed && committed.rows.some((row: { id: string }) => row.id === completed!.document.id)) return completed;
        if (!committed.rows.length) await deps.deleteObject(key);
        await deps.query('DELETE FROM promotion_import_objects WHERE storage_key = $1;', [key]);
      } catch {
        console.warn('promotion import compensation deferred', { cleanupPending: true });
      }
      throw error;
    }
  };
};

export const importPromotionDocument = createPromotionDocumentImporter();
