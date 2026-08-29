import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('current Fri-Mon sold formula uses current Thursday stock and Saturday order', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(source, /const curOrderSatUnits = orderUnitsFromPacks\(orderPackSat, row\.unitsInPack\);/);
  assert.match(
    source,
    /const soldFriMonCurrent = computeSold\(stockAt\(row, current\.thu\), curOrderSatUnits, stockAt\(row, current\.mon\)\);/,
  );
  assert.doesNotMatch(
    source,
    /const soldFriMonCurrent = computeSold\(stockAt\(row, previous\?\.thu\)/,
  );
});
