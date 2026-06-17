import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthorizedOpsRequest, requireOpsRole, requireOpsScope } from '../auth/middleware';
import {
  changeSellerOrderStatus,
  getManagerOrderSheet,
  getSellerOrders,
  submitSellerOrder,
  updateManagerOrderSheetValue,
} from '../services/orderService';
import { toValidationMessage } from '../http/http';
import {
  createSellerOrderSchema,
  idParamSchema,
  orderSheetQuerySchema,
  updateSellerOrderStatusSchema,
  upsertOrderSheetValueSchema,
} from '../http/validation';

export const registerOrderRoutes = (app: Express) => {
  app.get('/api/orders', requireOpsScope('orders:read'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const orders = await getSellerOrders(viewer);
      res.json({ orders });
    } catch {
      res.status(500).json({ message: 'Failed to load seller orders.' });
    }
  });

  app.post('/api/orders', requireOpsScope('orders:write'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthorizedOpsRequest).ops;
      const payload = createSellerOrderSchema.parse(req.body);
      const order = await submitSellerOrder(viewer, payload);
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

  app.patch('/api/orders/:id/status', requireOpsRole('manager'), requireOpsScope('orders:write'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateSellerOrderStatusSchema.parse(req.body);
      const viewer = (req as AuthorizedOpsRequest).ops;
      const order = await changeSellerOrderStatus(viewer, params.id, payload);
      if (!order) {
        res.status(404).json({ message: 'Order not found.' });
        return;
      }
      res.json({ order });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update order status.' });
    }
  });

  app.get('/api/orders/sheet', requireOpsRole('manager'), requireOpsScope('orders:read'), async (req: Request, res: Response) => {
    try {
      const query = orderSheetQuerySchema.parse({ date: req.query.date });
      const sheet = await getManagerOrderSheet(query.date);
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
      const ok = await updateManagerOrderSheetValue(payload);
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
};
