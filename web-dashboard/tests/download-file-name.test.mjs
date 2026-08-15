import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadFileName } from '../src/downloadFileName.ts';

const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('download filename uses the UTF-8 Content-Disposition value', () => {
  const expected = 'Прайс для акций.xlsx';
  const disposition = `attachment; filename="price.xlsx"; filename*=UTF-8''${encodeURIComponent(expected)}`;
  assert.equal(downloadFileName(disposition, xlsxType), expected);
});

test('an XLSX response never falls back to a PDF extension when CORS hides the filename', () => {
  assert.equal(downloadFileName('', xlsxType), 'download.xlsx');
});

test('the selected document name wins over a generic MIME-based fallback', () => {
  assert.equal(downloadFileName('', xlsxType, 'Выбранный прайс.xlsx'), 'Выбранный прайс.xlsx');
});

test('a PDF response keeps the PDF fallback for generated documents', () => {
  assert.equal(downloadFileName('', 'application/pdf'), 'download.pdf');
});

test('a malformed extended filename falls back to its ASCII filename', () => {
  assert.equal(
    downloadFileName(`attachment; filename="price.xlsx"; filename*=UTF-8''%ZZ`, xlsxType),
    'price.xlsx',
  );
});
