import '../config/config';

const integer = (name: string, fallback: number, min = 1, max = 2_147_483_647): number => {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
};

export const qcConfig = {
  enabled: process.env.QC_ENABLED === 'true',
  workerEnabled: process.env.QC_WORKER_ENABLED !== 'false',
  pollIntervalMs: integer('QC_POLL_INTERVAL_MS', 2000),
  maxAttempts: integer('QC_MAX_ATTEMPTS', 3, 1, 10),
  retryBaseMs: integer('QC_RETRY_BASE_MS', 5000),
  leaseMs: integer('QC_JOB_LEASE_MS', 900_000, 10_000),
  maxUploadBytes: integer('QC_MAX_UPLOAD_BYTES', 50 * 1024 * 1024, 1024, 200 * 1024 * 1024),
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
  gigachatModel: process.env.GIGACHAT_MODEL || 'GigaChat-2-Max',
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
    if (!value) throw new Error(`${name} is required when QC_ENABLED=true`);
  }
  if (qcConfig.qualityGoodThreshold <= qcConfig.qualityNeutralThreshold) throw new Error('Invalid QC quality thresholds');
  if (qcConfig.workerEnabled && qcConfig.leaseMs <= Math.max(qcConfig.nexaraTimeoutMs, qcConfig.gigachatTimeoutMs) + qcConfig.storageTimeoutMs + 30_000) {
    throw new Error('QC_JOB_LEASE_MS must exceed provider + storage timeout with a 30 second margin');
  }
};
