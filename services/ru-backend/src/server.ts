import { config } from './config/config';
import { runMigrations } from './db/migrate';
import { personalDb } from './db/personalDb';
import { createRussiaApp } from './app/russiaApp';
import { cleanupExpiredTaskPhotos } from './services/taskService';
import { qcConfig, validateQcConfig } from './quality-control/config';
import { createQualityControlWorker } from './quality-control/worker';
import { createQualityControlRetentionWorker } from './quality-control/retentionWorker';

const startServer = async () => {
  await runMigrations();
  void cleanupExpiredTaskPhotos().catch((error) => {
    console.error('Failed to clean up expired task photos:', error);
  });
  setInterval(() => {
    void cleanupExpiredTaskPhotos().catch((error) => {
      console.error('Failed to clean up expired task photos:', error);
    });
  }, 5 * 60 * 1000).unref();
  validateQcConfig();
  const app = createRussiaApp();
  const worker = qcConfig.enabled && qcConfig.workerEnabled ? createQualityControlWorker() : null;
  const retentionWorker = qcConfig.enabled ? createQualityControlRetentionWorker() : null;
  const server = app.listen(config.port, () => {
    console.log(`RU backend started on port ${config.port}`);
    worker?.start();
    retentionWorker?.start();
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    await worker?.stop();
    await retentionWorker?.stop();
    await closed;
    await personalDb.close();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
