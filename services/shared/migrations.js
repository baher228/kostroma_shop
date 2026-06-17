const { promises: fs } = require('fs');
const path = require('path');

exports.runSqlMigrations = async ({ db, migrationsDir, lockId, label }) => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  await db.withClient(async (client) => {
    await client.query('SELECT pg_advisory_lock($1);', [lockId]);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      const appliedResult = await client.query('SELECT name FROM schema_migrations;');
      const applied = new Set(appliedResult.rows.map((row) => row.name));

      for (const fileName of migrationFiles) {
        if (applied.has(fileName)) {
          continue;
        }
        const sql = await fs.readFile(path.join(migrationsDir, fileName), 'utf8');
        await client.query('BEGIN;');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations(name) VALUES($1);', [fileName]);
          await client.query('COMMIT;');
          console.log(`Applied migration${label ? ` (${label})` : ''}: ${fileName}`);
        } catch (error) {
          await client.query('ROLLBACK;');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1);', [lockId]);
    }
  });
};
