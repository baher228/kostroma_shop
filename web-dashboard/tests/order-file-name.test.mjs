import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { safeFileName } from '../src/export/csv.ts';
import { prefixOrderFileName } from '../src/export/orderFileName.ts';

test('order downloads start with the requested category prefix', () => {
  const cases = [
    ['Деликатесы', 'МГ'],
    ['Молоко', 'СМЗ'],
    ['Хлеб', 'Галич хлеб'],
    ['Сыр', 'Молпром'],
    ['Курица', 'Галич кур'],
    ['Мороженое', 'Караваево'],
  ];

  for (const [category, prefix] of cases) {
    assert.equal(
      safeFileName(prefixOrderFileName(category, 'zakaz_2026-11-22')),
      `${prefix.replaceAll(' ', '_')}_zakaz_2026-11-22`,
    );
  }
});

test('the web XLSX save path prefixes both standard and custom filenames', async () => {
  const source = await readFile(new URL('../src/panels/orders/OrdersPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /link\.download = `\$\{safeFileName\(prefixOrderFileName\(activeBusinessCategory, baseName\)\)\}\.xlsx`;/);
  assert.match(source, /saveXlsx\(blob, targetSheet\.date, `Тонары сыр на/);
});
