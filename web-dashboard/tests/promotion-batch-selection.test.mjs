import assert from 'node:assert/strict';
import test from 'node:test';
import { priceTagReady, selectBatchRows } from '../src/panels/promotions/batchSelection.ts';

const rows = [
  { rowNumber: 1, status: 'past', startDate: '2026-09-01', endDate: '2026-09-30', promoPrice: 10, regularPrice: 20 },
  { rowNumber: 2, status: 'current', startDate: '2026-10-01', endDate: '2026-10-10', promoPrice: 10, regularPrice: 20 },
  { rowNumber: 3, status: 'future', startDate: '2026-10-11', endDate: '2026-10-31', promoPrice: null, regularPrice: 20 },
  { rowNumber: 4, status: 'future', startDate: null, endDate: null, promoPrice: 0, regularPrice: 0 },
];

test('batch scopes preserve current, future, and selected semantics', () => {
  assert.deepEqual(selectBatchRows(rows, { scope: 'current' }).map((row) => row.rowNumber), [2]);
  assert.deepEqual(selectBatchRows(rows, { scope: 'future' }).map((row) => row.rowNumber), [3, 4]);
  assert.deepEqual(selectBatchRows(rows, { scope: 'current_and_future' }).map((row) => row.rowNumber), [2, 3, 4]);
  assert.deepEqual(selectBatchRows(rows, { scope: 'selected', rowNumbers: [1, 3, 3] }).map((row) => row.rowNumber), [1, 3]);
  assert.deepEqual(selectBatchRows(rows, { scope: 'selected', rowNumbers: [] }), []);
});

test('date filters use inclusive overlap and open missing bounds', () => {
  assert.deepEqual(selectBatchRows(rows, { scope: 'current_and_future', from: '2026-10-10', to: '2026-10-10' }).map((row) => row.rowNumber), [2, 4]);
  assert.deepEqual(selectBatchRows(rows, { scope: 'selected', rowNumbers: [1, 2], from: '2026-10-01' }).map((row) => row.rowNumber), [2]);
});

test('batch readiness skips missing, negative, and non-finite prices and preserves zero prices', () => {
  assert.equal(priceTagReady(rows[1]), true);
  assert.equal(priceTagReady(rows[2]), false);
  assert.equal(priceTagReady(rows[3]), true);
  assert.equal(priceTagReady({ promoPrice: -1, regularPrice: 2 }), false);
  assert.equal(priceTagReady({ promoPrice: Infinity, regularPrice: 2 }), false);
  assert.equal(priceTagReady({ promoPrice: 1, regularPrice: NaN }), false);
});
