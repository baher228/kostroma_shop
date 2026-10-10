import dotenv from 'dotenv';
import {
  insecureFallback,
  parseBoolean,
  parsePort,
  requireDatabaseSetting,
  resolveCorsOrigin,
  trimToUndefined,
} from '../../../shared/config';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const personalDatabaseUrl = trimToUndefined(process.env.PERSONAL_DATABASE_URL || process.env.DATABASE_URL);

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
  expoPushAccessToken: trimToUndefined(process.env.EXPO_PUSH_ACCESS_TOKEN),
  corsOrigin: resolveCorsOrigin({ value: process.env.CORS_ORIGIN, isProduction }),
  personalDatabaseUrl,
  personalDbHost: personalDatabaseUrl
    ? '127.0.0.1'
    : requireDatabaseSetting({
        value: process.env.PERSONAL_POSTGRES_HOST || process.env.POSTGRES_HOST,
        label: 'PERSONAL_POSTGRES_HOST',
        fallback: isProduction ? undefined : '127.0.0.1',
        isProduction,
      }),
  personalDbPort: parsePort(process.env.PERSONAL_POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? '5432'),
  personalDbUser: personalDatabaseUrl
    ? 'analitika'
    : requireDatabaseSetting({
        value: process.env.PERSONAL_POSTGRES_USER || process.env.POSTGRES_USER,
        label: 'PERSONAL_POSTGRES_USER',
        fallback: isProduction ? undefined : 'analitika',
        isProduction,
      }),
  personalDbPassword: personalDatabaseUrl
    ? 'analitika_dev_password'
    : requireDatabaseSetting({
        value: process.env.PERSONAL_POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD,
        label: 'PERSONAL_POSTGRES_PASSWORD',
        fallback: 'analitika_dev_password',
        isProduction,
      }),
  personalDbName: personalDatabaseUrl
    ? 'analitika_personal'
    : requireDatabaseSetting({
        value: process.env.PERSONAL_POSTGRES_DB || process.env.POSTGRES_DB,
        label: 'PERSONAL_POSTGRES_DB',
        fallback: isProduction ? undefined : 'analitika_personal',
        isProduction,
      }),
  personalDbSsl: parseBoolean(process.env.PERSONAL_POSTGRES_SSL ?? process.env.POSTGRES_SSL, false),
  personalDbSslRejectUnauthorized: parseBoolean(
    process.env.PERSONAL_POSTGRES_SSL_REJECT_UNAUTHORIZED ?? process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED,
    isProduction,
  ),
};
