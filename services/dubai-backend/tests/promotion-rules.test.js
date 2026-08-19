const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const priceItem = (overrides = {}) => ({
  id: 'price_finnish',
  productName: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
  productNameRaw: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a, \u043a\u0430\u0442.\u0412 (\u0432\u0430\u043a.\u0443\u043f.) 0,5 \u043a\u0433',
  productNameClean: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
  normalizedProductName: '\u0441\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0444\u0438\u043d\u0441\u043a\u0438\u0439 \u043f \u043a 1 \u043a\u0433',
  regularPrice: 739,
  ...overrides,
});

test('Finnish servelat invoice name resolves through raw price-list alias', () => {
  const { matchPromotionProduct } = require('../dist/services/promotionProductMatcher');
  const distractor = priceItem({
    id: 'price_kremlin',
    productName: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u041a\u0440\u0435\u043c\u043b\u0435\u0432\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
    productNameRaw: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u041a\u0440\u0435\u043c\u043b\u0435\u0432\u0441\u043a\u0438\u0439 \u043f/\u043a 0,5 \u043a\u0433',
    productNameClean: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u041a\u0440\u0435\u0432\u043b\u0435\u0432\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
  });
  const smallPack = priceItem({
    id: 'price_finnish_300',
    productName: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 300 \u0433.',
    productNameRaw: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 (\u0444\u0430\u0441.300 \u0433, \u0432\u0430\u043a.\u0443\u043f.) \u043f/\u043a, \u043a\u0430\u0442.\u0412, \u0448\u0442',
    productNameClean: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 300 \u0433.',
    regularPrice: 239,
  });

  const match = matchPromotionProduct(
    '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a, \u043a\u0430\u0442.\u0412 (\u0432\u0430\u043a.\u0443\u043f.)',
    [distractor, smallPack, priceItem()],
    539,
  );

  assert.equal(match?.item.id, 'price_finnish');
  assert.equal(match?.item.productNameClean, '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.');
  assert.equal(match?.item.regularPrice, 739);
});

test('product matcher understands processing abbreviations and rejects package conflicts', () => {
  const { matchPromotionProduct } = require('../dist/services/promotionProductMatcher');
  const item = priceItem();

  const expanded = matchPromotionProduct(
    '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u00ab\u0424\u0438\u043d\u0441\u043a\u0438\u0439\u00bb \u043f\u043e\u043b\u0443\u043a\u043e\u043f\u0447\u0435\u043d\u044b\u0439, \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f \u0412, \u0432\u0430\u043a\u0443\u0443\u043c\u043d\u0430\u044f \u0443\u043f\u0430\u043a\u043e\u0432\u043a\u0430',
    [item],
  );
  assert.equal(expanded?.item.id, item.id);

  const wrongPackage = matchPromotionProduct(
    '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 0,7 \u043a\u0433',
    [item],
  );
  assert.equal(wrongPackage, null);
});

test('product matcher leaves package-less aliases ambiguous when two SKUs share a core name', () => {
  const { matchPromotionProduct } = require('../dist/services/promotionProductMatcher');
  const halfKilo = priceItem({
    id: 'price_half',
    productName: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 0,5 \u043a\u0433.',
    productNameClean: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 0,5 \u043a\u0433.',
  });
  const oneKilo = priceItem({
    id: 'price_one',
    productNameRaw: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
  });

  assert.equal(matchPromotionProduct(
    '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a',
    [halfKilo, oneKilo],
  ), null);
});

const promotionDbRow = (overrides = {}) => ({
  id: 'row_invoice',
  row_number: 17,
  status: 'future',
  product_name: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
  start_date: '2026-08-19',
  end_date: '2026-08-31',
  promo_price: 539,
  regular_price: 739,
  price_difference: 200,
  real_discount_percent: 27.06,
  advertising_discount_percent: 30,
  source_document_id: 'invoice_1',
  source_document_file_name: 'invoice.pdf',
  invoice_document_id: 'invoice_1',
  invoice_document_file_name: 'invoice.pdf',
  plan_document_id: null,
  plan_document_file_name: null,
  created_at: '2026-08-14T10:00:00.000Z',
  updated_at: '2026-08-14T10:00:00.000Z',
  ...overrides,
});

