import { config } from './config/config';
import { runMigrations } from './db/migrate';
import { createRussiaApp } from './app/russiaApp';

const startServer = async () => {
  await runMigrations();
  const app = createRussiaApp();
  app.listen(config.port, () => {
    console.log(`RU backend started on port ${config.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
