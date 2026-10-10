import express from 'express';
import { applyAppMiddleware } from './appMiddleware';
import { requireOpsAuth } from '../auth/middleware';
import { registerOrderRoutes } from '../routes/ordersRoutes';
import { registerPromotionDocumentRoutes } from '../routes/promotionDocumentsRoutes';
import { registerPromotionRowsRoutes } from '../routes/promotionRowsRoutes';
import { registerShopRoutes } from '../routes/shopsRoutes';
import { registerStockRoutes } from '../routes/stockRoutes';
import { registerGmailRoutes } from '../routes/gmailRoutes';
import { getGmailHealth } from '../gmail/gmailPoller';

export const createDubaiApp = () => {
  const app = express();

  applyAppMiddleware(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, region: 'dubai', gmail: getGmailHealth() });
  });

  app.use(requireOpsAuth);

  registerShopRoutes(app);
  registerStockRoutes(app);
  registerOrderRoutes(app);
  registerPromotionRowsRoutes(app);
  registerPromotionDocumentRoutes(app);
  registerGmailRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found in Dubai service.' });
  });

  return app;
};
