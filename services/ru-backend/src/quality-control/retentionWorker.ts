import { qcConfig } from './config';
import { MinioQcStorage } from './storage';
import type { QcStorage } from './types';
import { QualityControlRepository } from '../repositories/qualityControlRepository';

export class QualityControlRetentionWorker {
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private active: Promise<number> | undefined;

  constructor(private readonly repository: Pick<QualityControlRepository, 'claimExpiredMedia' | 'markMediaDeleted' | 'releaseMediaDeleteClaim'>,
    private readonly storage: QcStorage, private readonly intervalMs: number, private readonly batchSize: number) {}

  async runOnce(): Promise<number> {
    const expired = await this.repository.claimExpiredMedia(this.batchSize);
    let deleted = 0;
    for (const { media, claimToken } of expired) {
      try {
        await this.storage.remove(media.storageKey);
        await this.repository.markMediaDeleted(media.id, claimToken);
        deleted += 1;
      } catch {
        await this.repository.releaseMediaDeleteClaim(media.id, claimToken).catch(() => undefined);
        console.warn(`QC retention cleanup failed mediaId=${media.id} code=STORAGE_DELETE_FAILED`);
      }
    }
    return deleted;
  }

  start() {
    if (this.timer || this.active) return;
    this.stopping = false;
    const tick = async () => {
      if (this.stopping) return;
      try { this.active = this.runOnce(); await this.active; }
      catch { console.warn('QC retention cleanup failed code=QC_RETENTION_UNAVAILABLE'); }
      finally { this.active = undefined; }
      if (!this.stopping) this.timer = setTimeout(tick, this.intervalMs);
    };
    this.timer = setTimeout(tick, 0);
  }

  async stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.active;
  }
}

export const createQualityControlRetentionWorker = () => new QualityControlRetentionWorker(
  new QualityControlRepository(),
  new MinioQcStorage({
    endpoint: qcConfig.storageEndpoint, accessKey: qcConfig.storageAccessKey, secretKey: qcConfig.storageSecretKey,
    bucket: qcConfig.storageBucket, region: qcConfig.storageRegion, maxAudioBytes: qcConfig.maxUploadBytes,
    timeoutMs: qcConfig.storageTimeoutMs,
  }),
  qcConfig.retentionCleanupIntervalMs,
  qcConfig.retentionCleanupBatchSize,
);
