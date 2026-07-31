import express from 'express';
import { applyAppMiddleware } from './appMiddleware';
import { registerAuthRoutes } from '../routes/authRoutes';
import { registerAudioQcRoutes } from '../routes/audioQcRoutes';
import { registerCheckInRoutes } from '../routes/checkInRoutes';
import { registerFobRoutes } from '../routes/fobRoutes';
import { registerNotificationRoutes } from '../routes/notificationRoutes';
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
  registerAudioQcRoutes(app);
  registerUserRoutes(app);
  registerCheckInRoutes(app);
  registerFobRoutes(app);
  registerNotificationRoutes(app);
  registerTaskRoutes(app);
  registerSupportRoutes(app);

  app.use((req, res) => {
    console.warn(`RU route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found in Russia service.' });
  });

  return app;
};
