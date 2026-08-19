const assert = require('node:assert/strict');
const test = require('node:test');

const row = (overrides = {}) => ({
  id: 'promo-row',
  rowNumber: 6,
  status: 'future',
  productName: 'Сервелат Финский п/к 1 кг.',
  startDate: '2026-08-19',
  endDate: '2026-09-01',
  promoPrice: 539,
  regularPrice: 739,
  priceDifference: 200,
  realDiscountPercent: 27.06,
  advertisingDiscountPercent: 30,
  sourceDocumentId: null,
  sourceDocumentFileName: null,
  invoiceDocumentId: null,
  invoiceDocumentFileName: null,
  planDocumentId: null,
  planDocumentFileName: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
  ...overrides,
});

test('price tag filename contains the product and full promotion period', () => {
  const {
    promotionPriceTagContentDisposition,
    promotionPriceTagFileName,
  } = require('../dist/services/promotionPriceTagPdfService');

  const expected = 'Ценник_Сервелат Финский п-к 1 кг_19.08.2026-01.09.2026.pdf';
  assert.equal(promotionPriceTagFileName(row()), expected);

  const disposition = promotionPriceTagContentDisposition(row());
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  assert.equal(encoded && decodeURIComponent(encoded), expected);
  assert.match(disposition, /^attachment; filename="price-tag-6-19\.08\.2026-01\.09\.2026\.pdf";/);
});

test('one-day price tag uses a single date in the filename', () => {
  const { promotionPriceTagFileName } = require('../dist/services/promotionPriceTagPdfService');

  assert.equal(
    promotionPriceTagFileName(row({ startDate: '2026-09-01', endDate: '2026-09-01' })),
    'Ценник_Сервелат Финский п-к 1 кг_01.09.2026.pdf',
  );
});
