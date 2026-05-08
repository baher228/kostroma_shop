import { promises as fs } from 'fs';
import path from 'path';
import { opsDb } from './opsDb';

const migrationsDir = path.resolve(__dirname, '../migrations');

export const runMigrations = async (closeConnection = false) => {
  await opsDb.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const appliedResult = await opsDb.query<{ name: string }>('SELECT name FROM schema_migrations;');
  const applied = new Set(appliedResult.rows.map((row) => row.name));

  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) {
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, fileName), 'utf8');
    await opsDb.query('BEGIN;');
    try {
      await opsDb.query(sql);
      await opsDb.query('INSERT INTO schema_migrations(name) VALUES($1);', [fileName]);
      await opsDb.query('COMMIT;');
      console.log(`Applied migration: ${fileName}`);
    } catch (error) {
      await opsDb.query('ROLLBACK;');
      throw error;
    }
  }

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
