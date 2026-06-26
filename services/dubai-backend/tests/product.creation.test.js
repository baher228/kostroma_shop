const assert = require('node:assert/strict');
const test = require('node:test');

test('createProduct writes the full product metadata payload', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const opsDbPath = require.resolve('../dist/db/opsDb');

  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async (sql, params) => {
          capturedSql = sql;
          capturedParams = params;
          return {
            rows: [{
              id: params[0],
              name: params[1],
              business_category: params[2],
              category: params[3],
              pack_type: params[4],
              units_in_pack: params[5],
              pack_weight_kg: params[6],
              shelf_life_days: params[7],
              unit_price_rub_vat: params[8],
              min_stock_units: params[9],
              max_stock_units: params[10],
            }],
          };
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/stockRepository')];
  const { createProduct } = require('../dist/repositories/stockRepository');

  const product = await createProduct({
    name: 'Творог 5%',
    category: 'Творог',
    packType: 'стакан',
    unitsInPack: 12,
    packWeightKg: 3,
    shelfLifeDays: 10,
    unitPriceRubVat: 91.25,
    minStockUnits: 2,
    maxStockUnits: 18,
  });

  assert.match(capturedSql, /pack_type/);
  assert.match(capturedSql, /unit_price_rub_vat/);
  assert.deepEqual(capturedParams.slice(1), ['Творог 5%', 'Молоко', 'Творог', 'стакан', 12, 3, 10, 91.25, 2, 18]);
  assert.equal(product.packType, 'стакан');
  assert.equal(product.unitsInPack, 12);
  assert.equal(product.packWeightKg, 3);
  assert.equal(product.shelfLifeDays, 10);
  assert.equal(product.unitPriceRubVat, 91.25);
  assert.equal(product.minStockUnits, 2);
  assert.equal(product.maxStockUnits, 18);
});
