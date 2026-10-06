import { config } from './config/config';
import { runMigrations } from './db/migrate';
import { createRussiaApp } from './app/russiaApp';
import { cleanupExpiredTaskPhotos } from './services/taskService';
import { sendTaskDeadlineReminders } from './services/notificationService';

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
  setInterval(() => {
    void sendTaskDeadlineReminders().catch((error) => {
      console.error('Failed to send task deadline reminders:', error);
    });
  }, 30 * 1000).unref();
  const app = createRussiaApp();
  app.listen(config.port, () => {
    console.log(`RU backend started on port ${config.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
