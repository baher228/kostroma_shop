import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('current Fri-Mon sold formula uses current Thursday stock and Saturday order', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(source, /const curOrderSatUnits = orderUnitsFromPacks\(orderPackSat, row\.unitsInPack\);/);
  assert.match(
    source,
    /const soldFriMonCurrent = computeDashboardSold\(stockAt\(row, current\.thu\), curOrderSatUnits, stockAt\(row, current\.mon\)\);/,
  );
  assert.doesNotMatch(
    source,
    /const soldFriMonCurrent = computeDashboardSold\(stockAt\(row, previous\?\.thu\)/,
  );
});

test('current Mon-Wed sold formula uses previous Sunday stock and Tuesday order', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(source, /const curOrderTueUnits = orderUnitsFromPacks\(orderPacks\(row\.productId, current\.tue\), row\.unitsInPack\);/);
  assert.match(
    source,
    /const soldMonWedCurrent = computeDashboardSold\(stockAt\(row, previous\?\.sun\), curOrderTueUnits, stockAt\(row, current\.wed\)\);/,
  );
  assert.doesNotMatch(
    source,
    /const soldMonWedCurrent = computeDashboardSold\(stockAt\(row, current\.sun\)/,
  );
});

test('dashboard sold formulas treat blank cells as zero and clamp negatives', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(source, /const computeDashboardSold = \(startRaw\?: string, deliveryRaw\?: string, endRaw\?: string\): string => \{/);
  assert.match(source, /const start = parseStockNumber\(startRaw\) \?\? 0;/);
  assert.match(source, /const delivery = parseStockNumber\(deliveryRaw\) \?\? 0;/);
  assert.match(source, /const end = parseStockNumber\(endRaw\) \?\? 0;/);
  assert.match(source, /return String\(Math\.max\(0, start \+ delivery - end\)\);/);
});
