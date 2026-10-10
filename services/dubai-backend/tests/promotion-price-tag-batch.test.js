const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { validateHeaderValue } = require('node:http');
const test = require('node:test');
const zlib = require('node:zlib');
const { PDFParse } = require('pdf-parse');

const row = (number, overrides = {}) => ({
  id: `batch-row-${number}`,
  rowNumber: number,
  status: 'current',
  productName: `Сосиски Молочные ${number} кг.`,
  startDate: '2026-10-01',
  endDate: '2026-10-15',
  promoPrice: 100 + number,
  regularPrice: 200 + number,
  priceDifference: 100,
  realDiscountPercent: 49,
  advertisingDiscountPercent: 50,
  sourceDocumentId: null,
  sourceDocumentFileName: null,
  invoiceDocumentId: null,
  invoiceDocumentFileName: null,
  planDocumentId: null,
  planDocumentFileName: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const batchService = () => require('../dist/services/promotionPriceTagBatchService');
const pdfService = () => require('../dist/services/promotionPriceTagPdfService');
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// Read image stream bytes by their declared length (not a delimiter search),
// then compare the real decompressed rasters with the existing single renderer.
const pdfRasterHashes = (pdf) => {
  const source = pdf.toString('latin1');
  const images = [];
  const pattern = /\/Type \/XObject \/Subtype \/Image \/Width (\d+) \/Height (\d+)[^\n]+\/Length (\d+) >>\nstream\n/g;
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length;
    const rgb = zlib.inflateSync(pdf.subarray(start, start + Number(match[3])));
    assert.equal(rgb.length, Number(match[1]) * Number(match[2]) * 3);
    images.push(hash(rgb));
  }
  return images;
};

test('batch request validates scope, dates, layout and selected row numbers', () => {
  const { parsePromotionPriceTagBatchRequest: parse } = batchService();
  assert.deepEqual(parse({}), {
    scope: 'current_and_future', rowNumbers: [], from: null, to: null, layout: 'a4_2x2',
  });
  assert.deepEqual(parse({ scope: 'selected', rowNumbers: [3, 1, 3] }).rowNumbers, [3, 1]);
  for (const input of [
    null,
    [],
    { scope: 'past' },
    { layout: 'a3' },
    { scope: 'selected' },
    { rowNumbers: ['1'] },
    { rowNumbers: [0] },
    { rowNumbers: [1.5] },
    { from: '2026-02-30' },
    { from: '2026-10-20', to: '2026-10-01' },
  ]) assert.throws(() => parse(input));
});

test('batch uses existing statuses, overlapping period, stable ordering and one copy per row', () => {
  const { parsePromotionPriceTagBatchRequest: parse, selectPromotionPriceTagBatchRows: select } = batchService();
  const rows = [
    row(7, { startDate: null, endDate: null }),
    row(5, { productName: 'Сыр', startDate: '2026-10-12', endDate: '2026-10-25', status: 'future' }),
    row(3, { productName: 'Ветчина' }),
    row(2, { productName: 'Ветчина' }),
    row(1, { status: 'past', endDate: '2026-09-30' }),
    row(4, { promoPrice: null }),
    row(6, { regularPrice: null }),
    row(2, { productName: 'Ветчина' }),
  ];
  const selected = select(rows, parse({ from: '2026-10-10', to: '2026-10-12' }));
  assert.deepEqual(selected.rows.map((item) => item.rowNumber), [2, 3, 5, 7]);
  assert.deepEqual(selected.skippedRowNumbers, [4, 6]);
  assert.deepEqual(select(rows, parse({ scope: 'future' })).rows.map((item) => item.rowNumber), [5]);
  assert.deepEqual(select(rows, parse({ scope: 'current' })).rows.map((item) => item.rowNumber), [2, 3, 7]);
  assert.deepEqual(select(rows, parse({ scope: 'selected', rowNumbers: [1, 1, 3] })).rows.map((item) => item.rowNumber), [3, 1]);
  assert.equal(select([row(10, { promoPrice: 0, regularPrice: 0 })], parse({})).rows.length, 1);
  assert.deepEqual(select([row(11, { promoPrice: NaN }), row(12, { regularPrice: Infinity })], parse({})).skippedRowNumbers, [11, 12]);
});

test('batch filename is UTF-8 with an ASCII fallback and Moscow date', () => {
  const { promotionPriceTagBatchContentDisposition } = batchService();
  const header = promotionPriceTagBatchContentDisposition(new Date('2026-10-03T22:00:00.000Z'));
  assert.doesNotThrow(() => validateHeaderValue('Content-Disposition', header));
  assert.match(header, /filename="promotion-price-tags-2026-10-04\.pdf"/);
  assert.match(decodeURIComponent(header), /Акционные_ценники_04\.10\.2026\.pdf/);
});

test('1, 4, 5 and 12 real price tags fill A4 pages and each source raster appears exactly once', async () => {
  const {
    createPromotionPriceTagSheetPdf,
    preparePromotionPriceTagTemplate,
    renderPromotionPriceTagImage,
    resolvePromotionPriceTagTemplatePath,
  } = pdfService();
  const rows = Array.from({ length: 12 }, (_, index) => row(index + 1));
  const template = preparePromotionPriceTagTemplate(fs.readFileSync(resolvePromotionPriceTagTemplatePath()));
  const expectedHashes = rows.map((item) => hash(renderPromotionPriceTagImage(template, item).rgb));
  assert.equal(new Set(expectedHashes).size, rows.length, 'every source row has a distinct price/product raster');
  for (const count of [1, 4, 5, 12]) {
    const pdf = createPromotionPriceTagSheetPdf(rows.slice(0, count));
    assert.deepEqual(pdfRasterHashes(pdf), expectedHashes.slice(0, count), `${count} source tags must appear once, in order`);
    const source = pdf.toString('latin1');
    const transforms = [...source.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/g)];
    assert.equal(transforms.length, count);
    for (const transform of transforms) {
      const [width, height, x, y] = transform.slice(1).map(Number);
      assert.ok(Math.abs(width / 72 * 25.4 - 100) < 0.01);
      assert.ok(Math.abs(height / 72 * 25.4 - 115) < 0.01);
      assert.ok(x > 0 && y > 0);
      assert.ok(x + width < 210 / 25.4 * 72 && y + height < 297 / 25.4 * 72);
    }
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    try {
      const info = await parser.getInfo({ parsePageInfo: true });
      assert.equal(info.total, Math.ceil(count / 4));
      for (const page of info.pages) {
        assert.ok(Math.abs(page.width / 72 * 25.4 - 210) < 0.01);
        assert.ok(Math.abs(page.height / 72 * 25.4 - 297) < 0.01);
      }
    } finally {
      await parser.destroy();
    }
  }
});

