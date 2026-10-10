const assert = require('node:assert/strict');
const test = require('node:test');
const { createTransactionalOpsDatabase } = require('../dist/db/opsDb');

const harness = () => {
  const sessions = [];
  const outside = [];
  const database = {
    query: async (sql) => { outside.push(sql); return { rows: [] }; },
    close: async () => {},
    withClient: async (callback) => {
      const calls = [];
      sessions.push(calls);
      return callback({ query: async (sql) => { calls.push(sql); return { rows: [] }; } });
    },
  };
  return { ...createTransactionalOpsDatabase(database), sessions, outside };
};

test('import repositories share outer transaction and nested commits release savepoints', async () => {
  const db = harness();
  await db.withOpsTransaction(async () => {
    await db.opsDb.query('CREATE DOCUMENT');
    await db.opsDb.withClient(async (client) => {
      await client.query('BEGIN');
      await client.query('PERSIST ROWS');
      await client.query('COMMIT');
    });
  });
  assert.equal(db.sessions.length, 1);
  assert.deepEqual(db.sessions[0].filter((sql) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)), ['BEGIN', 'COMMIT']);
  assert.match(db.sessions[0][2], /^SAVEPOINT promotion_import_\d+$/);
  assert.match(db.sessions[0][4], /^RELEASE SAVEPOINT promotion_import_\d+$/);
  assert.deepEqual(db.outside, []);
});

test('parser failure rolls back savepoint and entire document transaction while preserving original error', async () => {
  const db = harness();
  const original = new Error('parser failure');
  await assert.rejects(db.withOpsTransaction(async () => {
    await db.opsDb.query('CREATE DOCUMENT');
    await db.opsDb.withClient(async (client) => {
      await client.query('BEGIN');
      await client.query('UPDATE OLD PRICE');
      await client.query('ROLLBACK');
      throw original;
    });
  }), (error) => error === original);
  assert.match(db.sessions[0].at(-2), /^ROLLBACK TO SAVEPOINT/);
  assert.equal(db.sessions[0].at(-1), 'ROLLBACK');
  assert.ok(!db.sessions[0].includes('COMMIT'));
});

test('concurrent requests and parallel imports do not share AsyncLocalStorage clients', async () => {
  const db = harness();
  let resume;
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const barrier = new Promise((resolve) => { resume = resolve; });
  const first = db.withOpsTransaction(async () => {
    await db.opsDb.query('FIRST BEFORE'); entered(); await barrier;
    await db.opsDb.query('FIRST AFTER');
  });
  await ready;
  await db.opsDb.query('UNRELATED REQUEST');
  await db.withOpsTransaction(async () => db.opsDb.query('SECOND IMPORT'));
  resume(); await first;
  assert.deepEqual(db.outside, ['UNRELATED REQUEST']);
  assert.deepEqual(db.sessions, [['BEGIN', 'FIRST BEFORE', 'FIRST AFTER', 'COMMIT'], ['BEGIN', 'SECOND IMPORT', 'COMMIT']]);
  await db.opsDb.query('AFTER IMPORT');
  assert.equal(db.outside.at(-1), 'AFTER IMPORT');
});

test('commit connection error keeps original failure when rollback also fails', async () => {
  const original = Object.assign(new Error('commit connection lost'), { code: 'ECONNRESET' });
  const db = createTransactionalOpsDatabase({
    query: async () => ({ rows: [] }), close: async () => {},
    withClient: async (callback) => callback({ query: async (sql) => {
      if (sql === 'COMMIT') throw original;
      if (sql === 'ROLLBACK') throw new Error('rollback connection lost');
      return { rows: [] };
    } }),
  });
  await assert.rejects(db.withOpsTransaction(async () => 1), (error) => error === original);
});
