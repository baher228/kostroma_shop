const assert = require('node:assert/strict');
const test = require('node:test');

test('shop and product management repositories write editable fields', async () => {
  const calls = [];
  const opsDbPath = require.resolve('../dist/db/opsDb');

  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async (sql, params = []) => {
          calls.push({ sql, params });
          if (sql.includes('UPDATE shops')) {
            return { rows: [{ id: params[2], name: params[0], machine_number: params[1] }] };
          }
          if (sql.includes('UPDATE stock_products')) {
            return {
              rows: [{
                id: params[9],
                name: params[0],
                category: params[1],
                pack_type: params[2],
                units_in_pack: params[3],
                pack_weight_kg: params[4],
                shelf_life_days: params[5],
                unit_price_rub_vat: params[6],
                min_stock_units: params[7],
                max_stock_units: params[8],
              }],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/stockRepository')];
  const { updateProduct, updateShop } = require('../dist/repositories/stockRepository');

  const shop = await updateShop('shop_main', { name: 'Main shop', machineNumber: 2 });
  assert.equal(shop.machineNumber, 2);

  const product = await updateProduct('prod_1', {
    name: 'Milk',
    category: '\u041c\u043e\u043b\u043e\u043a\u043e',
    packType: 'box',
    unitsInPack: 6,
    packWeightKg: 5.58,
    shelfLifeDays: 14,
    unitPriceRubVat: 68.61,
    minStockUnits: 1,
    maxStockUnits: 12,
  });
  assert.equal(product.name, 'Milk');
  assert.match(calls.find((call) => call.sql.includes('UPDATE stock_products')).sql, /unit_price_rub_vat/);
});

test('seller order status update returns resolved order details', async () => {
  const opsDbPath = require.resolve('../dist/db/opsDb');
  let callCount = 0;

  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async (sql, params = []) => {
          callCount += 1;
          if (sql.includes('UPDATE seller_orders')) {
            assert.equal(params[0], 'processed');
            return {
              rows: [{
                id: params[1],
                shop_id: 'shop_main',
                shop_name: null,
                product_id: 'prod_1',
                product_name: 'Milk',
                stock_on_hand: 2,
                requested_packs: 1,
                requested_units: 6,
                auto_suggested: false,
                order_date: '2026-05-02',
                status: 'processed',
                created_at: '2026-05-13T10:00:00.000Z',
              }],
            };
          }
          if (sql.includes('FROM seller_orders o')) {
            return {
              rows: [{
                id: params[0],
                shop_id: 'shop_main',
                shop_name: 'Main shop',
                product_id: 'prod_1',
                product_name: 'Milk',
                stock_on_hand: 2,
                requested_packs: 1,
                requested_units: 6,
                auto_suggested: false,
                order_date: '2026-05-02',
                status: 'processed',
                created_at: '2026-05-13T10:00:00.000Z',
              }],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/ordersRepository')];
  const { updateSellerOrderStatus } = require('../dist/repositories/ordersRepository');

  const order = await updateSellerOrderStatus(
    { role: 'manager', shopIds: [], scopes: ['orders:write'], jti: 'jti_1' },
    'order_1',
    'processed',
  );
  assert.equal(order.status, 'processed');
  assert.equal(order.productName, 'Milk');
  assert.equal(callCount, 2);
});

test('seller order creation writes through to order sheet values', async () => {
  const opsDbPath = require.resolve('../dist/db/opsDb');
  const calls = [];

  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async (sql, params = []) => {
          calls.push({ sql, params });
          if (sql.includes('FROM shops')) {
            return { rows: [{ id: params[0] }] };
          }
          if (sql.includes('FROM stock_products')) {
            return { rows: [{ id: params[0] }] };
          }
          if (sql.includes('WITH inserted AS')) {
            assert.match(sql, /INSERT INTO seller_orders/);
            assert.match(sql, /INSERT INTO order_sheet_values/);
            assert.match(sql, /packs = EXCLUDED\.packs/);
            assert.equal(params[7], '2026-05-02');
            return {
              rows: [{
                id: params[0],
                shop_id: params[1],
                shop_name: null,
                product_id: params[2],
                product_name: 'Milk',
                stock_on_hand: params[3],
                requested_packs: params[4],
                requested_units: params[5],
                auto_suggested: params[6],
                order_date: params[7],
                status: 'new',
                created_at: '2026-05-01T10:00:00.000Z',
              }],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/ordersRepository')];
  const { createSellerOrder, nearestOrderSheetDate } = require('../dist/repositories/ordersRepository');

  assert.equal(nearestOrderSheetDate(new Date(2026, 3, 27)), '2026-04-28');
  assert.equal(nearestOrderSheetDate(new Date(2026, 3, 30)), '2026-05-02');

  const order = await createSellerOrder(
    { role: 'worker', shopIds: ['shop_main'], scopes: ['orders:write'], jti: 'jti_1' },
    {
      shopId: 'shop_main',
      productId: 'prod_1',
      stockOnHand: 2,
      requestedPacks: 3,
      requestedUnits: 18,
      autoSuggested: true,
      orderDate: '2026-05-02',
    },
  );

  assert.equal(order.productName, 'Milk');
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO seller_orders')).length, 1);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO order_sheet_values')).length, 1);
});

test('bulk seller order creation replaces the full shop/date order in one transaction', async () => {
  const opsDbPath = require.resolve('../dist/db/opsDb');
  const calls = [];

  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async () => {
          throw new Error('Expected transactional client');
        },
        withClient: async (callback) => {
          const client = {
            query: async (sql, params = []) => {
              calls.push({ sql, params });
              if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
              }
              if (sql.includes('FROM shops')) {
                return { rows: [{ id: params[0] }] };
              }
              if (sql.includes('FROM stock_products')) {
                return { rows: params[0].map((id) => ({ id })) };
              }
              if (sql.includes('DELETE FROM order_sheet_values')) {
                return { rows: [] };
              }
              if (sql.includes('INSERT INTO order_sheet_values')) {
                return { rows: [] };
              }
              if (sql.includes('WITH inserted AS')) {
                return {
                  rows: [{
                    id: params[0],
                    shop_id: params[1],
                    shop_name: 'Main shop',
                    product_id: params[2],
                    product_name: params[2] === 'prod_1' ? 'Milk' : 'Kefir',
                    stock_on_hand: params[3],
                    requested_packs: params[4],
                    requested_units: params[5],
                    auto_suggested: params[6],
                    order_date: params[7],
                    status: 'new',
                    created_at: '2026-05-01T10:00:00.000Z',
                  }],
                };
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
          return callback(client);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/ordersRepository')];
  const { createSellerOrderBulk } = require('../dist/repositories/ordersRepository');

  const orders = await createSellerOrderBulk(
    { role: 'worker', shopIds: ['shop_main'], scopes: ['orders:write'], jti: 'jti_1' },
    {
      shopId: 'shop_main',
      orderDate: '2026-05-02',
      items: [
        { productId: 'prod_1', stockOnHand: 2, requestedPacks: 3, requestedUnits: 18, autoSuggested: true },
        { productId: 'prod_2', stockOnHand: 1, requestedPacks: 2, requestedUnits: 12, autoSuggested: false },
      ],
    },
  );

  assert.equal(orders.length, 2);
  assert.equal(orders[0].orderDate, '2026-05-02');
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(calls.filter((call) => call.sql.includes('DELETE FROM order_sheet_values')).length, 1);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO order_sheet_values')).length, 2);
});

test('bulk seller order creation rolls back before writes when products are invalid', async () => {
  const opsDbPath = require.resolve('../dist/db/opsDb');
  const calls = [];

  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async () => {
          throw new Error('Expected transactional client');
        },
        withClient: async (callback) => {
          const client = {
            query: async (sql, params = []) => {
              calls.push({ sql, params });
              if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
              }
              if (sql.includes('FROM shops')) {
                return { rows: [{ id: params[0] }] };
              }
              if (sql.includes('FROM stock_products')) {
                return { rows: [] };
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
          return callback(client);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/ordersRepository')];
  const { createSellerOrderBulk } = require('../dist/repositories/ordersRepository');

  const orders = await createSellerOrderBulk(
    { role: 'worker', shopIds: ['shop_main'], scopes: ['orders:write'], jti: 'jti_1' },
    {
      shopId: 'shop_main',
      orderDate: '2026-05-02',
      items: [{ productId: 'missing', stockOnHand: 2, requestedPacks: 3, requestedUnits: 18, autoSuggested: true }],
    },
  );

  assert.equal(orders, null);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.equal(calls.some((call) => call.sql.includes('DELETE FROM order_sheet_values')), false);
});