test('adjacent plan period extends the existing invoice promotion into one row', async () => {
  const calls = [];
  const opsDbPath = require.resolve('../dist/db/opsDb');
  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        withClient: async (callback) => callback({
          query: async (sql, params = []) => {
            calls.push({ sql, params });
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM promotion_storage_documents')) return { rows: [{ id: 'plan_1' }] };
            if (sql.includes('SELECT aggregate.*') && sql.includes('FOR UPDATE')) {
              return { rows: [promotionDbRow()] };
            }
            if (sql.includes('INSERT INTO promotion_row_intervals')) return { rows: [] };
            if (sql.includes('WITH target_rows AS')) {
              return { rows: [promotionDbRow({ end_date: '2026-09-01', plan_document_id: 'plan_1', plan_document_file_name: 'plan.xlsx' })] };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
        }),
      },
    },
  };
  const repositoryPath = require.resolve('../dist/repositories/promotionRowsRepository');
  delete require.cache[repositoryPath];
  const { upsertPromotionDocumentRows } = require(repositoryPath);

  const result = await upsertPromotionDocumentRows([{
    status: 'future',
    productName: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
    startDate: '2026-09-01',
    endDate: '2026-09-01',
    promoPrice: 539,
    regularPrice: 739,
    sourceDocumentId: 'plan_1',
    sourceDocumentFileName: 'plan.xlsx',
    sourceProductName: '\u0421\u0435\u0440\u0432\u0435\u043b\u0430\u0442 \u0424\u0438\u043d\u0441\u043a\u0438\u0439 \u043f/\u043a 1 \u043a\u0433.',
    sourceLineText: 'plan row',
    priceListItemId: 'price_finnish',
    matchConfidence: 1,
  }], 'plan');

  const lookup = calls.find((call) => call.sql.includes('SELECT aggregate.*'));
  assert.match(lookup.sql, /start_date <= \(\$4::date \+ 1\)/);
  assert.match(lookup.sql, /\$3::date <= \(aggregate\.end_date \+ 1\)/);
  assert.doesNotMatch(lookup.sql, /LIMIT 1/);
  const intervalInsert = calls.find((call) => call.sql.includes('INSERT INTO promotion_row_intervals'));
  assert.deepEqual(intervalInsert.params.slice(2, 5), ['plan_1', 'plan', 'plan.xlsx']);
  const rebuild = calls.find((call) => call.sql.includes('WITH target_rows AS'));
  assert.match(rebuild.sql, /CASE WHEN interval\.source_type = 'invoice' THEN 0 ELSE 1 END/);
  assert.equal(result.length, 1);
  assert.equal(result[0].startDate, '2026-08-19');
  assert.equal(result[0].endDate, '2026-09-01');
});

test('promotion rows and legacy consolidation use chronological, contiguous periods', async () => {
  let listSql = '';
  const opsDbPath = require.resolve('../dist/db/opsDb');
  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: {
      opsDb: {
        query: async (sql) => {
          listSql = sql;
          return { rows: [] };
        },
      },
    },
  };
  const repositoryPath = require.resolve('../dist/repositories/promotionRowsRepository');
  delete require.cache[repositoryPath];
  const { listPromotionRows } = require(repositoryPath);
  await listPromotionRows();

  assert.match(listSql, /ORDER BY start_date ASC NULLS LAST/);
  const migration = fs.readFileSync(
    path.join(__dirname, '../migrations/017_consolidate_contiguous_promotions.sql'),
    'utf8',
  );
  assert.match(migration, /start_date > previous_max_end \+ 1/);
  assert.match(migration, /price\.regular_price >= row_cores\.promo_price/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS promotion_row_intervals/);
  assert.match(migration, /MIN\(start_date\) AS start_date/);
  assert.match(migration, /MAX\(end_date\) AS end_date/);
  assert.ok(migration.indexOf('INSERT INTO promotion_row_intervals') < migration.indexOf('CREATE TEMP TABLE promotion_row_merge_map'));
  assert.match(migration, /UPDATE promotion_row_intervals interval[\s\S]*promotion_row_id = map\.survivor_id/);
  assert.match(migration, /DELETE FROM promotion_table_rows row/);
});
