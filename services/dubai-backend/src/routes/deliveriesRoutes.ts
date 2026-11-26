import { Express, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AuthorizedOpsRequest, requireOpsRole } from '../auth/middleware';
import { toValidationMessage } from '../http/http';
import {
  createDeliverySupplierSchema,
  deliveriesQuerySchema,
  deliveryReceiptKeySchema,
  idParamSchema,
  updateDeliverySupplierSchema,
  upsertDeliveryReceiptSchema,
} from '../http/validation';
import {
  createDeliverySupplier,
  deleteDeliveryReceipt,
  deleteDeliverySupplier,
  getDeliveryReceipt,
  getDeliveryReceiptPhoto,
  getDeliverySupplier,
  listDeliveryReceipts,
  listDeliverySuppliers,
  updateDeliverySupplier,
  upsertDeliveryReceipt,
} from '../repositories/deliveriesRepository';
import { deleteObject, downloadObject, isObjectNotFoundError, uploadObject } from '../services/r2StorageService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const removePhotoQuietly = async (key: string | null | undefined) => {
  if (!key) return;
  await deleteObject(key).catch(() => undefined);
};

const sendError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: toValidationMessage(error) });
    return;
  }
  if ((error as { code?: string })?.code === '23503') {
    res.status(400).json({ message: 'Магазин или поставщик не найден.' });
    return;
  }
  res.status(500).json({ message: fallback });
};

const MOSCOW_OFFSET_MS = 3 * 60 * 60_000;

export const moscowTodayKey = (now: Date = new Date()): string => new Date(now.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);

const viewerOf = (req: Request) => (req as AuthorizedOpsRequest).ops;

/** Shop staff (workers and shop tablets) only see and mark deliveries of their own shops. */
const canAccessShop = (req: Request, shopId: string) => {
  const viewer = viewerOf(req);
  return viewer.role === 'manager' || viewer.shopIds.includes(shopId);
};

export const registerDeliveryRoutes = (app: Express) => {
  app.get('/api/deliveries', requireOpsRole('manager', 'worker'), async (req: Request, res: Response) => {
    try {
      const range = deliveriesQuerySchema.parse(req.query);
      const [allSuppliers, allReceipts] = await Promise.all([
        listDeliverySuppliers(),
        listDeliveryReceipts(range.from, range.to),
      ]);
      const suppliers = allSuppliers.filter((supplier) => canAccessShop(req, supplier.shopId));
      const supplierIds = new Set(suppliers.map((supplier) => supplier.id));
      const receipts = allReceipts.filter((receipt) => supplierIds.has(receipt.supplierId));
      res.json({ suppliers, receipts });
    } catch (error) {
      sendError(res, error, 'Не удалось загрузить приёмку.');
    }
  });

  app.post('/api/deliveries/suppliers', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const supplier = await createDeliverySupplier(createDeliverySupplierSchema.parse(req.body));
      res.status(201).json({ supplier });
    } catch (error) {
      sendError(res, error, 'Не удалось добавить поставщика.');
    }
  });

  app.patch('/api/deliveries/suppliers/:id', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const supplier = await updateDeliverySupplier(id, updateDeliverySupplierSchema.parse(req.body));
      if (!supplier) {
        res.status(404).json({ message: 'Поставщик не найден.' });
        return;
      }
      res.json({ supplier });
    } catch (error) {
      sendError(res, error, 'Не удалось сохранить поставщика.');
    }
  });

  app.delete('/api/deliveries/suppliers/:id', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const result = await deleteDeliverySupplier(id);
      if (!result.deleted) {
        res.status(404).json({ message: 'Поставщик не найден.' });
        return;
      }
      await Promise.all(result.photoKeys.map(removePhotoQuietly));
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 'Не удалось удалить поставщика.');
    }
  });

  app.post('/api/deliveries/receipts', requireOpsRole('manager', 'worker'), upload.single('photo'), async (req: Request, res: Response) => {
    try {
      const payload = upsertDeliveryReceiptSchema.parse(req.body);
      const isManager = viewerOf(req).role === 'manager';
      let receivedAt = payload.receivedAt;
      if (!isManager) {
        const supplier = await getDeliverySupplier(payload.supplierId);
        if (!supplier || !canAccessShop(req, supplier.shopId)) {
          res.status(403).json({ message: 'Поставщик другого магазина.' });
          return;
        }
        if (payload.date !== moscowTodayKey()) {
          res.status(400).json({ message: 'Отметить приёмку можно только за сегодня.' });
          return;
        }
        // Shop staff can't pick the arrival time: it is the moment of the first mark.
        const existing = await getDeliveryReceipt(payload.supplierId, payload.date);
        receivedAt = existing?.receivedAt ?? new Date().toISOString();
      }
      let photo: { key: string; contentType: string } | null | undefined = isManager && payload.removePhoto === 'true' ? null : undefined;
      if (req.file) {
        const extension = PHOTO_EXTENSIONS[req.file.mimetype];
        if (!extension) {
          res.status(400).json({ message: 'Фото накладной должно быть изображением (JPG, PNG, WEBP, HEIC).' });
          return;
        }
        const key = `deliveries/${payload.supplierId}/${payload.date}/${Date.now()}.${extension}`;
        try {
          await uploadObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
        } catch (error) {
          res.status(503).json({ message: error instanceof Error ? error.message : 'Не удалось сохранить фото.' });
          return;
        }
        photo = { key, contentType: req.file.mimetype };
      }
      const { receipt, replacedPhotoKey } = await upsertDeliveryReceipt({
        supplierId: payload.supplierId,
        date: payload.date,
        receivedAt: new Date(receivedAt).toISOString(),
        photo,
      });
      await removePhotoQuietly(replacedPhotoKey);
      res.json({ receipt });
    } catch (error) {
      sendError(res, error, 'Не удалось сохранить приёмку.');
    }
  });

  app.delete('/api/deliveries/receipts/:supplierId/:date', requireOpsRole('manager'), async (req: Request, res: Response) => {
    try {
      const { supplierId, date } = deliveryReceiptKeySchema.parse(req.params);
      const result = await deleteDeliveryReceipt(supplierId, date);
      if (!result.deleted) {
        res.status(404).json({ message: 'Отметка не найдена.' });
        return;
      }
      await removePhotoQuietly(result.photoKey);
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 'Не удалось удалить отметку.');
    }
  });

  app.get('/api/deliveries/receipts/:supplierId/:date/photo', requireOpsRole('manager', 'worker'), async (req: Request, res: Response) => {
    try {
      const { supplierId, date } = deliveryReceiptKeySchema.parse(req.params);
      if (viewerOf(req).role !== 'manager') {
        const supplier = await getDeliverySupplier(supplierId);
        if (!supplier || !canAccessShop(req, supplier.shopId)) {
          res.status(403).json({ message: 'Поставщик другого магазина.' });
          return;
        }
      }
      const photo = await getDeliveryReceiptPhoto(supplierId, date);
      if (!photo) {
        res.status(404).json({ message: 'Фото накладной нет.' });
        return;
      }
      const file = await downloadObject(photo.key);
      res.setHeader('Content-Type', photo.contentType || file.contentType);
      res.setHeader('Content-Length', String(file.body.byteLength));
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(file.body);
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        res.status(404).json({ message: 'Файл фото не найден в хранилище.' });
        return;
      }
      sendError(res, error, 'Не удалось загрузить фото накладной.');
    }
  });
};
