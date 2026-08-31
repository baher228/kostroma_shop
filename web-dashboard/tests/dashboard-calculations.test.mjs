import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('current Fri-Mon sold formula uses current Thursday stock and Saturday order', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /const soldFriMonCurrent = soldFriMonForWeek\(row, current, orderPacks\);/,
  );
  assert.doesNotMatch(
    source,
    /const soldFriMonCurrent = computeDashboardSold\(stockAt\(row, previous\?\.thu\)/,
  );
});

test('current Mon-Wed sold formula uses previous Sunday stock and Tuesday order', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /const soldMonWedCurrent = soldMonWedForWeek\(row, current, previous\?\.sun, orderPacks\);/,
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

test('previous sold columns are wired to the matching previous week sold calculations', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(source, /const previousWeekSunday = previous\?\.mon \? addDays\(previous\.mon, -1\) : undefined;/);
  assert.match(
    source,
    /const soldMonWedPrevious = previous \? soldMonWedForWeek\(row, previous, previousWeekSunday, orderPacks\) : '';/,
  );
  assert.match(
    source,
    /const soldWedFriPrevious = previous \? soldWedFriForWeek\(row, previous, orderPacks\) : '';/,
  );
  assert.match(
    source,
    /const soldFriMonPrevious = previous \? soldFriMonForWeek\(row, previous, orderPacks\) : '';/,
  );
  assert.doesNotMatch(source, /const soldMonWedPrevious = previous \? computeDashboardSold\(stockAt\(row, previous\.mon\)/);
  assert.match(source, /soldPrevMonWed: copiedSoldMonWedPrevious \|\| soldMonWedPrevious,/);
  assert.match(source, /soldPrevWedFri: copiedSoldWedFriPrevious \|\| soldWedFriPrevious,/);
  assert.match(source, /soldPrevFriMon: copiedSoldFriMonPrevious \|\| soldFriMonPrevious,/);
});
