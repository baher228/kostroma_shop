const assert = require('node:assert/strict');
const test = require('node:test');

test('inventory submissions snapshot selected day and return the latest earlier submission', async () => {
  const captured = [];
  const opsDbPath = require.resolve('../dist/db/opsDb');
  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async (sql, params = []) => {
          captured.push({ sql, params });
          if (sql.includes('FROM shops')) {
            return { rows: [{ id: 'shop_a', name: 'Shop A', machine_number: 1 }] };
          }
          if (sql.includes('INSERT INTO inventory_submissions')) {
            return {
              rows: [{
                id: '15',
                day_date: '2026-11-20',
                submitted_at: '2026-11-20T12:30:00.000Z',
                snapshot: [{ productId: 'prod_a', name: 'Молоко', inventoryPrice: 80, quantity: 3 }],
              }],
            };
          }
          if (sql.includes('FROM inventory_submissions')) {
            return {
              rows: [{
                id: '12',
                day_date: '2026-11-18',
                submitted_at: '2026-11-18T09:15:00.000Z',
                snapshot: [{ productId: 'prod_a', name: 'Молоко', inventoryPrice: 80, quantity: null }],
              }],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };
  const repositoryPath = require.resolve('../dist/repositories/stockRepository');
  delete require.cache[repositoryPath];
  const { createInventorySubmission, getPreviousInventorySubmission } = require('../dist/repositories/stockRepository');
  const viewer = { role: 'worker', shopIds: ['shop_a'], scopes: ['stock:read', 'stock:write'], jti: 'tablet' };

  const created = await createInventorySubmission(viewer, {
    businessCategory: 'Молоко',
    dayDate: '2026-11-20',
  });
  assert.deepEqual(created, {
    id: '15',
    dayDate: '2026-11-20',
    submittedAt: '2026-11-20T12:30:00.000Z',
    items: [{ productId: 'prod_a', name: 'Молоко', inventoryPrice: 80, quantity: 3 }],
  });
  const insert = captured.find(({ sql }) => sql.includes('INSERT INTO inventory_submissions'));
  assert.deepEqual(insert.params, ['shop_a', 'Молоко', '2026-11-20', 'inventory']);
  assert.match(insert.sql, /LEFT JOIN inventory_values inventory_value/);
  assert.match(insert.sql, /jsonb_agg/);
  assert.match(insert.sql, /inventory_value\.day_date = \$3::date/);

  const previous = await getPreviousInventorySubmission(viewer, {
    businessCategory: 'Молоко',
    beforeDate: '2026-11-20',
  });
  assert.equal(previous.dayDate, '2026-11-18');
  assert.equal(previous.items[0].quantity, null);
  const previousQuery = captured.find(({ sql }) => sql.includes('FROM inventory_submissions'));
  assert.match(previousQuery.sql, /day_date < \$3::date/);
  assert.match(previousQuery.sql, /ORDER BY day_date DESC, submitted_at DESC, id DESC/);
  assert.match(previousQuery.sql, /AND kind = \$4/);
  assert.deepEqual(previousQuery.params, ['shop_a', 'Молоко', '2026-11-20', 'inventory']);

  captured.length = 0;
  await createInventorySubmission(viewer, { businessCategory: 'Молоко', dayDate: '2026-11-20', kind: 'markdown' });
  const markdownInsert = captured.find(({ sql }) => sql.includes('INSERT INTO inventory_submissions'));
  assert.deepEqual(markdownInsert.params, ['shop_a', 'Молоко', '2026-11-20', 'markdown']);
  assert.match(markdownInsert.sql, /LEFT JOIN markdown_values inventory_value/);
  await getPreviousInventorySubmission(viewer, { businessCategory: 'Молоко', beforeDate: '2026-11-20', kind: 'markdown' });
  const markdownPrevious = captured.find(({ sql }) => sql.includes('FROM inventory_submissions') && !sql.includes('INSERT'));
  assert.deepEqual(markdownPrevious.params, ['shop_a', 'Молоко', '2026-11-20', 'markdown']);

  const queryCount = captured.length;
  assert.equal(await createInventorySubmission(viewer, {
    shopId: 'shop_b',
    businessCategory: 'Молоко',
    dayDate: '2026-11-20',
  }), null);
  assert.equal(captured.length, queryCount);
});
