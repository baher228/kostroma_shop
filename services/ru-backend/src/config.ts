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
  opsJwtSecret: process.env.OPS_JWT_SECRET || process.env.JWT_SECRET || 'dev_only_ops_secret_replace_in_production',
  opsTokenPrivateKey: process.env.OPS_TOKEN_PRIVATE_KEY,
  opsTokenPublicKey: process.env.OPS_TOKEN_PUBLIC_KEY,
  opsTokenKeyId: process.env.OPS_TOKEN_KEY_ID || 'ops-token-dev',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  personalDatabaseUrl: process.env.PERSONAL_DATABASE_URL || process.env.DATABASE_URL,
  personalDbHost: process.env.PERSONAL_POSTGRES_HOST || process.env.POSTGRES_HOST || '127.0.0.1',
  personalDbPort: parsePort(process.env.PERSONAL_POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? '5432'),
  personalDbUser: process.env.PERSONAL_POSTGRES_USER || process.env.POSTGRES_USER || 'analitika',
  personalDbPassword: process.env.PERSONAL_POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD || 'analitika_dev_password',
  personalDbName: process.env.PERSONAL_POSTGRES_DB || process.env.POSTGRES_DB || 'analitika_personal',
  personalDbSsl: parseBoolean(process.env.PERSONAL_POSTGRES_SSL ?? process.env.POSTGRES_SSL, false),
};
