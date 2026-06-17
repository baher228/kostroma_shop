import express from 'express';
import { applyAppMiddleware } from './appMiddleware';
import { registerAuthRoutes } from '../routes/authRoutes';
import { registerCheckInRoutes } from '../routes/checkInRoutes';
import { registerSupportRoutes } from '../routes/supportRoutes';
import { registerTaskRoutes } from '../routes/taskRoutes';
import { registerUserRoutes } from '../routes/userRoutes';

export const createRussiaApp = () => {
  const app = express();

  applyAppMiddleware(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, region: 'ru' });
  });

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerCheckInRoutes(app);
  registerTaskRoutes(app);
  registerSupportRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found in Russia service.' });
  });

  return app;
};
