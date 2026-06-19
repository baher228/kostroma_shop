import express from 'express';
import { applyAppMiddleware } from './appMiddleware';
import { requireOpsAuth } from '../auth/middleware';
import { registerOrderRoutes } from '../routes/ordersRoutes';
import { registerPromotionDocumentRoutes } from '../routes/promotionDocumentsRoutes';
import { registerPromotionRowsRoutes } from '../routes/promotionRowsRoutes';
import { registerShopRoutes } from '../routes/shopsRoutes';
import { registerStockRoutes } from '../routes/stockRoutes';

export const createDubaiApp = () => {
  const app = express();

  applyAppMiddleware(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, region: 'dubai' });
  });

  app.use(requireOpsAuth);

  registerShopRoutes(app);
  registerStockRoutes(app);
  registerOrderRoutes(app);
  registerPromotionRowsRoutes(app);
  registerPromotionDocumentRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found in Dubai service.' });
  });

  return app;
};
