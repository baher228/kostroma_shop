const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createDeliverySupplierSchema,
  deliveriesQuerySchema,
  updateDeliverySupplierSchema,
  upsertDeliveryReceiptSchema,
} = require('../dist/http/validation');

test('delivery supplier payloads require a name, an ordered window and weekdays', () => {
  const parsed = createDeliverySupplierSchema.parse({
    shopId: 'shop_1',
    name: ' Молочный двор ',
    windowStartMinutes: 390,
    windowEndMinutes: 450,
    weekdays: [5, 1, 1],
  });
  assert.equal(parsed.name, 'Молочный двор');
  assert.deepEqual(parsed.weekdays, [1, 5]);

  assert.throws(() => updateDeliverySupplierSchema.parse({ name: 'X', windowStartMinutes: 480, windowEndMinutes: 420, weekdays: [1] }));
  assert.throws(() => updateDeliverySupplierSchema.parse({ name: 'X', windowStartMinutes: 420, windowEndMinutes: 480, weekdays: [] }));
  assert.throws(() => updateDeliverySupplierSchema.parse({ name: '', windowStartMinutes: 420, windowEndMinutes: 480, weekdays: [1] }));
});

test('delivery board and receipt payloads validate dates and timestamps', () => {
  assert.deepEqual(deliveriesQuerySchema.parse({ from: '2026-11-01', to: '2026-11-30' }), { from: '2026-11-01', to: '2026-11-30' });
  assert.throws(() => deliveriesQuerySchema.parse({ from: '2026-11-30', to: '2026-11-01' }));
  assert.throws(() => deliveriesQuerySchema.parse({ from: '2026-02-30', to: '2026-03-01' }));

  const receipt = upsertDeliveryReceiptSchema.parse({ supplierId: 'dsup_1', date: '2026-11-09', receivedAt: '2026-11-09T04:12:00.000Z' });
  assert.equal(receipt.removePhoto, undefined);
  assert.throws(() => upsertDeliveryReceiptSchema.parse({ supplierId: 'dsup_1', date: '2026-11-09', receivedAt: '7:12' }));
});

test('delivery receipt upsert keeps the stored photo unless a new one or removal is requested', async () => {
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
          if (sql.startsWith('SELECT invoice_photo_key')) {
            return { rows: [{ invoice_photo_key: 'deliveries/old.jpg', invoice_photo_content_type: 'image/jpeg' }] };
          }
          if (sql.includes('INSERT INTO delivery_receipts')) {
            return { rows: [{ supplier_id: params[0], day_date: params[1], received_at: params[2], has_invoice_photo: true }] };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };
  delete require.cache[require.resolve('../dist/repositories/deliveriesRepository')];
  const { upsertDeliveryReceipt } = require('../dist/repositories/deliveriesRepository');

  const kept = await upsertDeliveryReceipt({ supplierId: 'dsup_1', date: '2026-11-09', receivedAt: '2026-11-09T04:12:00.000Z' });
  assert.equal(kept.replacedPhotoKey, null);
  assert.equal(calls.at(-1).params[5], true);

  const replaced = await upsertDeliveryReceipt({
    supplierId: 'dsup_1',
    date: '2026-11-09',
    receivedAt: '2026-11-09T04:12:00.000Z',
    photo: { key: 'deliveries/new.jpg', contentType: 'image/jpeg' },
  });
  assert.equal(replaced.replacedPhotoKey, 'deliveries/old.jpg');
  assert.equal(replaced.receipt.hasInvoicePhoto, true);
  assert.equal(calls.at(-1).params[5], false);

  delete require.cache[opsDbPath];
});
