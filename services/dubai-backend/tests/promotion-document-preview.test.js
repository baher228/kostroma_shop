const assert = require('node:assert/strict');
const test = require('node:test');
const ExcelJS = require('exceljs');
const {
  createPromotionCsvPreview,
  createPromotionDocumentPreview,
} = require('../dist/services/promotionDocumentPreviewService');

test('spreadsheet preview caps sheets, rows and columns without changing the source', async () => {
  const workbook = new ExcelJS.Workbook();
  for (let sheet = 0; sheet < 4; sheet += 1) {
    const worksheet = workbook.addWorksheet(`Лист ${sheet + 1}`);
    for (let row = 0; row < 105; row += 1) worksheet.addRow(Array.from({ length: 35 }, (_, column) => `${row}:${column}`));
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const original = Buffer.from(buffer);
  const preview = await createPromotionDocumentPreview('План.xlsx', buffer);
  assert.equal(preview.type, 'table');
  assert.equal(preview.sheets.length, 3);
  assert.equal(preview.sheets[0].rows.length, 100);
  assert.equal(preview.sheets[0].rows[0].length, 30);
  assert.equal(preview.sheets[0].rows[99][29], '99:29');
  assert.equal(preview.truncated, true);
  assert.deepEqual(buffer, original);
});

test('XLSX preview returns cached formula results, rich text and dates as plain strings', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Прайс');
  sheet.addRow([
    { formula: '2+3', result: 5 },
    { richText: [{ text: 'Товар ' }, { text: 'А' }] },
    new Date('2026-10-04T00:00:00Z'),
    { text: '<script>alert(1)</script>', hyperlink: 'https://example.com' },
  ]);
  const preview = await createPromotionDocumentPreview('прайс.XLSX', Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(preview.sheets[0].rows[0], ['5', 'Товар А', '2026-10-04', '<script>alert(1)</script>']);
  assert.equal(preview.truncated, false);
});

test('CSV preview supports BOM, quotes, escaped quotes and multiline fields', () => {
  const source = Buffer.from('\uFEFFТовар;Цена;Описание\r\n"Товар; А";55;"строка 1\nстрока ""2"""\r\n', 'utf8');
  const original = Buffer.from(source);
  const preview = createPromotionCsvPreview(source);
  assert.deepEqual(preview.sheets[0].rows, [
    ['Товар', 'Цена', 'Описание'],
    ['Товар; А', '55', 'строка 1\nстрока "2"'],
  ]);
  assert.equal(preview.truncated, false);
  assert.deepEqual(source, original);
});

test('CSV preview detects delimiters outside quoted fields', () => {
  assert.deepEqual(createPromotionCsvPreview(Buffer.from('"Товар;А",Цена\nМолоко,12')).sheets[0].rows, [['Товар;А', 'Цена'], ['Молоко', '12']]);
  assert.deepEqual(createPromotionCsvPreview(Buffer.from('Товар\tЦена\nМолоко\t12')).sheets[0].rows, [['Товар', 'Цена'], ['Молоко', '12']]);
});

test('CSV preview bounds rows, columns and unusually long cells', () => {
  const text = Array.from({ length: 110 }, () => Array.from({ length: 35 }, () => 'x'.repeat(2000)).join(';')).join('\n');
  const preview = createPromotionCsvPreview(Buffer.from(text));
  assert.equal(preview.sheets[0].rows.length, 100);
  assert.equal(preview.sheets[0].rows[0].length, 30);
  assert.ok(preview.sheets[0].rows[0][0].length <= 501);
  assert.equal(preview.truncated, true);
});

test('CSV preview rejects binary or invalid text and broken quoted records', () => {
  assert.throws(() => createPromotionCsvPreview(Buffer.from([0xff, 0xfe])), /UTF-8/);
  assert.throws(() => createPromotionCsvPreview(Buffer.from('A;B\n\u0000;2')), /бинарные/);
  assert.throws(() => createPromotionCsvPreview(Buffer.from('A;B\n"broken;2')), /кавычку/);
});

test('preview rejects unsupported files with a download instruction', async () => {
  await assert.rejects(createPromotionDocumentPreview('старый.xls', Buffer.from('legacy')), /Скачайте/);
});