test('batch route requires Ops auth and returns PDF, exposed skip metadata and actionable empty errors', async (context) => {
  const express = require('express');
  const { applyAppMiddleware } = require('../dist/app/appMiddleware');
  const { requireOpsAuth } = require('../dist/auth/middleware');
  const { signOpsToken } = require('../dist/auth/auth');
  const { registerPromotionRowsRoutes } = require('../dist/routes/promotionRowsRoutes');
  const repository = require('../dist/repositories/promotionRowsRepository');
  const originalList = repository.listPromotionRows;
  let rows = [row(1), row(2, { promoPrice: null })];
  repository.listPromotionRows = async () => rows;
  context.after(() => { repository.listPromotionRows = originalList; });
  const app = express();
  applyAppMiddleware(app);
  app.use(requireOpsAuth);
  registerPromotionRowsRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/promotions/price-tags/batch.pdf`;
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:5173',
    Authorization: `Bearer ${signOpsToken({ id: 'worker', username: 'worker', fullName: 'Worker', firstName: 'Worker', lastName: '', role: 'worker', shopId: 'shop_main', shopName: 'Main' })}`,
  };
  const unauthorized = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthorized.status, 401);
  const response = await fetch(url, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  assert.equal(response.headers.get('x-price-tags-count'), '1');
  assert.equal(response.headers.get('x-price-tags-skipped-count'), '1');
  assert.equal(response.headers.get('x-price-tags-skipped-row-numbers'), '2');
  assert.equal(response.headers.get('x-price-tags-page-count'), '1');
  assert.match(response.headers.get('access-control-expose-headers'), /X-Price-Tags-Skipped-Count/i);
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString('ascii'), '%PDF-');
  rows = [row(2, { promoPrice: null })];
  const empty = await fetch(url, { method: 'POST', headers, body: '{}' });
  assert.equal(empty.status, 400);
  const error = await empty.json();
  assert.match(error.message, /старая или новая цена/);
  assert.deepEqual(error.skippedRowNumbers, [2]);
});

test('outputs report real template matches and preserve price-tag availability during Drive errors', async (context) => {
  const drive = require('../dist/services/googleDrivePosterService');
  const { getPromotionOutputs } = require('../dist/services/promotionOutputsService');
  const originalMatch = drive.findPosterPsdForProduct;
  context.after(() => { drive.findPosterPsdForProduct = originalMatch; });
  let calls = 0;
  drive.findPosterPsdForProduct = async () => {
    calls += 1;
    return { best: { file: { name: 'Сосиски Молочные.psd' }, score: 0.92 }, candidates: [] };
  };
  assert.deepEqual(await getPromotionOutputs(row(1)), {
    priceTag: { available: true },
    poster: { available: true, templateFileName: 'Сосиски Молочные.psd', matchScore: 0.92 },
  });
  assert.deepEqual(await getPromotionOutputs(row(2, { regularPrice: null })), {
    priceTag: { available: false }, poster: { available: false },
  });
  assert.equal(calls, 1);
  drive.findPosterPsdForProduct = async () => { throw new Error('private Google auth detail'); };
  const unavailable = await getPromotionOutputs(row(1));
  assert.equal(unavailable.priceTag.available, true);
  assert.equal(unavailable.poster.available, false);
  assert.equal(unavailable.poster.error, 'Не удалось проверить наличие постера.');
});

test('Drive PSD listings share concurrent requests, expire after two minutes and never cache a failure', async (context) => {
  const credentials = require('../dist/services/googleServiceAccountCredentials');
  const { listPosterPsdFiles } = require('../dist/services/googleDrivePosterService');
  const originalRead = credentials.readGoogleServiceAccount;
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  credentials.readGoogleServiceAccount = async () => ({ client_email: 'test@example.test', private_key: privateKey });
  let clock = originalNow();
  Date.now = () => clock;
  context.after(() => {
    credentials.readGoogleServiceAccount = originalRead;
    global.fetch = originalFetch;
    Date.now = originalNow;
  });
  let listings = 0;
  let fail = false;
  global.fetch = async (url) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600 }), { status: 200 });
    }
    listings += 1;
    if (fail) return new Response(JSON.stringify({ error: { message: 'Temporary error' } }), { status: 503 });
    return new Response(JSON.stringify({ files: [{ id: 'test-psd', name: 'Сосиски.psd', mimeType: 'image/x-photoshop' }] }), { status: 200 });
  };
  const [first, second] = await Promise.all([listPosterPsdFiles('batch-test-cache'), listPosterPsdFiles('batch-test-cache')]);
  assert.deepEqual(first, second);
  assert.equal(listings, 1);
  first.pop();
  assert.equal((await listPosterPsdFiles('batch-test-cache')).length, 1, 'caller mutations must not change cached list');
  assert.equal(listings, 1);
  clock += 120_001;
  await listPosterPsdFiles('batch-test-cache');
  assert.equal(listings, 2);
  fail = true;
  await assert.rejects(listPosterPsdFiles('batch-test-error'), /Temporary error/);
  fail = false;
  await listPosterPsdFiles('batch-test-error');
  assert.equal(listings, 4);
});
