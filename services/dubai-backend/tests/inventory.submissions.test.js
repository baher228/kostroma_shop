const assert = require('node:assert/strict');
const test = require('node:test');

test('inventory and markdown read and update independent product prices, including zero and cleared prices', async () => {
  const calls = [];
  const product = {
    id: 'prod_a', name: 'Milk', business_category: 'Молоко', category: 'Молоко',
    pack_type: 'box', units_in_pack: 6, pack_weight_kg: '3', shelf_life_days: 10,
    unit_price_rub_vat: '60', min_stock_units: 1, max_stock_units: 12,
    inventory_price_rub: '80.50', markdown_price_rub: '25.75',
  };
  const opsDbPath = require.resolve('../dist/db/opsDb');
  const repositoryPath = require.resolve('../dist/repositories/stockRepository');
  const originalDb = require.cache[opsDbPath];
  const originalRepository = require.cache[repositoryPath];
  require.cache[opsDbPath] = {
    id: opsDbPath, filename: opsDbPath, loaded: true,
    exports: { opsDb: { query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM shops')) return { rows: [{ id: 'shop_a', name: 'Shop A', machine_number: 1 }] };
      if (sql.includes('FROM stock_products') || sql.includes('UPDATE stock_products')) return { rows: [product] };
      if (/FROM (inventory_values|markdown_values|inventory_counts|inventory_submissions|stock_product_subcategories)/.test(sql)) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    } } },
  };
  delete require.cache[repositoryPath];
  try {
    const { getStockTable, updateProductMeta } = require('../dist/repositories/stockRepository');
    const viewer = { role: 'worker', shopIds: ['shop_a'], scopes: ['stock:read'], jti: 'tablet' };
    const params = { businessCategory: 'Молоко', from: '2026-11-20', to: '2026-11-20' };
    const readPrice = async (kind) => (await getStockTable(viewer, { ...params, kind })).rows[0].inventoryPrice;
    assert.equal(await readPrice('inventory'), 80.5);
    assert.equal(await readPrice('markdown'), 25.75);
    product.markdown_price_rub = '0';
    assert.equal(await readPrice('markdown'), 0);
    product.markdown_price_rub = null;
    assert.equal(await readPrice('markdown'), null);
    assert.equal(await readPrice('inventory'), 80.5);

    for (const [patch, column, value, otherColumn] of [
      [{ markdownPrice: 25.75 }, 'markdown_price_rub', 25.75, 'inventory_price_rub'],
      [{ inventoryPrice: 90 }, 'inventory_price_rub', 90, 'markdown_price_rub'],
      [{ markdownPrice: 0 }, 'markdown_price_rub', 0, 'inventory_price_rub'],
      [{ markdownPrice: null }, 'markdown_price_rub', null, 'inventory_price_rub'],
    ]) {
      calls.length = 0;
      await updateProductMeta('prod_a', patch);
      assert.equal(calls.length, 1);
      assert.match(calls[0].sql, new RegExp(`SET ${column} = \\$1`));
      assert.doesNotMatch(calls[0].sql, new RegExp(otherColumn));
      assert.deepEqual(calls[0].params, [value, 'prod_a']);
    }
  } finally {
    if (originalDb) require.cache[opsDbPath] = originalDb;
    else delete require.cache[opsDbPath];
    if (originalRepository) require.cache[repositoryPath] = originalRepository;
    else delete require.cache[repositoryPath];
  }
});

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
  assert.match(insert.sql, /'inventoryPrice', products\.inventory_price_rub/);
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
  assert.match(markdownInsert.sql, /'inventoryPrice', products\.markdown_price_rub/);
  assert.doesNotMatch(markdownInsert.sql, /inventory_price_rub/);
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
