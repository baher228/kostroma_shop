import { randomUUID } from 'node:crypto';
import { qcConfig, validateQcConfig } from './config';
import { MinioQcStorage } from './storage';

// Exercise the actual S3 permissions without a database or paid AI request.
const check = async () => {
  validateQcConfig();
  if (!qcConfig.enabled) {
    console.log('QC storage check skipped: QC disabled');
    return;
  }
  const storage = new MinioQcStorage({
    endpoint: qcConfig.storageEndpoint, accessKey: qcConfig.storageAccessKey,
    secretKey: qcConfig.storageSecretKey, bucket: qcConfig.storageBucket,
    region: qcConfig.storageRegion, maxAudioBytes: 1024, timeoutMs: 10_000,
  });
  const key = `quality-control/healthchecks/${randomUUID()}`;
  const marker = Buffer.from('ai-qc-storage-preflight');
  let removed = false;
  try {
    await storage.put(key, marker, 'text/plain');
    if (!(await storage.get(key)).equals(marker)) throw new Error('Storage data mismatch');
    await storage.remove(key);
    removed = true;
    console.log('QC storage read/write/delete check passed');
  } finally {
    if (!removed) await storage.remove(key).catch(() => undefined);
  }
};

check().catch(() => {
  console.error('QC storage check failed. Check endpoint, bucket and object permissions.');
  process.exitCode = 1;
});
