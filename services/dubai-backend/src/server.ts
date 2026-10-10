import { config } from './config/config';
import { createDubaiApp } from './app/dubaiApp';
import { runMigrations } from './db/migrate';
import { startGmailPoller, stopGmailPoller } from './gmail/gmailPoller';
import { opsDb } from './db/opsDb';
import { recoverGmailImportObjects, withGmailPollLock } from './repositories/gmailImportsRepository';

const startServer = async () => {
  await runMigrations();
  // Pending source objects may outlive an interrupted web upload even when
  // Gmail is disabled. Cleanup failures do not prevent other routes starting.
  await withGmailPollLock(async () => { await recoverGmailImportObjects(); return true; })
    .catch(() => console.warn('promotion import cleanup deferred until the next startup or Gmail poll'));
  const app = createDubaiApp();
  const server = app.listen(config.port, () => {
    console.log(`Dubai backend started on port ${config.port}`);
    startGmailPoller();
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const deadline = setTimeout(() => process.exit(1),30000);
    deadline.unref();
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    void Promise.all([closed,stopGmailPoller()]).then(() => opsDb.close()).then(() => {
      clearTimeout(deadline); process.exit(0);
    }).catch(() => process.exit(1));
  };
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
