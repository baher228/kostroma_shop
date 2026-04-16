import dotenv from 'dotenv';

dotenv.config();

const parsePort = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '4000', 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return 4000;
  }
  return parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
};

export const config = {
  port: parsePort(process.env.PORT),
  jwtSecret: process.env.JWT_SECRET || 'dev_only_secret_replace_in_production',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: process.env.DATABASE_URL,
  dbHost: process.env.POSTGRES_HOST || '127.0.0.1',
  dbPort: parsePort(process.env.POSTGRES_PORT ?? '5432'),
  dbUser: process.env.POSTGRES_USER || 'kgb',
  dbPassword: process.env.POSTGRES_PASSWORD || 'kgb_dev_password',
  dbName: process.env.POSTGRES_DB || 'kgb',
  dbSsl: parseBoolean(process.env.POSTGRES_SSL, false),
};
