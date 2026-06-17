import dotenv from 'dotenv';
import {
  insecureFallback,
  parseBoolean,
  parsePort,
  requireDatabaseSetting,
  resolveCorsOrigin,
  trimToUndefined,
} from '../../shared/config';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const opsDatabaseUrl = trimToUndefined(process.env.OPS_DATABASE_URL || process.env.DATABASE_URL);

export const config = {
  port: parsePort(process.env.PORT, 4000),
  jwtSecret: insecureFallback({ value: process.env.JWT_SECRET, fallback: 'dev_only_secret_replace_in_production', label: 'JWT_SECRET', isProduction }),
  opsJwtSecret: insecureFallback({
    value: process.env.OPS_JWT_SECRET || process.env.JWT_SECRET,
    fallback: 'dev_only_ops_secret_replace_in_production',
    label: 'OPS_JWT_SECRET',
    isProduction,
  }),
  opsTokenPrivateKey: trimToUndefined(process.env.OPS_TOKEN_PRIVATE_KEY),
  opsTokenPublicKey: trimToUndefined(process.env.OPS_TOKEN_PUBLIC_KEY),
  opsTokenKeyId: trimToUndefined(process.env.OPS_TOKEN_KEY_ID) || 'ops-token-dev',
  corsOrigin: resolveCorsOrigin({ value: process.env.CORS_ORIGIN, isProduction }),
  opsDatabaseUrl,
  opsDbHost: opsDatabaseUrl
    ? '127.0.0.1'
    : requireDatabaseSetting({
        value: process.env.OPS_POSTGRES_HOST || process.env.POSTGRES_HOST,
        label: 'OPS_POSTGRES_HOST',
        fallback: '127.0.0.1',
        isProduction,
      }),
  opsDbPort: parsePort(process.env.OPS_POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? '5432'),
  opsDbUser: opsDatabaseUrl
    ? 'analitika'
    : requireDatabaseSetting({
        value: process.env.OPS_POSTGRES_USER || process.env.POSTGRES_USER,
        label: 'OPS_POSTGRES_USER',
        fallback: 'analitika',
        isProduction,
      }),
  opsDbPassword: opsDatabaseUrl
    ? 'analitika_dev_password'
    : requireDatabaseSetting({
        value: process.env.OPS_POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD,
        label: 'OPS_POSTGRES_PASSWORD',
        fallback: 'analitika_dev_password',
        isProduction,
      }),
  opsDbName: opsDatabaseUrl
    ? 'analitika_ops'
    : requireDatabaseSetting({
        value: process.env.OPS_POSTGRES_DB || process.env.POSTGRES_DB,
        label: 'OPS_POSTGRES_DB',
        fallback: 'analitika_ops',
        isProduction,
      }),
  opsDbSsl: parseBoolean(process.env.OPS_POSTGRES_SSL ?? process.env.POSTGRES_SSL, false),
  opsDbSslRejectUnauthorized: parseBoolean(
    process.env.OPS_POSTGRES_SSL_REJECT_UNAUTHORIZED ?? process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED,
    isProduction,
  ),
};
