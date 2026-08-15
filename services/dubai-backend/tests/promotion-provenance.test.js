const assert = require('node:assert/strict');
const test = require('node:test');

const promotionDbRow = (overrides = {}) => ({
  id: 'aggregate_left',
  row_number: 10,
  status: 'future',
  product_name: 'Product',
  start_date: '2026-09-01',
  end_date: '2026-09-03',
  promo_price: 500,
  regular_price: 700,
  price_difference: 200,
  real_discount_percent: 28.57,
  advertising_discount_percent: 30,
  source_document_id: 'invoice_left',
  source_document_file_name: 'left.pdf',
  invoice_document_id: 'invoice_left',
  invoice_document_file_name: 'left.pdf',
  plan_document_id: null,
  plan_document_file_name: null,
  created_at: '2026-08-14T10:00:00.000Z',
  updated_at: '2026-08-14T10:00:00.000Z',
  ...overrides,
});

const promotionDocumentDbRow = (overrides = {}) => ({
  id: 'invoice_bridge',
  document_type: 'invoice',
  file_name: 'bridge.pdf',
  content_type: 'application/pdf',
  storage_key: 'promotions/documents/bridge.pdf',
  size_bytes: 100,
  uploaded_by: 'manager',
  uploaded_at: '2026-08-14T10:00:00.000Z',
  ...overrides,
});

const installOpsDbMock = (t, opsDb) => {
  const opsDbPath = require.resolve('../dist/db/opsDb');
  const previous = require.cache[opsDbPath];
  require.cache[opsDbPath] = {
    id: opsDbPath,
    filename: opsDbPath,
    loaded: true,
    exports: { opsDb },
  };
  t.after(() => {
    if (previous) require.cache[opsDbPath] = previous;
    else delete require.cache[opsDbPath];
    delete require.cache[require.resolve('../dist/repositories/promotionRowsRepository')];
    delete require.cache[require.resolve('../dist/repositories/promotionDocumentsRepository')];
  });
};

test('constituent periods use running-max islands and keep unknown bounds separate', (t) => {
  installOpsDbMock(t, { query: async () => ({ rows: [] }) });
  const repositoryPath = require.resolve('../dist/repositories/promotionRowsRepository');
  delete require.cache[repositoryPath];
  const { splitPromotionIntervalsIntoIslands } = require(repositoryPath);

  const islands = splitPromotionIntervalsIntoIslands([
    { id: 'long', startDate: '2026-09-01', endDate: '2026-09-10' },
    { id: 'nested', startDate: '2026-09-02', endDate: '2026-09-03' },
    { id: 'adjacent', startDate: '2026-09-11', endDate: '2026-09-12' },
    { id: 'gap', startDate: '2026-09-14', endDate: '2026-09-15' },
    { id: 'unknown', startDate: null, endDate: null },
  ]);

  assert.deepEqual(islands.map((island) => island.map((item) => item.id)), [
    ['long', 'nested', 'adjacent'],
    ['gap'],
    ['unknown'],
  ]);
});

