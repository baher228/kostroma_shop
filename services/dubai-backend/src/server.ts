import { config } from './config/config';
import { createDubaiApp } from './app/dubaiApp';
import { runMigrations } from './db/migrate';

const startServer = async () => {
  await runMigrations();
  const app = createDubaiApp();
  app.listen(config.port, () => {
    console.log(`Dubai backend started on port ${config.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
