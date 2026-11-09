import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('current Fri-Mon sold formula uses current Thursday stock and Saturday order', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /const currentSold = soldValuesForWeek\(row, current, previous\?\.sun, orderPacks\);/,
  );
  assert.doesNotMatch(
    source,
    /soldFriMon: computeDashboardSold\(stockAt\(row, previous\?\.thu\)/,
  );
});

test('current Mon-Wed sold formula uses previous Sunday stock and Tuesday order', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /const currentSold = soldValuesForWeek\(row, current, previous\?\.sun, orderPacks\);/,
  );
  assert.doesNotMatch(
    source,
    /soldMonWed: computeDashboardSold\(stockAt\(row, current\.sun\)/,
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

  assert.match(source, /const currentSold = soldValuesForWeek\(row, current, previous\?\.sun, orderPacks\);/);
  assert.match(source, /const previousWeekSunday = previous\?\.mon \? addDays\(previous\.mon, -1\) : undefined;/);
  assert.match(
    source,
    /const previousSold = previous \? soldValuesForWeek\(row, previous, previousWeekSunday, orderPacks\) : null;/,
  );
  assert.doesNotMatch(source, /const soldMonWedPrevious = previous \? computeDashboardSold\(stockAt\(row, previous\.mon\)/);
  assert.match(source, /soldPrevMonWed: copiedSoldMonWedPrevious \|\| previousSold\?\.soldMonWed \|\| '',/);
  assert.match(source, /soldPrevWedFri: copiedSoldWedFriPrevious \|\| previousSold\?\.soldWedFri \|\| '',/);
  assert.match(source, /soldPrevFriMon: copiedSoldFriMonPrevious \|\| previousSold\?\.soldFriMon \|\| '',/);
});

test('previous sold columns use the same formula helper as the sold columns', async () => {
  const source = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /const soldValuesForWeek = <T extends DashboardProductLike>\([\s\S]*soldMonWed: soldMonWedForWeek\(row, week, previousSunday, orderPacks\),[\s\S]*soldWedFri: soldWedFriForWeek\(row, week, orderPacks\),[\s\S]*soldFriMon: soldFriMonForWeek\(row, week, orderPacks\),[\s\S]*\}\);/,
  );
  assert.match(source, /soldPrevMonWed: copiedSoldMonWedPrevious \|\| previousSold\?\.soldMonWed \|\| '',/);
  assert.match(source, /soldMonWed: currentSold\.soldMonWed,/);
  assert.match(source, /soldPrevWedFri: copiedSoldWedFriPrevious \|\| previousSold\?\.soldWedFri \|\| '',/);
  assert.match(source, /soldWedFri: currentSold\.soldWedFri,/);
  assert.match(source, /soldPrevFriMon: copiedSoldFriMonPrevious \|\| previousSold\?\.soldFriMon \|\| '',/);
  assert.match(source, /soldFriMon: currentSold\.soldFriMon,/);
});

