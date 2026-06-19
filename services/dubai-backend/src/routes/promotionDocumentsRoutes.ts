import { Express, Request, Response } from 'express';
import multer from 'multer';
import { AuthorizedOpsRequest, requireOpsRole } from '../auth/middleware';
import {
  PromotionDocument,
  PromotionDocumentType,
  createPromotionDocument,
  getLatestPromotionDocument,
  getPromotionDocumentById,
  listPromotionDocuments,
} from '../repositories/promotionDocumentsRepository';
import { createDownloadUrl, uploadObject } from '../services/r2StorageService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});

const labels: Record<PromotionDocumentType, string> = {
  invoice: 'накладная',
  two_month_plan: 'план на два месяца',
  final_table_csv: 'итоговая таблица',
};

const allowedTypes = new Set<PromotionDocumentType>(['invoice', 'two_month_plan', 'final_table_csv']);
const uploadedBy = (req: Request) => (req as AuthorizedOpsRequest).ops?.jti ?? null;

const decodeFileName = (fileName: string) => {
  const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
  return decoded.includes('�') ? fileName : decoded;
};

const safeName = (value: string) =>
  value.replace(/[^\wа-яА-ЯёЁ. -]+/g, '_').replace(/\s+/g, '_').slice(0, 120);

const documentTypeFromRequest = (raw: unknown): PromotionDocumentType | null => {
  const value = String(raw ?? '').trim();
  return allowedTypes.has(value as PromotionDocumentType) ? value as PromotionDocumentType : null;
};

const validateUpload = (documentType: PromotionDocumentType, fileName: string) => {
  const lower = fileName.toLowerCase();
  if (documentType === 'invoice' && !lower.endsWith('.pdf')) {
    throw new Error('Накладная должна быть в формате PDF.');
  }
  if (documentType === 'two_month_plan' && !lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    throw new Error('План на два месяца должен быть в формате Excel или CSV.');
  }
};

const storageKey = (documentType: PromotionDocumentType, fileName: string) =>
  `promotions/documents/${documentType}/${Date.now()}_${safeName(fileName)}`;

const csvEscape = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const ensureFinalTableCsv = async (req: Request) => {
  const documents = await listPromotionDocuments();
  const header = ['Тип документа', 'Имя файла', 'Размер', 'Дата загрузки'];
  const rows = documents
    .filter((document) => document.documentType !== 'final_table_csv')
    .map((document) => [
      labels[document.documentType],
      document.fileName,
      document.sizeBytes,
      document.uploadedAt,
    ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  const body = Buffer.from(`\uFEFF${csv}`, 'utf8');
  const key = storageKey('final_table_csv', 'itogovaya_tablica.csv');
  await uploadObject({ key, body, contentType: 'text/csv; charset=utf-8' });
  return createPromotionDocument({
    documentType: 'final_table_csv',
    fileName: 'itogovaya_tablica.csv',
    contentType: 'text/csv; charset=utf-8',
    storageKey: key,
    sizeBytes: body.byteLength,
    uploadedBy: uploadedBy(req),
  });
};

const resolveDownloadDocument = async (query: Request['query']): Promise<PromotionDocument | null> => {
  const documentId = String(query.id ?? '').trim();
  if (documentId) return getPromotionDocumentById(documentId);

  const documentType = documentTypeFromRequest(query.type);
  if (!documentType) return null;
  return getLatestPromotionDocument(documentType);
};

export const registerPromotionDocumentRoutes = (app: Express) => {
  app.get('/api/promotions/documents', async (_req: Request, res: Response) => {
    res.json({ documents: await listPromotionDocuments() });
  });

  app.post(
    '/api/promotions/documents',
    requireOpsRole('manager'),
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const documentType = documentTypeFromRequest(req.body.documentType);
        if (!documentType || documentType === 'final_table_csv') {
          res.status(400).json({ message: 'Выберите тип документа: накладная или план на два месяца.' });
          return;
        }
        if (!req.file) {
          res.status(400).json({ message: 'Прикрепите файл.' });
          return;
        }
        const fileName = decodeFileName(req.file.originalname);
        validateUpload(documentType, fileName);
        const key = storageKey(documentType, fileName);
        await uploadObject({ key, body: req.file.buffer, contentType: req.file.mimetype || 'application/octet-stream' });
        const document = await createPromotionDocument({
          documentType,
          fileName,
          contentType: req.file.mimetype || 'application/octet-stream',
          storageKey: key,
          sizeBytes: req.file.size,
          uploadedBy: uploadedBy(req),
        });
        res.status(201).json({ document });
      } catch (error) {
        res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось прикрепить документ.' });
      }
    },
  );

  app.post('/api/promotions/documents/final-table', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      res.status(201).json({ document: await ensureFinalTableCsv(req) });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось создать итоговую таблицу.' });
    }
  });

  app.get('/api/promotions/documents/download', async (req: Request, res: Response) => {
    try {
      const document = await resolveDownloadDocument(req.query);
      if (!document) {
        res.status(404).json({ message: 'Документ не найден.' });
        return;
      }
      res.json({ url: await createDownloadUrl(document.storageKey), fileName: document.fileName, document });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось скачать документ.' });
    }
  });
};
