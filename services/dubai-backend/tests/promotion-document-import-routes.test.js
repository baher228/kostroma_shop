const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const startRoutes = async (context, role = 'manager') => {
  const { registerPromotionDocumentRoutes } = require('../dist/routes/promotionDocumentsRoutes');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.ops = { role, jti: 'manager-test' }; next(); });
  registerPromotionDocumentRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
};

test('manual invoice, plan and price list uploads call the same shared import service and retain 201 response', async (context) => {
  const shared = require('../dist/services/promotionDocumentImportService');
  const calls = [];
  context.mock.method(shared, 'importPromotionDocument', async (input) => {
    calls.push(input);
    return { document: { id: 'doc-test', fileName: input.fileName, documentType: input.documentType }, import: { imported: 1 } };
  });
  const baseUrl = await startRoutes(context);
  for (const [documentType, fileName, mimeType] of [
    ['invoice', 'invoice.pdf', 'application/pdf'],
    ['two_month_plan', 'plan.csv', 'text/csv'],
    ['retail_price_list', 'price.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ]) {
    const form = new FormData();
    form.set('documentType', documentType);
    form.set('file', new Blob([`file-${documentType}`], { type: mimeType }), fileName);
    const response = await fetch(`${baseUrl}/api/promotions/documents`, { method: 'POST', body: form });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { document: { id: 'doc-test', fileName, documentType }, import: { imported: 1 } });
    const input = calls.at(-1);
    assert.equal(input.uploadedBy, 'manager-test');
    assert.equal(input.contentType, mimeType);
    assert.equal(input.buffer.toString(), `file-${documentType}`);
  }
  assert.equal(calls.length, 3);
});

test('manual import preserves prerequisite failure and manager-only permission', async (context) => {
  const shared = require('../dist/services/promotionDocumentImportService');
  context.mock.method(shared, 'importPromotionDocument', async () => { throw new shared.PromotionImportPrerequisiteError('Сначала загрузите XLSX прайс розничных цен.'); });
  const managerBase = await startRoutes(context);
  const form = new FormData();
  form.set('documentType', 'invoice');
  form.set('file', new Blob(['pdf'], { type: 'application/pdf' }), 'invoice.pdf');
  const response = await fetch(`${managerBase}/api/promotions/documents`, { method: 'POST', body: form });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Сначала загрузите XLSX/);
  const sellerBase = await startRoutes(context, 'seller');
  const forbidden = await fetch(`${sellerBase}/api/promotions/documents`, { method: 'POST', body: form });
  assert.equal(forbidden.status, 403);
});

test('PDF preview uses inline PDF MIME, original filename, no cache, and does not mutate records', async (context) => {
  const repository = require('../dist/repositories/promotionDocumentsRepository');
  const storage = require('../dist/services/promotionDocumentStorageService');
  const document = { id: 'invoice-id', documentType: 'invoice', fileName: 'Накладная.pdf', contentType: 'application/octet-stream', storageKey: 'source' };
  const pdf = Buffer.from('%PDF-1.4 test');
  context.mock.method(repository, 'getPromotionDocumentById', async (id) => { assert.equal(id, document.id); return document; });
  context.mock.method(storage, 'downloadPromotionDocument', async () => ({ body: pdf, contentType: 'application/octet-stream' }));
  const create = context.mock.method(repository, 'createPromotionDocument', async () => { throw new Error('preview must not write'); });
  const remove = context.mock.method(repository, 'deletePromotionDocumentById', async () => { throw new Error('preview must not delete'); });
  const baseUrl = await startRoutes(context);
  const response = await fetch(`${baseUrl}/api/promotions/documents/invoice-id/preview`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/pdf/);
  assert.match(response.headers.get('content-disposition'), /^inline;.*filename\*=UTF-8/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});

test('CSV source and live final table expose bounded read-only JSON previews', async (context) => {
  const repository = require('../dist/repositories/promotionDocumentsRepository');
  const rowRepository = require('../dist/repositories/promotionRowsRepository');
  const storage = require('../dist/services/promotionDocumentStorageService');
  context.mock.method(repository, 'getPromotionDocumentById', async () => ({ documentType: 'two_month_plan', fileName: 'plan.csv', storageKey: 'source' }));
  context.mock.method(storage, 'downloadPromotionDocument', async () => ({ body: Buffer.from('Товар;Цена\nМолоко;10'), contentType: 'text/csv' }));
  context.mock.method(rowRepository, 'listPromotionRows', async () => [{ rowNumber: 4, status: 'current', productName: 'Молоко', startDate: '2026-10-04', endDate: '2026-10-05', promoPrice: 10, regularPrice: 15, priceDifference: 5, realDiscountPercent: 33, advertisingDiscountPercent: 33 }]);
  const baseUrl = await startRoutes(context);
  const source = await fetch(`${baseUrl}/api/promotions/documents/plan-id/preview`);
  assert.equal(source.status, 200);
  assert.deepEqual((await source.json()).sheets[0].rows, [['Товар', 'Цена'], ['Молоко', '10']]);
  const final = await fetch(`${baseUrl}/api/promotions/documents/final-table/preview`);
  assert.equal(final.status, 200);
  const data = await final.json();
  assert.equal(data.type, 'table');
  assert.equal(data.sheets[0].rows[1][2], 'Молоко');
});

test('unknown documents and missing source objects return preview 404', async (context) => {
  const repository = require('../dist/repositories/promotionDocumentsRepository');
  const storage = require('../dist/services/promotionDocumentStorageService');
  context.mock.method(repository, 'getPromotionDocumentById', async (id) => id === 'missing-file' ? { documentType: 'invoice', fileName: 'invoice.pdf', storageKey: 'missing' } : null);
  context.mock.method(storage, 'downloadPromotionDocument', async () => { throw new storage.PromotionDocumentFileMissingError(['missing']); });
  const baseUrl = await startRoutes(context);
  assert.equal((await fetch(`${baseUrl}/api/promotions/documents/unknown/preview`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/promotions/documents/missing-file/preview`)).status, 404);
});

test('Dubai preview endpoints require Ops authentication', async (context) => {
  const { createDubaiApp } = require('../dist/app/dubaiApp');
  const server = createDubaiApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${baseUrl}/api/promotions/documents/id/preview`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/promotions/documents/final-table/preview`)).status, 401);
});

test('price-list repository preserves a transient database error when rollback also fails', async (context) => {
  const { opsDb } = require('../dist/db/opsDb');
  const { upsertPromotionPriceListItems } = require('../dist/repositories/promotionPriceListRepository');
  const { isTemporaryGmailError } = require('../dist/gmail/gmailClient');
  const failure = Object.assign(new Error('connection interrupted'), { code: 'ECONNRESET' });
  context.mock.method(opsDb, 'withClient', async (callback) => callback({
    query: async (sql) => {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') throw new Error('Client has encountered a connection error and is not queryable');
      throw failure;
    },
  }));
  await assert.rejects(upsertPromotionPriceListItems([{
    sourceDocumentId: 'doc-test', sourceFileName: 'price.xlsx', sourceRowNumber: 2,
    category: null, productNameRaw: 'Milk', productNameClean: 'Milk', normalizedProductName: 'milk', regularPrice: 100,
  }]), (error) => { assert.equal(error, failure); assert.equal(isTemporaryGmailError(error), true); return true; });
});
