import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthorizedOpsRequest, requireOpsRole, requireOpsScope } from '../auth/middleware';
import {
  createStockProduct,
  addProductSubcategory,
  getShopOrderValues,
  getProductSubcategories,
  getVisibleStockTable,
  removeProductSubcategory,
  removeStockProduct,
  setShopOrderValue,
  setStockValue,
  updateStockProduct,
  updateStockProductMeta,
} from '../services/stockService';
import { toStringParam, toValidationMessage } from '../http/http';
import {
  createRowSchema,
  idParamSchema,
  listStockTableQuerySchema,
  subcategorySchema,
  updateProductMetaSchema,
  updateProductSchema,
  upsertOrderSheetValueSchema,
  upsertStockValueSchema,
} from '../http/validation';

export const registerStockRoutes = (app: Express) => {
  app.get('/api/stock', requireOpsScope('stock:read'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const query = listStockTableQuerySchema.parse({
        shopId: toStringParam(req.query.shopId),
        businessCategory: toStringParam(req.query.businessCategory),
        from: toStringParam(req.query.from),
        to: toStringParam(req.query.to),
        range: toStringParam(req.query.range),
      kind: toStringParam(req.query.kind),
      });
      const table = await getVisibleStockTable(viewer, query);
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
      const product = await createStockProduct(payload);
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

  app.get('/api/stock/subcategories', requireOpsScope('stock:read'), async (_req: Request, res: Response) => {
    try {
      const subcategories = await getProductSubcategories();
      res.json({ subcategories });
    } catch {
      res.status(500).json({ message: 'Failed to load product subcategories.' });
    }
  });

  app.post('/api/stock/subcategories', requireOpsRole('manager'), requireOpsScope('products:write'), async (req: Request, res: Response) => {
    try {
      const payload = subcategorySchema.parse(req.body);
      const subcategories = await addProductSubcategory(payload);
      res.status(201).json({ subcategories });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to create product subcategory.' });
    }
  });

  app.delete('/api/stock/subcategories', requireOpsRole('manager'), requireOpsScope('products:write'), async (req: Request, res: Response) => {
    try {
      const payload = subcategorySchema.parse(req.body);
      const removed = await removeProductSubcategory(payload);
      if (!removed) {
        res.status(409).json({ message: 'Subcategory is used by products or does not exist.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete product subcategory.' });
    }
  });

  app.delete('/api/stock/products/:id', requireOpsRole('manager'), requireOpsScope('products:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await removeStockProduct(params.id);
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
      const updated = await updateStockProductMeta(params.id, payload);
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

  app.patch('/api/stock/products/:id', requireOpsRole('manager'), requireOpsScope('products:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateProductSchema.parse(req.body);
      const updated = await updateStockProduct(params.id, payload);
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
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        res.status(409).json({ message: 'A product with that name already exists.' });
        return;
      }
      res.status(500).json({ message: 'Failed to update product.' });
    }
  });

  app.put('/api/stock/value', requireOpsScope('stock:write'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const payload = upsertStockValueSchema.parse(req.body);
      const ok = await setStockValue(viewer, payload);
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

  app.get('/api/stock/order-values', requireOpsScope('orders:read'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const shopId = toStringParam(req.query.shopId);
      const from = toStringParam(req.query.from);
      const to = toStringParam(req.query.to);
      const businessCategory = toStringParam(req.query.businessCategory);
      if (!shopId || !from || !to) {
        res.status(400).json({ message: 'shopId, from and to query params required.' });
        return;
      }
      const query = listStockTableQuerySchema.pick({ businessCategory: true }).parse({ businessCategory });
      const orderValues = await getShopOrderValues(viewer, shopId, from, to, query.businessCategory);
      if (!orderValues) {
        res.status(403).json({ message: 'Not enough Dubai API permissions.' });
        return;
      }
      res.json({ orderValues });
    } catch {
      res.status(500).json({ message: 'Failed to load order values.' });
    }
  });

  app.put('/api/stock/order-values', requireOpsRole('manager'), requireOpsScope('orders:write'), async (req: Request, res: Response) => {
    try {
      const payload = upsertOrderSheetValueSchema.parse({
        shopId: toStringParam((req.body as Record<string, unknown>)?.shopId),
        productId: toStringParam((req.body as Record<string, unknown>)?.productId),
        date: toStringParam((req.body as Record<string, unknown>)?.orderDate),
        value:
          typeof (req.body as Record<string, unknown>)?.packs === 'number'
            ? String((req.body as Record<string, number>).packs)
            : '',
      });
      const ok = await setShopOrderValue(payload);
      if (!ok) {
        res.status(404).json({ message: 'Unable to update order value.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update order value.' });
    }
  });
};
