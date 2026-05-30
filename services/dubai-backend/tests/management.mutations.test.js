const assert = require('node:assert/strict');
const test = require('node:test');

test('shop and product management stores write editable fields', async () => {
  const calls = [];
  const opsDbPath = require.resolve('../dist/opsDb');

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

  delete require.cache[require.resolve('../dist/store')];
  const { updateProduct, updateShop } = require('../dist/store');

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
  const opsDbPath = require.resolve('../dist/opsDb');
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
                product_name: '',
                stock_on_hand: 2,
                requested_packs: 1,
                requested_units: 6,
                auto_suggested: false,
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

  delete require.cache[require.resolve('../dist/ordersStore')];
  const { updateSellerOrderStatus } = require('../dist/ordersStore');

  const order = await updateSellerOrderStatus(
    { role: 'manager', shopIds: [], scopes: ['orders:write'], jti: 'jti_1' },
    'order_1',
    'processed',
  );
  assert.equal(order.status, 'processed');
  assert.equal(order.productName, 'Milk');
  assert.equal(callCount, 2);
});
