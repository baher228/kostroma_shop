import { promises as fs } from 'fs';
import path from 'path';
import { personalDb } from './personalDb';
import { runSqlMigrations } from '../../../shared/migrations';

const migrationsDir = path.resolve(__dirname, '../migrations');
const MIGRATION_LOCK_ID = 30_001;

export const runMigrations = async (closeConnection = false) => {
  await fs.access(migrationsDir);
  await runSqlMigrations({ db: personalDb, migrationsDir, lockId: MIGRATION_LOCK_ID, label: 'ru' });

  if (closeConnection) {
    await personalDb.close();
  }
};

if (require.main === module) {
  runMigrations(true)
    .then(() => {
      console.log('RU migrations completed.');
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Migration failed:', error);
      await personalDb.close().catch(() => {});
      process.exit(1);
    });
}
