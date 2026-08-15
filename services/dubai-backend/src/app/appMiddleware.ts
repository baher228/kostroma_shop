import cors from 'cors';
import { Express, json } from 'express';
import helmet from 'helmet';
import { config } from '../config/config';

export const applyAppMiddleware = (app: Express) => {
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((item: string) => item.trim()),
      credentials: false,
      // The dashboard downloads documents from the Dubai API on a different
      // origin. Without explicitly exposing this header the browser hides the
      // original file name from JavaScript, even though it is present on the
      // wire.
      exposedHeaders: ['Content-Disposition', 'Content-Length'],
    }),
  );
  app.use(json({ limit: '200kb' }));
};