test('bridge upsert locks and merges every adjacent aggregate before adding provenance', async (t) => {
  const calls = [];
  installOpsDbMock(t, {
    withClient: async (callback) => callback({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM promotion_storage_documents')) return { rows: [{ id: 'invoice_bridge' }] };
        if (sql.includes('SELECT aggregate.*')) {
          return {
            rows: [
              promotionDbRow(),
              promotionDbRow({ id: 'aggregate_right', row_number: 11, start_date: '2026-09-05', end_date: '2026-09-07' }),
            ],
          };
        }
        if (sql.includes('UPDATE promotion_row_intervals') && sql.includes('promotion_row_id = ANY')) return { rows: [] };
        if (sql.includes('DELETE FROM promotion_table_rows WHERE id = ANY')) return { rows: [], rowCount: 1 };
        if (sql.includes('INSERT INTO promotion_row_intervals')) return { rows: [] };
        if (sql.includes('WITH target_rows AS')) {
          return {
            rows: [promotionDbRow({
              start_date: '2026-09-01',
              end_date: '2026-09-07',
              source_document_id: 'invoice_bridge',
              source_document_file_name: 'bridge.pdf',
              invoice_document_id: 'invoice_bridge',
              invoice_document_file_name: 'bridge.pdf',
            })],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  });
  const repositoryPath = require.resolve('../dist/repositories/promotionRowsRepository');
  delete require.cache[repositoryPath];
  const { upsertPromotionDocumentRows } = require(repositoryPath);

  const rows = await upsertPromotionDocumentRows([{
    status: 'future',
    productName: 'Product',
    startDate: '2026-09-04',
    endDate: '2026-09-04',
    promoPrice: 500,
    regularPrice: 700,
    sourceDocumentId: 'invoice_bridge',
    sourceDocumentFileName: 'bridge.pdf',
    sourceProductName: 'Product',
    sourceLineText: 'bridge line',
    priceListItemId: 'price_product',
    matchConfidence: 1,
  }], 'invoice');

  const lookup = calls.find((call) => call.sql.includes('SELECT aggregate.*'));
  assert.doesNotMatch(lookup.sql, /LIMIT 1/);
  assert.match(lookup.sql, /ORDER BY aggregate\.row_number, aggregate\.id/);
  const repoint = calls.find((call) => call.sql.includes('promotion_row_id = ANY'));
  assert.deepEqual(repoint.params, ['aggregate_left', ['aggregate_right']]);
  const loserDelete = calls.find((call) => call.sql.includes('DELETE FROM promotion_table_rows WHERE id = ANY'));
  assert.deepEqual(loserDelete.params, [['aggregate_right']]);
  const constituent = calls.find((call) => call.sql.includes('INSERT INTO promotion_row_intervals'));
  assert.deepEqual(constituent.params.slice(1, 5), ['aggregate_left', 'invoice_bridge', 'invoice', 'bridge.pdf']);
  assert.equal(rows[0].startDate, '2026-09-01');
  assert.equal(rows[0].endDate, '2026-09-07');
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('deleting a bridge document restores two aggregate islands', async (t) => {
  const calls = [];
  let clonedRowId = null;
  installOpsDbMock(t, {
    withClient: async (callback) => callback({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM promotion_storage_documents')) return { rows: [promotionDocumentDbRow()] };
        if (sql.includes('SELECT aggregate.id')) return { rows: [{ id: 'aggregate_left' }] };
        if (sql.includes('DELETE FROM promotion_row_intervals')) return { rows: [], rowCount: 1 };
        if (sql.includes('SELECT id') && sql.includes('FROM promotion_table_rows')) return { rows: [{ id: 'aggregate_left' }] };
        if (sql.includes('SELECT id, promotion_row_id, start_date, end_date')) {
          return {
            rows: [
              { id: 'left_interval', promotion_row_id: 'aggregate_left', start_date: '2026-09-01', end_date: '2026-09-03' },
              { id: 'right_interval', promotion_row_id: 'aggregate_left', start_date: '2026-09-05', end_date: '2026-09-07' },
            ],
          };
        }
        if (sql.includes('INSERT INTO promotion_table_rows')) {
          clonedRowId = params[0];
          return { rows: [{ id: clonedRowId }] };
        }
        if (sql.includes('UPDATE promotion_row_intervals') && sql.includes('WHERE id = ANY')) return { rows: [] };
        if (sql.includes('WITH target_rows AS')) {
          return {
            rows: [
              promotionDbRow(),
              promotionDbRow({ id: clonedRowId, row_number: 12, start_date: '2026-09-05', end_date: '2026-09-07' }),
            ],
          };
        }
        if (sql.includes('DELETE FROM promotion_storage_documents')) return { rows: [], rowCount: 1 };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  });
  delete require.cache[require.resolve('../dist/repositories/promotionRowsRepository')];
  const repositoryPath = require.resolve('../dist/repositories/promotionDocumentsRepository');
  delete require.cache[repositoryPath];
  const { deletePromotionDocumentById } = require(repositoryPath);

  const deleted = await deletePromotionDocumentById('invoice_bridge');

  assert.equal(deleted.deletedRows, 0);
  assert.ok(clonedRowId);
  const repoint = calls.find((call) => (
    call.sql.includes('UPDATE promotion_row_intervals') && call.sql.includes('WHERE id = ANY')
  ));
  assert.deepEqual(repoint.params, [clonedRowId, ['right_interval']]);
  const rebuild = calls.find((call) => call.sql.includes('WITH target_rows AS'));
  assert.deepEqual(new Set(rebuild.params[0]), new Set(['aggregate_left', clonedRowId]));
  assert.match(calls.find((call) => call.sql.includes('INSERT INTO promotion_table_rows')).sql, /NEXTVAL\('promotion_table_row_number_seq'\)/);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('deleting the final constituent removes the empty aggregate only', async (t) => {
  const calls = [];
  installOpsDbMock(t, {
    withClient: async (callback) => callback({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM promotion_storage_documents')) return { rows: [promotionDocumentDbRow()] };
        if (sql.includes('SELECT aggregate.id')) return { rows: [{ id: 'aggregate_left' }] };
        if (sql.includes('DELETE FROM promotion_row_intervals')) return { rows: [], rowCount: 1 };
        if (sql.includes('SELECT id') && sql.includes('FROM promotion_table_rows')) return { rows: [{ id: 'aggregate_left' }] };
        if (sql.includes('SELECT id, promotion_row_id, start_date, end_date')) return { rows: [] };
        if (sql.includes('DELETE FROM promotion_table_rows aggregate')) return { rows: [], rowCount: 1 };
        if (sql.includes('DELETE FROM promotion_storage_documents')) return { rows: [], rowCount: 1 };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  });
  delete require.cache[require.resolve('../dist/repositories/promotionRowsRepository')];
  const repositoryPath = require.resolve('../dist/repositories/promotionDocumentsRepository');
  delete require.cache[repositoryPath];
  const { deletePromotionDocumentById } = require(repositoryPath);

  const deleted = await deletePromotionDocumentById('invoice_bridge');

  assert.equal(deleted.deletedRows, 1);
  assert.equal(calls.some((call) => call.sql.includes('WITH target_rows AS')), false);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('manual edits are rejected for source-backed aggregate rows', async (t) => {
  const calls = [];
  installOpsDbMock(t, {
    withClient: async (callback) => callback({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('AS has_sources')) return { rows: [{ id: 'aggregate_left', has_sources: true }] };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  });
  const repositoryPath = require.resolve('../dist/repositories/promotionRowsRepository');
  delete require.cache[repositoryPath];
  const { updatePromotionRowByNumber } = require(repositoryPath);

  await assert.rejects(
    updatePromotionRowByNumber(10, {
      status: 'future',
      productName: 'Changed',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      promoPrice: 400,
      regularPrice: 700,
    }),
    /исходный документ/,
  );
  assert.equal(calls.some((call) => call.sql.includes('UPDATE promotion_table_rows')), false);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
});
