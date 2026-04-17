import { createApp } from './app';
import { config } from './config';
import { runMigrations } from './migrate';

const startServer = async () => {
  await runMigrations();
  createApp().listen(config.port, () => {
    console.log(`Backend started on port ${config.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
