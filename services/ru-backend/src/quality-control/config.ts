import '../config/config';
import { readFileSync } from 'node:fs';
import { createSecureContext } from 'node:tls';

const boolean = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw !== 'true' && raw !== 'false') throw new Error(`Invalid ${name}: expected true or false`);
  return raw === 'true';
};

const validateEndpoint = (name: string, value: string, storage = false) => {
  try {
    const url = new URL(value);
    if (!(storage ? ['http:', 'https:'] : ['https:']).includes(url.protocol) ||
        url.username || url.password || url.search || url.hash || (storage && url.pathname !== '/')) throw new Error();
  } catch { throw new Error(`Invalid ${name}`); }
};

const integer = (name: string, fallback: number, min = 1, max = 2_147_483_647): number => {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
};

export const qcConfig = {
  enabled: boolean('QC_ENABLED', false),
  workerEnabled: boolean('QC_WORKER_ENABLED', true),
  pollIntervalMs: integer('QC_POLL_INTERVAL_MS', 2000),
  maxAttempts: integer('QC_MAX_ATTEMPTS', 3, 1, 10),
  retryBaseMs: integer('QC_RETRY_BASE_MS', 5000),
  leaseMs: integer('QC_JOB_LEASE_MS', 900_000, 10_000),
  maxUploadBytes: integer('QC_MAX_UPLOAD_BYTES', 50 * 1024 * 1024, 1024, 200 * 1024 * 1024),
  retentionStandardHours: integer('QC_RETENTION_STANDARD_HOURS', 72, 1, 24 * 365),
  retentionBadHours: integer('QC_RETENTION_BAD_HOURS', 24 * 7, 1, 24 * 365 * 5),
  retentionInterestingHours: integer('QC_RETENTION_INTERESTING_HOURS', 24 * 7, 1, 24 * 365 * 10),
  retentionCleanupIntervalMs: integer('QC_RETENTION_CLEANUP_INTERVAL_MS', 60 * 60 * 1000, 10_000),
  retentionCleanupBatchSize: integer('QC_RETENTION_CLEANUP_BATCH_SIZE', 25, 1, 500),
  storageEndpoint: process.env.S3_ENDPOINT_URL || '',
  storageAccessKey: process.env.S3_ACCESS_KEY || '',
  storageSecretKey: process.env.S3_SECRET_KEY || '',
  storageBucket: process.env.S3_BUCKET_AUDIO || 'ml-audio',
  storageRegion: process.env.S3_REGION || 'us-east-1',
  storageTimeoutMs: integer('QC_STORAGE_TIMEOUT_MS', 60_000),
  sttProvider: process.env.QC_STT_PROVIDER || 'nexara',
  nexaraApiKey: process.env.NEXARA_API_KEY || '',
  nexaraBaseUrl: process.env.NEXARA_BASE_URL || 'https://api.nexara.ru/v1',
  nexaraModel: process.env.NEXARA_MODEL || '',
  nexaraTimeoutMs: integer('NEXARA_TIMEOUT_MS', 600_000),
  llmProvider: process.env.QC_LLM_PROVIDER || 'gigachat',
  gigachatAuthKey: process.env.GIGACHAT_AUTH_KEY || process.env.AUTH_KEY || '',
  gigachatScope: process.env.GIGACHAT_SCOPE || process.env.SCOPE || 'GIGACHAT_API_PERS',
  gigachatBaseUrl: process.env.GIGACHAT_BASE_URL || 'https://api.giga.chat/v1',
  gigachatAuthUrl: process.env.GIGACHAT_AUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
  gigachatModel: process.env.GIGACHAT_MODEL || 'GigaChat-3-Pro',
  gigachatTimeoutMs: integer('GIGACHAT_TIMEOUT_MS', 120_000),
  gigachatCaBundlePath: process.env.GIGACHAT_CA_BUNDLE_PATH || '',
  gigachatMaxTranscriptChars: integer('GIGACHAT_MAX_TRANSCRIPT_CHARS', 100_000, 1_000, 1_000_000),
  gigachatMaxTokens: integer('GIGACHAT_MAX_TOKENS', 4096, 256, 32_768),
  qualityGoodThreshold: integer('QC_QUALITY_GOOD_THRESHOLD', 80, 1, 100),
  qualityNeutralThreshold: integer('QC_QUALITY_NEUTRAL_THRESHOLD', 60, 0, 99),
};

export const validateQcConfig = () => {
  if (!qcConfig.enabled) return;
  const required: Record<string, string> = { S3_ENDPOINT_URL: qcConfig.storageEndpoint,
    S3_ACCESS_KEY: qcConfig.storageAccessKey, S3_SECRET_KEY: qcConfig.storageSecretKey };
  if (qcConfig.workerEnabled) {
    required.NEXARA_API_KEY = qcConfig.nexaraApiKey;
    required.GIGACHAT_AUTH_KEY = qcConfig.gigachatAuthKey;
  }
  for (const [name, value] of Object.entries(required)) {
    if (!value.trim()) throw new Error(`${name} is required when QC_ENABLED=true`);
  }
  validateEndpoint('S3_ENDPOINT_URL', qcConfig.storageEndpoint, true);
  if (qcConfig.workerEnabled) {
    if (qcConfig.sttProvider !== 'nexara' || qcConfig.llmProvider !== 'gigachat') throw new Error('Unsupported QC provider');
    validateEndpoint('NEXARA_BASE_URL', qcConfig.nexaraBaseUrl);
    validateEndpoint('GIGACHAT_BASE_URL', qcConfig.gigachatBaseUrl);
    validateEndpoint('GIGACHAT_AUTH_URL', qcConfig.gigachatAuthUrl);
    if (qcConfig.gigachatCaBundlePath) {
      try {
        const ca = readFileSync(qcConfig.gigachatCaBundlePath, 'utf8');
        if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error();
        createSecureContext({ ca });
      } catch { throw new Error('Invalid GIGACHAT_CA_BUNDLE_PATH: expected a readable PEM certificate bundle'); }
    }
  }
  if (qcConfig.qualityGoodThreshold <= qcConfig.qualityNeutralThreshold) throw new Error('Invalid QC quality thresholds');
  if (qcConfig.workerEnabled && qcConfig.leaseMs <= Math.max(qcConfig.nexaraTimeoutMs, qcConfig.gigachatTimeoutMs) + qcConfig.storageTimeoutMs + 30_000) {
    throw new Error('QC_JOB_LEASE_MS must exceed provider + storage timeout with a 30 second margin');
  }
};
