import dotenv from 'dotenv';
import path from 'path';
import {
  insecureFallback,
  parseBoolean,
  parsePort,
  requireDatabaseSetting,
  resolveCorsOrigin,
  trimToUndefined,
} from '../../../shared/config';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

const isProduction = process.env.NODE_ENV === 'production';

const opsDatabaseUrl = trimToUndefined(process.env.OPS_DATABASE_URL || process.env.DATABASE_URL);
const positiveInteger = (value: string | undefined, fallback: number, max: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number,max) : fallback;
};
const commaSeparated = (value: string | undefined) => [...new Set((value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];

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
  r2AccountId: trimToUndefined(process.env.R2_ACCOUNT_ID),
  r2AccessKeyId: trimToUndefined(process.env.R2_ACCESS_KEY_ID),
  r2SecretAccessKey: trimToUndefined(process.env.R2_SECRET_ACCESS_KEY),
  r2Bucket: trimToUndefined(process.env.R2_BUCKET || process.env.R2_BUCKET_NAME),
  r2PublicBaseUrl: trimToUndefined(process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_URL),
  r2SignedUrlTtlSeconds: parsePort(process.env.R2_SIGNED_URL_TTL_SECONDS ?? '900'),
  googleDrivePostersFolderId: trimToUndefined(process.env.GOOGLE_DRIVE_POSTERS_FOLDER_ID),
  googleApplicationCredentials: trimToUndefined(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  googleServiceAccountJson: trimToUndefined(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  googleServiceAccountJsonBase64: trimToUndefined(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64),
  gmailEnabled: parseBoolean(process.env.GMAIL_ENABLED, false),
  gmailClientId: trimToUndefined(process.env.GMAIL_CLIENT_ID),
  gmailClientSecret: trimToUndefined(process.env.GMAIL_CLIENT_SECRET),
  gmailRefreshToken: trimToUndefined(process.env.GMAIL_REFRESH_TOKEN),
  gmailUser: trimToUndefined(process.env.GMAIL_USER) || 'me',
  gmailQuery: trimToUndefined(process.env.GMAIL_QUERY) || 'has:attachment newer_than:30d',
  gmailAllowedSenders: commaSeparated(process.env.GMAIL_ALLOWED_SENDERS),
  gmailAllowedExtensions: commaSeparated(process.env.GMAIL_ALLOWED_EXTENSIONS || '.pdf,.xlsx,.xls,.csv'),
  gmailPollIntervalMs: positiveInteger(process.env.GMAIL_POLL_INTERVAL_MS,60000,86400000),
  gmailMaxMessagesPerPoll: positiveInteger(process.env.GMAIL_MAX_MESSAGES_PER_POLL,100,1000),
  gmailMaxRetries: positiveInteger(process.env.GMAIL_MAX_RETRIES,3,20),
  gmailMaxAttachmentBytes: positiveInteger(process.env.GMAIL_MAX_ATTACHMENT_BYTES,25 * 1024 * 1024,25 * 1024 * 1024),
  gmailGlobalDedupeByHash: parseBoolean(process.env.GMAIL_GLOBAL_DEDUPE_BY_HASH,false),
};
