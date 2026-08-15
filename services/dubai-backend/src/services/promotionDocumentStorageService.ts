import type { PromotionDocument, PromotionDocumentType } from '../repositories/promotionDocumentsRepository';
import {
  DownloadedObject,
  deleteObject,
  downloadObject,
  isObjectNotFoundError,
} from './r2StorageService';

const documentsPrefix = 'promotions/documents/';

export const safePromotionDocumentFileName = (value: string) =>
  value
    .normalize('NFC')
    .replace(/[^\w\u0430-\u044f\u0410-\u042f\u0451\u0401. -]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);

export const createPromotionDocumentStorageKey = (
  _documentType: PromotionDocumentType,
  fileName: string,
  timestamp = Date.now(),
) => `${documentsPrefix}${timestamp}_${safePromotionDocumentFileName(fileName)}`;

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

/**
 * Documents were originally stored below a document-type directory. New uploads
 * use a flat directory. The database can outlive either object layout during a
 * deployment, so downloads try the recorded key first and then the deterministic
 * counterpart with the same timestamped object name.
 */
export const promotionDocumentStorageKeyCandidates = (
  document: Pick<PromotionDocument, 'documentType' | 'storageKey'>,
): string[] => {
  const storedKey = document.storageKey.trim().replace(/^\/+/, '');
  if (!storedKey.startsWith(documentsPrefix)) return [storedKey];

  const relativeKey = storedKey.slice(documentsPrefix.length);
  const legacyPrefix = `${document.documentType}/`;
  const objectName = relativeKey.startsWith(legacyPrefix)
    ? relativeKey.slice(legacyPrefix.length)
    : relativeKey;

  if (!objectName || objectName.includes('/')) return [storedKey];

  return unique([
    storedKey,
    `${documentsPrefix}${objectName}`,
    `${documentsPrefix}${legacyPrefix}${objectName}`,
  ]);
};

export class PromotionDocumentFileMissingError extends Error {
  readonly storageKeys: string[];

  constructor(storageKeys: string[]) {
    super('Файл документа отсутствует в хранилище. Загрузите документ повторно.');
    this.name = 'PromotionDocumentFileMissingError';
    this.storageKeys = storageKeys;
  }
}

type ObjectDownloader = (key: string) => Promise<DownloadedObject>;
type ObjectDeleter = (key: string) => Promise<void>;

export type DownloadedPromotionDocument = DownloadedObject & {
  resolvedStorageKey: string;
};

const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const promotionDocumentDownloadContentType = (
  document: Pick<PromotionDocument, 'documentType' | 'fileName' | 'contentType'>,
  objectContentType?: string,
): string => {
  if (document.documentType === 'invoice') return 'application/pdf';
  if (document.documentType === 'retail_price_list') return xlsxContentType;
  if (document.documentType === 'final_table_csv') return 'text/csv; charset=utf-8';

  const lowerName = document.fileName.toLowerCase();
  if (lowerName.endsWith('.xlsx')) return xlsxContentType;
  if (lowerName.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lowerName.endsWith('.csv')) return 'text/csv; charset=utf-8';
  return document.contentType || objectContentType || 'application/octet-stream';
};

export const downloadPromotionDocument = async (
  document: Pick<PromotionDocument, 'documentType' | 'storageKey'>,
  objectDownloader: ObjectDownloader = downloadObject,
): Promise<DownloadedPromotionDocument> => {
  const candidates = promotionDocumentStorageKeyCandidates(document);

  for (const key of candidates) {
    try {
      const downloaded = await objectDownloader(key);
      return { ...downloaded, resolvedStorageKey: key };
    } catch (error) {
      if (!isObjectNotFoundError(error)) throw error;
    }
  }

  throw new PromotionDocumentFileMissingError(candidates);
};

export const deletePromotionDocumentObjects = async (
  document: Pick<PromotionDocument, 'documentType' | 'storageKey'>,
  objectDeleter: ObjectDeleter = deleteObject,
): Promise<string[]> => {
  const candidates = promotionDocumentStorageKeyCandidates(document);
  const deletedKeys: string[] = [];
  const failures: unknown[] = [];

  for (const key of candidates) {
    try {
      await objectDeleter(key);
      deletedKeys.push(key);
    } catch (error) {
      if (!isObjectNotFoundError(error)) failures.push(error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Failed to delete promotion document objects.');
  }
  return deletedKeys;
};
