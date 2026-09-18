import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web order sheet opens daily categories on today, not tomorrow', async () => {
  const source = await readFile(new URL('../src/panels/orders/OrdersPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(category === 'Молоко'\) return nearestAllowedOrderDate\(today\);/);
  assert.match(source, /if \(category === 'Деликатесы'\) return isDelicaciesOrderDate\(today\) \? today : nearestDelicaciesOrderDate\(today\);/);
  assert.match(source, /return today;/);
  assert.doesNotMatch(source, /if \(category === 'Деликатесы'\) return nearestDelicaciesOrderDate\(today\);/);
  assert.doesNotMatch(source, /return addDays\(today, 1\);/);
});

test('tablet order sheet opens daily categories on today, not tomorrow', async () => {
  const source = await readFile(new URL('../../frontend/src/components/OrderSheetPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(category === 'Молоко'\) return nearestAllowedOrderDate\(today\);/);
  assert.match(source, /if \(category === 'Деликатесы'\) return isDelicaciesOrderDate\(today\) \? today : shiftToDelicaciesOrderDate\(today, 1\);/);
  assert.match(source, /return today;/);
  assert.doesNotMatch(source, /if \(category === 'Деликатесы'\) return shiftToDelicaciesOrderDate\(today, 1\);\s+return shiftOneDay\(today, 1\);/);
});
