const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validateHeaderValue } = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { PDFParse } = require('pdf-parse');

const row = (overrides = {}) => ({
  id: 'promo-row',
  rowNumber: 6,
  status: 'current',
  productName: 'Колбаски для гриля «С моцареллой и травами» вар. 1 кг.',
  startDate: '2026-08-19',
  endDate: '2026-09-01',
  promoPrice: 399.05,
  regularPrice: 559.90,
  priceDifference: 160.85,
  realDiscountPercent: 28.73,
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

const service = () => require('../dist/services/promotionPriceTagPdfService');

const pixel = (image, x, y) => {
  const index = (y * image.width + x) * 3;
  return [image.rgb[index], image.rgb[index + 1], image.rgb[index + 2]];
};

const imageDifference = (left, right, region) => {
  assert.equal(left.width, right.width);
  assert.equal(left.height, right.height);
  let inside = 0;
  let outside = 0;
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const index = (y * left.width + x) * 3;
      const changed = left.rgb[index] !== right.rgb[index]
        || left.rgb[index + 1] !== right.rgb[index + 1]
        || left.rgb[index + 2] !== right.rgb[index + 2];
      if (!changed) continue;
      if (x >= region.left && x < region.right && y >= region.top && y < region.bottom) inside += 1;
      else outside += 1;
    }
  }
  return { inside, outside };
};

test('local price-tag PSD satisfies the explicit template contract', () => {
  const {
    inspectPromotionPriceTagTemplate,
    resolvePromotionPriceTagTemplatePath,
  } = service();
  const templatePath = resolvePromotionPriceTagTemplatePath();

  assert.ok(fs.existsSync(templatePath));
  assert.ok(templatePath.endsWith(path.join('assets', 'Price_tag', 'Example_price_tag.psd')));
  const inspection = inspectPromotionPriceTagTemplate(fs.readFileSync(templatePath));
  assert.deepEqual(
    {
      width: inspection.width,
      height: inspection.height,
      horizontalResolution: inspection.horizontalResolution,
      verticalResolution: inspection.verticalResolution,
    },
    { width: 1181, height: 1358, horizontalResolution: 300, verticalResolution: 300 },
  );
  assert.deepEqual(inspection.layerIds, {
    period: 6,
    discountMarker: 7,
    discount: 8,
    oldKopecks: 10,
    oldRubles: 153,
    newKopecks: 13,
    newRubles: 152,
    subtitle: 15,
    title: 16,
    oldPriceStrike: 154,
  });
});

test('price-tag content replaces title, both price parts, discount and period', () => {
  const { createPromotionPriceTagContent } = service();

  assert.deepEqual(createPromotionPriceTagContent(row()), {
    title: 'КОЛБАСКИ',
    subtitle: '«С МОЦАРЕЛЛОЙ И ТРАВАМИ» 1 КГ.',
    oldRubles: '559',
    oldKopecks: '90',
    newRubles: '399',
    newKopecks: '05',
    discount: '-30%',
    period: '*при покупке от 100 кг. период акции: 19.08.2026-01.09.2026',
  });

  assert.deepEqual(
    createPromotionPriceTagContent(row({ productName: 'Сыр 1 кг.' })),
    {
      title: 'СЫР',
      subtitle: '1 КГ.',
      oldRubles: '559',
      oldKopecks: '90',
      newRubles: '399',
      newKopecks: '05',
      discount: '-30%',
      period: '*при покупке от 100 кг. период акции: 19.08.2026-01.09.2026',
    },
  );

  const boiledProduct = createPromotionPriceTagContent(row({ productName: 'Колбаса Детская Вареная 1 кг.' }));
  assert.equal(boiledProduct.title, 'КОЛБАСА');
  assert.equal(boiledProduct.subtitle, 'ДЕТСКАЯ 1 КГ.');
});

test('price-tag download header stays valid when promotion dates are absent', () => {
  const { promotionPriceTagContentDisposition } = service();
  const header = promotionPriceTagContentDisposition(row({ startDate: null, endDate: null }));

  assert.match(header, /filename="price-tag-6-no-date\.pdf"/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.doesNotThrow(() => validateHeaderValue('Content-Disposition', header));
});

test('local PSD generator returns one 100x115 mm PDF with the source raster size', async () => {
  const { createPromotionPriceTagPdf } = service();
  const pdf = createPromotionPriceTagPdf(row());
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.match(pdf.toString('latin1'), /\/Width 1181 \/Height 1358/);

  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    assert.equal(info.total, 1);
    assert.ok(Math.abs(info.pages[0].width - 283.46) < 0.02);
    assert.ok(Math.abs(info.pages[0].height - 325.98) < 0.02);
  } finally {
    await parser.destroy();
  }
});

test('each input only changes its own visual region in the PSD-based price tag', () => {
  const {
    preparePromotionPriceTagTemplate,
    renderPromotionPriceTagImage,
    resolvePromotionPriceTagTemplatePath,
  } = service();
  const psd = fs.readFileSync(resolvePromotionPriceTagTemplatePath());
  const template = preparePromotionPriceTagTemplate(psd);
  const baseline = renderPromotionPriceTagImage(template, row());

  const purple = pixel(baseline, 100, 100);
  const orange = pixel(baseline, 100, 900);
  assert.ok(purple[2] > purple[0] && purple[0] > purple[1], 'header must remain purple');
  assert.ok(orange[0] > orange[1] && orange[1] > orange[2], 'body must remain orange');

  const variants = [
    {
      name: 'product',
      row: row({ productName: 'Котлеты «Куриная грудка со сливочным маслом» из цыпленка-бройлера зам. 420 г.' }),
      region: { left: 0, top: 290, right: 1181, bottom: 570 },
    },
    {
      name: 'old price and strike',
      row: row({ regularPrice: 99999999.99 }),
      region: { left: 20, top: 570, right: 470, bottom: 800 },
    },
    {
      name: 'new price',
      row: row({ promoPrice: 99999999.99 }),
      region: { left: 250, top: 690, right: 1181, bottom: 1010 },
    },
    {
      name: 'discount',
      row: row({ advertisingDiscountPercent: 40 }),
      region: { left: 30, top: 1000, right: 570, bottom: 1280 },
    },
    {
      name: 'period',
      row: row({ startDate: '2026-09-02', endDate: '2026-09-15' }),
      region: { left: 0, top: 1280, right: 1181, bottom: 1358 },
    },
  ];

  for (const variant of variants) {
    const image = renderPromotionPriceTagImage(template, variant.row);
    const difference = imageDifference(baseline, image, variant.region);
    assert.ok(difference.inside > 100, `${variant.name} must visibly change its region`);
    assert.equal(difference.outside, 0, `${variant.name} must not alter unrelated regions`);
  }

  const longProduct = renderPromotionPriceTagImage(template, variants[0].row);
  for (let y = 320; y < 570; y += 1) {
    for (const x of [0, 1, 2, 3, 4, 5, 1175, 1176, 1177, 1178, 1179, 1180]) {
      const [red, green, blue] = pixel(longProduct, x, y);
      assert.ok(red < 245 || green < 245 || blue < 245, 'long product text must stay inside the page margins');
    }
  }
});
