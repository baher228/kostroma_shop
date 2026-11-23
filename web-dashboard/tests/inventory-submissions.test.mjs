import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
  assert.match(source, /`Отправлено \$\{formatInventoryTime\(table\.inventorySubmissions\[date\]\.submittedAt\)\}`/);
});
