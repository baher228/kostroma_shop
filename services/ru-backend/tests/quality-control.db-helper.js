const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { runSqlMigrations } = require('../../shared/migrations');

// Execute real PostgreSQL SQL in a disposable embedded engine. Serialize whole
// transactions because this engine has one connection; this does not simulate
// independent PostgreSQL sessions or prove SKIP LOCKED behavior across servers.
async function createQcTestDatabase() {
  const engine = new PGlite();
  let pending = Promise.resolve();
  const serialized = (operation) => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  const execute = async (sql, values = []) => {
    const result = values.length
      ? await engine.query(sql, values)
      : (await engine.exec(sql)).at(-1);
    return { rows: result?.rows ?? [], rowCount: result?.rowCount ?? (result?.affectedRows || result?.rows?.length || 0) };
  };
  const client = { query: execute, release() {} };
  const db = {
    query: (sql, values) => serialized(() => execute(sql, values)),
    withClient: (callback) => serialized(() => callback(client)),
    close: () => serialized(() => engine.close()),
  };
  const migrate = () => runSqlMigrations({
    db,
    migrationsDir: path.resolve(__dirname, '../migrations'),
    lockId: 30001,
    label: 'QC test',
  });
  await migrate();
  return { db, migrate };
}

module.exports = { createQcTestDatabase };
