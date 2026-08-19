import { Express, Request, Response } from 'express';
import multer from 'multer';
import { AuthorizedOpsRequest, requireOpsRole } from '../auth/middleware';
import {
  PromotionDocument,
  PromotionDocumentType,
  createPromotionDocument,
  deletePromotionDocumentById,
  getLatestPromotionDocument,
  getPromotionDocumentById,
  listPromotionDocuments,
} from '../repositories/promotionDocumentsRepository';
import { hasPromotionPriceListItems } from '../repositories/promotionPriceListRepository';
import { listPromotionRows } from '../repositories/promotionRowsRepository';
import { importPromotionInvoice } from '../services/promotionInvoiceImportService';
import { importPromotionPlan } from '../services/promotionPlanImportService';
import { importPromotionPriceList } from '../services/promotionPriceListImportService';
import {
  PromotionDocumentFileMissingError,
  createPromotionDocumentStorageKey,
  deletePromotionDocumentObjects,
  downloadPromotionDocument,
  promotionDocumentDownloadContentType,
} from '../services/promotionDocumentStorageService';
import { uploadObject } from '../services/r2StorageService';

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
  retail_price_list: 'прайс розничных цен',
  final_table_csv: 'итоговая таблица',
};

const allowedTypes = new Set<PromotionDocumentType>(['invoice', 'two_month_plan', 'retail_price_list', 'final_table_csv']);
const uploadedBy = (req: Request) => (req as AuthorizedOpsRequest).ops?.jti ?? null;

const decodeFileName = (fileName: string) => {
  const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
  return decoded.includes('�') ? fileName : decoded;
};

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
  if (documentType === 'retail_price_list' && !lower.endsWith('.xlsx')) {
    throw new Error('Прайс розничных цен должен быть в формате XLSX.');
  }
};

const csvEscape = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const contentDisposition = (fileName: string) => {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

const buildFinalTableCsv = async () => {
  const promotionRows = await listPromotionRows();
  const header = ['Номер строки', 'Статус акции', 'Название позиции', 'Дата начала', 'Дата окончания', 'Новая цена', 'Старая цена', 'Разница', 'Реальный % акции', 'Рекламный % акции'];
  const rows = promotionRows.map((row) => [
    row.rowNumber,
    row.status,
    row.productName,
    row.startDate,
    row.endDate,
    row.promoPrice,
    row.regularPrice,
    row.priceDifference,
    row.realDiscountPercent,
    row.advertisingDiscountPercent,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
  return Buffer.from(`\uFEFF${csv}`, 'utf8');
};

const ensureFinalTableCsv = async (req: Request) => {
  const body = await buildFinalTableCsv();
  const key = createPromotionDocumentStorageKey('final_table_csv', 'itogovaya_tablica.csv');
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
          res.status(400).json({ message: 'Выберите тип документа: накладная, план или прайс розничных цен.' });
          return;
        }
        if (!req.file) {
          res.status(400).json({ message: 'Прикрепите файл.' });
          return;
        }
        if (documentType === 'invoice' && !(await hasPromotionPriceListItems())) {
          res.status(400).json({ message: 'Сначала загрузите XLSX прайс розничных цен. Без него накладная не сможет посчитать разницу и проценты акций.' });
          return;
        }
        const fileName = decodeFileName(req.file.originalname);
        validateUpload(documentType, fileName);
        const key = createPromotionDocumentStorageKey(documentType, fileName);
        await uploadObject({ key, body: req.file.buffer, contentType: req.file.mimetype || 'application/octet-stream' });
        const document = await createPromotionDocument({
          documentType,
          fileName,
          contentType: req.file.mimetype || 'application/octet-stream',
          storageKey: key,
          sizeBytes: req.file.size,
          uploadedBy: uploadedBy(req),
        });
        const importResult = documentType === 'retail_price_list'
          ? await importPromotionPriceList({ buffer: req.file.buffer, sourceDocumentId: document.id, sourceFileName: fileName })
          : documentType === 'invoice'
            ? await importPromotionInvoice({ buffer: req.file.buffer, sourceDocumentId: document.id, sourceFileName: fileName })
            : documentType === 'two_month_plan'
              ? await importPromotionPlan({ buffer: req.file.buffer, sourceDocumentId: document.id, sourceFileName: fileName })
              : null;
        res.status(201).json({ document, import: importResult });
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

  app.get('/api/promotions/documents/final-table/download', async (_req: Request, res: Response) => {
    try {
      const body = await buildFinalTableCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="itogovaya_tablica.csv"');
      res.send(body);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ РёС‚РѕРіРѕРІСѓСЋ С‚Р°Р±Р»РёС†Сѓ.' });
    }
  });

  app.get('/api/promotions/documents/download', async (req: Request, res: Response) => {
    try {
      const document = await resolveDownloadDocument(req.query);
      if (!document) {
        res.status(404).json({ message: 'Документ не найден.' });
        return;
      }
      const file = await downloadPromotionDocument(document);
      // The database metadata belongs to the selected document id and was
      // validated during upload. Prefer it over potentially stale object
      // metadata so an XLSX cannot be advertised as a PDF by R2.
      res.setHeader('Content-Type', promotionDocumentDownloadContentType(document, file.contentType));
      res.setHeader('Content-Length', String(file.body.byteLength));
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Content-Disposition', contentDisposition(document.fileName));
      res.send(file.body);
    } catch (error) {
      res.status(error instanceof PromotionDocumentFileMissingError ? 404 : 400).json({
        message: error instanceof Error ? error.message : 'Не удалось скачать документ.',
      });
    }
  });

  app.delete('/api/promotions/documents/:documentId', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const deleted = await deletePromotionDocumentById(String(req.params.documentId ?? '').trim());
      if (!deleted) {
        res.status(404).json({ message: 'Документ не найден.' });
        return;
      }
      try {
        await deletePromotionDocumentObjects(deleted.document);
      } catch (error) {
        console.warn('Failed to delete promotion document from R2', error);
      }
      res.json({ document: deleted.document, deletedRows: deleted.deletedRows });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось удалить документ.' });
    }
  });
};
