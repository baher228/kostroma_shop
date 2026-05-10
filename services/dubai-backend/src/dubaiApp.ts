import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config';
import { AuthorizedOpsRequest, requireOpsAuth, requireOpsRole, requireOpsScope } from './middleware';
import { getOrderSheet, listOrderSheetValues, upsertOrderSheetValue } from './orderSheetStore';
import { createSellerOrder, listSellerOrders } from './ordersStore';
import {
  createProduct,
  createShop,
  deleteProduct,
  deleteShop,
  getShopById,
  getStockTable,
  listShops,
  updateProductMeta,
  updateShopMachine,
  upsertStockValue,
} from './store';
import {
  createRowSchema,
  createSellerOrderSchema,
  createShopSchema,
  idParamSchema,
  listStockTableQuerySchema,
  orderSheetQuerySchema,
  updateProductMetaSchema,
  updateShopMachineSchema,
  upsertOrderSheetValueSchema,
  upsertStockValueSchema,
} from './validation';

const toValidationMessage = (error: ZodError): string => error.issues.map((issue) => issue.message).join(' ');
const toStringParam = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export const createDubaiApp = () => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((item: string) => item.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, region: 'dubai' });
  });

  app.use(requireOpsAuth);

  app.get('/api/shops', requireOpsScope('shops:read'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      if (viewer.role === 'worker') {
        const shops = await Promise.all(viewer.shopIds.map((shopId) => getShopById(shopId)));
        res.json({ shops: shops.filter(Boolean) });
        return;
      }
      const shops = await listShops();
      res.json({ shops });
    } catch {
      res.status(500).json({ message: 'Failed to load shops.' });
    }
  });

  app.post('/api/shops', requireOpsRole('manager'), requireOpsScope('shops:write'), async (req: Request, res: Response) => {
    try {
      const payload = createShopSchema.parse(req.body);
      const shop = await createShop(payload.name, payload.machineNumber);
      res.status(201).json({ shop });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A shop with that name already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to create shop.' });
    }
  });

  app.patch('/api/shops/:id/machine', requireOpsRole('manager'), requireOpsScope('shops:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateShopMachineSchema.parse(req.body);
      const shop = await updateShopMachine(params.id, payload.machineNumber);
      if (!shop) {
        res.status(404).json({ message: 'Shop not found.' });
        return;
      }
      res.json({ shop });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update shop machine.' });
    }
  });

  app.delete('/api/shops/:id', requireOpsRole('manager'), requireOpsScope('shops:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await deleteShop(params.id);
      if (!removed) {
        res.status(404).json({ message: 'Shop not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete shop.' });
    }
  });

  app.get('/api/stock', requireOpsScope('stock:read'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const query = listStockTableQuerySchema.parse({
        shopId: toStringParam(req.query.shopId),
        from: toStringParam(req.query.from),
        to: toStringParam(req.query.to),
        range: toStringParam(req.query.range),
      });
      const table = await getStockTable(viewer, query);
      if (!table) {
        res.status(404).json({ message: 'Stock table not found for selected shop.' });
        return;
      }
      res.json({ table });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load stock table.' });
    }
  });

  app.post('/api/stock/products', requireOpsRole('manager'), requireOpsScope('products:write'), async (req: Request, res: Response) => {
    try {
      const payload = createRowSchema.parse(req.body);
      const product = await createProduct(payload);
      res.status(201).json({ product });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A product with that name already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to create product.' });
    }
  });

  app.delete('/api/stock/products/:id', requireOpsRole('manager'), requireOpsScope('products:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await deleteProduct(params.id);
      if (!removed) {
        res.status(404).json({ message: 'Product not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete product.' });
    }
  });

  app.patch('/api/stock/products/:id/meta', requireOpsRole('manager'), requireOpsScope('products:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateProductMetaSchema.parse(req.body);
      const updated = await updateProductMeta(params.id, payload);
      if (!updated) {
        res.status(404).json({ message: 'Product not found.' });
        return;
      }
      res.json({ product: updated });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update product settings.' });
    }
  });

  app.put('/api/stock/value', requireOpsScope('stock:write'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const payload = upsertStockValueSchema.parse(req.body);
      const ok = await upsertStockValue(viewer, payload);
      if (!ok) {
        res.status(404).json({ message: 'Unable to update stock value.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update stock value.' });
    }
  });

  app.get('/api/stock/order-values', requireOpsRole('manager'), requireOpsScope('orders:read'), async (req: Request, res: Response) => {
    try {
      const shopId = toStringParam(req.query.shopId);
      const from = toStringParam(req.query.from);
      const to = toStringParam(req.query.to);
      if (!shopId || !from || !to) {
        res.status(400).json({ message: 'shopId, from and to query params required.' });
        return;
      }
      const orderValues = await listOrderSheetValues(shopId, from, to);
      res.json({ orderValues });
    } catch {
      res.status(500).json({ message: 'Failed to load order values.' });
    }
  });

  app.put('/api/stock/order-values', requireOpsRole('manager'), requireOpsScope('orders:write'), async (req: Request, res: Response) => {
    try {
      const { shopId, productId, orderDate, packs } = req.body as {
        shopId: string;
        productId: string;
        orderDate: string;
        packs: number;
      };
      if (!shopId || !productId || !orderDate || typeof packs !== 'number') {
        res.status(400).json({ message: 'shopId, productId, orderDate, and packs required.' });
        return;
      }
      const ok = await upsertOrderSheetValue({
        shopId,
        productId,
        date: orderDate,
        value: packs > 0 ? String(packs) : '',
      });
      if (!ok) {
        res.status(404).json({ message: 'Unable to update order value.' });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ message: 'Failed to update order value.' });
    }
  });

  app.get('/api/orders', requireOpsScope('orders:read'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const orders = await listSellerOrders(viewer);
      res.json({ orders });
    } catch {
      res.status(500).json({ message: 'Failed to load seller orders.' });
    }
  });

  app.post('/api/orders', requireOpsScope('orders:write'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const payload = createSellerOrderSchema.parse(req.body);
      const order = await createSellerOrder(viewer, payload);
      if (!order) {
        res.status(404).json({ message: 'Unable to create order for selected product/shop.' });
        return;
      }
      res.status(201).json({ order });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to create seller order.' });
    }
  });

  app.get('/api/orders/sheet', requireOpsRole('manager'), requireOpsScope('orders:read'), async (req: Request, res: Response) => {
    try {
      const query = orderSheetQuerySchema.parse({ date: req.query.date });
      const sheet = await getOrderSheet(query.date);
      res.json({ sheet });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load order sheet.' });
    }
  });

  app.put('/api/orders/sheet/value', requireOpsRole('manager'), requireOpsScope('orders:write'), async (req: Request, res: Response) => {
    try {
      const payload = upsertOrderSheetValueSchema.parse(req.body);
      const ok = await upsertOrderSheetValue(payload);
      if (!ok) {
        res.status(404).json({ message: 'Unable to update order sheet value.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update order sheet value.' });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found in Dubai service.' });
  });

  return app;
};
