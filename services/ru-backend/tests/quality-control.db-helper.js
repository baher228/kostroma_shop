const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { runSqlMigrations } = require('../../shared/migrations');

// Execute real PostgreSQL SQL in a disposable embedded engine. Serialize whole
// transactions because this engine has one connection; this does not simulate
// independent PostgreSQL sessions or prove SKIP LOCKED behavior across servers.
async function createQcTestDatabase() {
  if (process.env.QC_TEST_DATABASE_URL) {
    const target = new URL(process.env.QC_TEST_DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.endsWith('_test')) {
      throw new Error('QC integration tests require a disposable local database ending in _test.');
    }
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: target.toString() });
    const db = {
      query: (sql, values) => pool.query(sql, values),
      withClient: async callback => {
        const client = await pool.connect();
        try { return await callback(client); } finally { client.release(); }
      },
      close: () => pool.end(),
    };
    const migrate = () => runSqlMigrations({ db, migrationsDir: path.resolve(__dirname, '../migrations'), lockId: 30001, label: 'QC PostgreSQL test' });
    await migrate();
    return { db, migrate };
  }
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
