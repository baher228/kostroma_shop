import { promises as fs } from 'fs';
import path from 'path';
import { opsDb } from './opsDb';
import { runSqlMigrations } from '../../../shared/migrations';

const migrationsDir = path.resolve(__dirname, '../../migrations');
const MIGRATION_LOCK_ID = 40_001;

export const runMigrations = async (closeConnection = false) => {
  await fs.access(migrationsDir);
  await runSqlMigrations({ db: opsDb, migrationsDir, lockId: MIGRATION_LOCK_ID, label: 'dubai' });

  if (closeConnection) {
    await opsDb.close();
  }
};

if (require.main === module) {
  runMigrations(true)
    .then(() => {
      console.log('Dubai migrations completed.');
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Migration failed:', error);
      await opsDb.close().catch(() => {});
      process.exit(1);
    });
}
