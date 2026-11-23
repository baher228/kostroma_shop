import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inventoryHistoryCell } from '../src/domain/inventory/history.ts';

test('tablet inventory submits the selected date and shows the latest submission time', async () => {
  const source = await readFile(new URL('../../frontend/src/screens/StockScreen.tsx', import.meta.url), 'utf8');
  const inventoryTable = source.slice(source.indexOf('const renderInventoryTable'), source.indexOf('const renderTable'));
  const totalPosition = inventoryTable.indexOf('>Итого</Text>');
  const sendPosition = inventoryTable.indexOf("'Отправить'");

  assert.ok(totalPosition >= 0 && sendPosition > totalPosition, 'send action should follow the inventory total');
  assert.match(source, /const submissionDate = inventoryDate/);
  assert.match(source, /stockApi\.submitInventory\(session\.token,[\s\S]*?dayDate: submissionDate/);
  assert.match(inventoryTable, /Последняя отправка:/);
  assert.match(inventoryTable, /formatInventorySubmissionDateTime\(lastSubmissionAt\)/);
});

test('tablet can load a previous submitted snapshot and display its captured values', async () => {
  const source = await readFile(new URL('../../frontend/src/screens/StockScreen.tsx', import.meta.url), 'utf8');

  assert.match(source, /stockApi\.previousInventorySubmission\(session\.token,[\s\S]*?beforeDate: inventoryDate/);
  assert.match(source, /previousInventory\?\.items\.length \? previousInventory\.items\.map/);
  assert.match(source, /item\.inventoryPrice \* item\.quantity/);
  assert.match(source, /item\.quantity === null \? '—' : String\(item\.quantity\)/);
});

test('admin inventory dates include the submission timestamp', async () => {
  const source = await readFile(new URL('../src/panels/products/ProductsPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /table\?\.inventorySubmissions\?\.\[date\]\?\.submittedAt/);
  assert.match(source, /`Отправлено \$\{formatInventoryTime\(submittedAt\)\}`/);
  assert.match(source, /cellForInventoryDate\(row, date\)/);
});

test('submitted inventory keeps the captured count and price even when draft values change', () => {
  const captured = new Map([
    ['sent', { quantity: 3, inventoryPrice: 80 }],
    ['zero', { quantity: 0, inventoryPrice: 80 }],
    ['missing-price', { quantity: 3, inventoryPrice: null }],
  ]);
  assert.deepEqual(inventoryHistoryCell('4', 100, captured, 'sent'), { quantity: 3, price: 80, sum: 240 });
  assert.deepEqual(inventoryHistoryCell('4', 100, captured, 'zero'), { quantity: 0, price: 80, sum: 0 });
  assert.deepEqual(inventoryHistoryCell('4', 100, captured, 'missing-price'), { quantity: 3, price: null, sum: null });
  assert.deepEqual(inventoryHistoryCell('4', 100, captured, 'new'), { quantity: '', price: null, sum: null });
  assert.deepEqual(inventoryHistoryCell('4', 100), { quantity: 4, price: 100, sum: 400 });
});
