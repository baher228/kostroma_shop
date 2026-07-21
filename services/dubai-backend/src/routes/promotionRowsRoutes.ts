import { Express, Request, Response } from 'express';
import { requireOpsRole } from '../auth/middleware';
import {
  PromotionRowInput,
  PromotionRowStatus,
  createPromotionRow,
  deletePromotionRowByNumber,
  getPromotionRowByNumber,
  listPromotionRows,
  updatePromotionRowByNumber,
} from '../repositories/promotionRowsRepository';
import { downloadPosterPdfFile, findPosterPdfForProduct, posterPdfContentDisposition } from '../services/googleDrivePosterService';
import { createPromotionPriceTagPdf, promotionPriceTagFileName } from '../services/promotionPriceTagPdfService';

const statuses = new Set<PromotionRowStatus>(['past', 'current', 'future']);

const asNullableString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const asNullableDate = (value: unknown) => {
  const text = asNullableString(value);
  if (text === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Дата должна быть в формате YYYY-MM-DD.');
  return text;
};

const asNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('Цена должна быть положительным числом.');
  return number;
};

const parseRowNumber = (value: unknown) => {
  const rowNumber = Number(value);
  if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new Error('Номер строки должен быть положительным числом.');
  return rowNumber;
};

const parsePayload = (body: unknown): PromotionRowInput => {
  const payload = body as Record<string, unknown>;
  const status = String(payload.status ?? 'future') as PromotionRowStatus;
  if (!statuses.has(status)) throw new Error('Неизвестный статус акции.');
  const startDate = asNullableDate(payload.startDate);
  const endDate = asNullableDate(payload.endDate);
  if (startDate && endDate && startDate > endDate) throw new Error('Дата начала не может быть позже даты окончания.');
  return {
    status,
    productName: asNullableString(payload.productName) ?? '',
    startDate,
    endDate,
    promoPrice: asNullableNumber(payload.promoPrice),
    regularPrice: asNullableNumber(payload.regularPrice),
  };
};

export const registerPromotionRowsRoutes = (app: Express) => {
  app.get('/api/promotions/rows', async (_req: Request, res: Response) => {
    res.json({ rows: await listPromotionRows() });
  });

  app.get('/api/promotions/rows/by-number/:rowNumber', async (req: Request, res: Response) => {
    try {
      const rowNumber = parseRowNumber(req.params.rowNumber);
      const row = await getPromotionRowByNumber(rowNumber);
      if (!row) {
        res.status(404).json({ message: 'Строка с таким номером не найдена.' });
        return;
      }
      res.json({ row });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось загрузить строку.' });
    }
  });

  app.get('/api/promotions/rows/by-number/:rowNumber/price-tag.pdf', async (req: Request, res: Response) => {
    try {
      const rowNumber = parseRowNumber(req.params.rowNumber);
      const row = await getPromotionRowByNumber(rowNumber);
      if (!row) {
        res.status(404).json({ message: 'Строка с таким номером не найдена.' });
        return;
      }
      if (row.promoPrice === null || row.regularPrice === null) {
        res.status(400).json({ message: 'Для ценника нужны новая и старая цена.' });
        return;
      }
      const pdf = createPromotionPriceTagPdf(row);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Content-Disposition', `attachment; filename="${promotionPriceTagFileName(row)}"`);
      res.send(pdf);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось сделать ценник.' });
    }
  });

  app.get('/api/promotions/rows/by-number/:rowNumber/poster.pdf', async (req: Request, res: Response) => {
    try {
      const rowNumber = parseRowNumber(req.params.rowNumber);
      const row = await getPromotionRowByNumber(rowNumber);
      if (!row) {
        res.status(404).json({ message: 'Строка с таким номером не найдена.' });
        return;
      }
      const match = await findPosterPdfForProduct(row.productName);
      if (!match.best) {
        res.status(404).json({
          message: 'Не удалось найти PDF-постер для этого товара в Google Drive.',
          candidates: match.candidates.map((candidate) => ({
            fileName: candidate.file.name,
            score: candidate.score,
          })),
        });
        return;
      }
      const pdf = await downloadPosterPdfFile(match.best.file.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', posterPdfContentDisposition(match.best.file.name));
      res.send(pdf);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось скачать постер.' });
    }
  });

  app.post('/api/promotions/rows', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const row = await createPromotionRow(parsePayload(req.body));
      res.status(201).json({ row });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось добавить строку.' });
    }
  });

  app.patch('/api/promotions/rows/by-number/:rowNumber', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const rowNumber = parseRowNumber(req.params.rowNumber);
      const row = await updatePromotionRowByNumber(rowNumber, parsePayload(req.body));
      if (!row) {
        res.status(404).json({ message: 'Строка с таким номером не найдена.' });
        return;
      }
      res.json({ row });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось обновить строку.' });
    }
  });

  app.delete('/api/promotions/rows/by-number/:rowNumber', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const rowNumber = parseRowNumber(req.params.rowNumber);
      const deleted = await deletePromotionRowByNumber(rowNumber);
      if (!deleted) {
        res.status(404).json({ message: 'РЎС‚СЂРѕРєР° СЃ С‚Р°РєРёРј РЅРѕРјРµСЂРѕРј РЅРµ РЅР°Р№РґРµРЅР°.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СЃС‚СЂРѕРєСѓ.' });
    }
  });
};
