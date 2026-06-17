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
    }),
  );
  app.use(json({ limit: '200kb' }));
};