test('milk dashboard fetch ranges come from formula dependencies, not visible columns only', async () => {
  const source = await readFile(new URL('../src/panels/products/ProductsPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /const dashboardFormulaStockRangeForWindowStart = \(weekStart: string\): LoadedWeekRange => \{/);
  assert.match(source, /const dashboardFormulaOrderRangeForWindowStart = \(weekStart: string\): LoadedWeekRange => \{/);
  assert.match(source, /const stockFetchRangeForWindowStart = \(weekStart: string, businessCategory: BusinessCategory\): LoadedWeekRange => \{/);
  assert.match(source, /businessCategory === 'Молоко'[\s\S]*dashboardFormulaStockRangeForWindowStart\(weekStart\)/);
  assert.match(source, /const orderFetchRangeForWindowStart = \(weekStart: string, businessCategory: BusinessCategory\): LoadedWeekRange => \{/);
  assert.match(source, /dashboardFormulaOrderRangeForWindowStart\(weekStart\)/);
  assert.match(source, /previousSundayBeforeWeek/);
  assert.match(source, /const range = visibleStockRangeForWindowStart\(windowStart\);/);
});

test('daily stock tables fetch hidden previous-day dependencies for sold formulas', async () => {
  const source = await readFile(new URL('../src/panels/products/ProductsPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /const dailyFormulaStockRangeForWindowStart = \(weekStart: string\): LoadedWeekRange => \{/);
  assert.match(source, /return \{ \.\.\.range, from: addDays\(range\.from, -1\) \};/);
  assert.match(source, /const dailyFormulaOrderRangeForWindowStart = \(weekStart: string, businessCategory: BusinessCategory\): LoadedWeekRange => \{/);
  assert.match(source, /const dailyOrderDateForStockDate = \(date: string, businessCategory: BusinessCategory\): string =>/);
  assert.match(source, /businessCategory === 'Деликатесы' && !isDelicaciesOrderDate\(date\)/);
  assert.match(source, /const orderDates = buildDateRange\(stockRange\.from, stockRange\.to\)\.map\(\(date\) => dailyOrderDateForStockDate\(date, businessCategory\)\);/);
  assert.match(source, /: dailyFormulaStockRangeForWindowStart\(weekStart\);/);
  assert.match(source, /return dailyFormulaOrderRangeForWindowStart\(weekStart, businessCategory\);/);
});

test('tablet stock table keeps hidden formula dependencies out of visible dates', async () => {
  const source = await readFile(new URL('../../frontend/src/screens/StockScreen.tsx', import.meta.url), 'utf8');

  assert.match(source, /const dashboardFormulaStockRangeForWindowStart = \(weekStart: string\): LoadedDateRange => \{/);
  assert.match(source, /const previousSundayBeforeWeek = weeks\.previous\?\.mon \? shiftDateKey\(weeks\.previous\.mon, -1\) : undefined;/);
  assert.match(source, /weeks\.current\.sun \? shiftDateKey\(weeks\.current\.sun, 2\) : undefined/);
  assert.match(source, /const stockFetchRangeForWindowStart = \(weekStart: string, businessCategory: BusinessCategory\): LoadedDateRange =>/);
  assert.match(source, /businessCategory === 'Молоко'[\s\S]*\? dashboardFormulaStockRangeForWindowStart\(weekStart\)/);
  assert.match(source, /const visibleTable = canManage[\s\S]*nextTable\.dates\.filter\(\(date\) => date >= visibleRange\.from && date <= visibleRange\.to\)/);
});

test('bread daily sold treats blank stock as zero in dashboard and tablet app', async () => {
  const dashboard = await readFile(new URL('../src/panels/products/ProductsPanel.tsx', import.meta.url), 'utf8');
  const tablet = await readFile(new URL('../../frontend/src/screens/StockScreen.tsx', import.meta.url), 'utf8');

  for (const source of [dashboard, tablet]) {
    assert.match(
      source,
      /activeBusinessCategory === 'Хлеб'[\s\S]*?return computeDashboardSold\(row\.values\[previousDate\], deliveryUnits, row\.values\[date\]\);/,
    );
  }
});

test('Хлеб keeps the thick line after Saturday «Продано», the weekly «Остаток» column is switched off', async () => {
  const source = await readFile(new URL('../src/panels/products/ProductsPanel.tsx', import.meta.url), 'utf8');
  const shared = await readFile(new URL('../../shared/dashboard-calculations.ts', import.meta.url), 'utf8');

  assert.match(source, /const SHOW_BREAD_WEEK_STOCK_COLUMN = false;/);
  assert.match(source, /const isWeekEndDate = \(date: string\) => isBreadTable && parseDateKey\(date\)\.getDay\(\) === 6;/);
  assert.match(source, /const isWeekStockDate = \(date: string\) => SHOW_BREAD_WEEK_STOCK_COLUMN && isWeekEndDate\(date\);/);
  assert.match(source, /orderUnitsFromPacks\(orderPacksForDate\(row\.productId, dailyOrderDateForStockDate\(date, activeBusinessCategory\)\), row\.unitsInPack \?\? 1\);\r?\n    return computeStockWithOrder\(row\.values\[date\], orderUnits\);/);
  assert.match(source, /\{isWeekStockDate\(date\) && <td className="week-stock-col">\{weekStockFor\(row, date\) \|\| '-'\}<\/td>\}/);
  assert.match(source, /isWeekEndDate\(date\) \? 'week-end-col' : ''/);
  assert.match(source, /const usesWeekdayHeaders = usesMilkTones;/);
  assert.match(source, /usesWeekdayHeaders \? formatWeekdayDateShort\(date\) : formatDateShort\(date\)/);
  assert.match(shared, /return String\(\(parseStockNumber\(stockRaw\) \?\? 0\) \+ \(parseStockNumber\(orderUnitsRaw\) \?\? 0\)\);/);
});
