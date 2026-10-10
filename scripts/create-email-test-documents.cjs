const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('../services/dubai-backend/node_modules/exceljs');
const { promotionInvoicePdf } = require('../services/dubai-backend/tests/helpers/promotion-invoice-fixture');

(async () => {
  const directory = path.resolve(__dirname, '../.local-runtime/test-documents');
  fs.mkdirSync(directory, { recursive: true });
  const product = 'Сервелат Финский demo';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Прайс');
  sheet.addRow(['', 'Наименование', 'Чистое наименование', 'Розничная цена']);
  sheet.addRow(['', product, product, 120]);
  await workbook.xlsx.writeFile(path.join(directory, '01-price.xlsx'));
  fs.writeFileSync(path.join(directory, '02-plan.csv'),
    `Наименование;Новая цена;Дата начала;Дата окончания\n${product};90;04.10.2026;10.10.2026\n`);
  fs.writeFileSync(path.join(directory, '03-invoice.pdf'), promotionInvoicePdf(product));
  console.log(`Created three import samples in ${directory}`);
})().catch(error => {
  console.error('Import sample generation failed:', error.message);
  process.exitCode = 1;
});
