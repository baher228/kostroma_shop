const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { initializeCanvas, writePsdBuffer } = require('ag-psd');
const { registerPromotionFonts, promotionFont } = require('../dist/services/promotionFonts');
const { renderGeneratedPosterFromPsd, createGeneratedPosterPdfFromPsd } = require('../dist/services/generatedPosterPdfService');

const row = { regularPrice: 669, promoPrice: 479, priceDifference: 190, advertisingDiscountPercent: 30 };
const regions = [[15, 20, 100, 50], [15, 85, 110, 55], [15, 150, 95, 50], [210, 45, 150, 65]];

const fixture = () => {
  initializeCanvas((w, h) => createCanvas(w, h));
  registerPromotionFonts();
  const background = createCanvas(400, 240);
  const bg = background.getContext('2d');
  bg.fillStyle = '#ff0000'; bg.fillRect(0, 0, 400, 240);
  const composite = createCanvas(400, 240);
  const ctx = composite.getContext('2d');
  ctx.fillStyle = '#b85824'; ctx.fillRect(0, 0, 400, 240);
  const children = [{ name: 'Background with Photoshop color overlay', canvas: background,
    left: 0, top: 0, right: 400, bottom: 240,
    effects: { solidFill: [{ enabled: true, blendMode: 'normal', opacity: 1, color: { r: 184, g: 88, b: 36 } }] } }];
  ['669', '479', '190', '-30%'].forEach((text, i) => {
    const [left, top, width, height] = regions[i];
    const raster = createCanvas(width, height);
    const rc = raster.getContext('2d');
    rc.font = promotionFont(80, 600); rc.fillStyle = '#ffffff';
    const metrics = rc.measureText(text);
    rc.scale(width / (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight), height / (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent));
    rc.fillText(text, metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxAscent);
    ctx.drawImage(raster, left, top);
    children.push({ name: text, left, top, right: left + width, bottom: top + height, canvas: raster,
      text: { text, transform: [4, 0, 0, 4, left, top], style: { font: { name: 'GolosText-SemiBold' }, fontSize: 20, fillColor: { r: 255, g: 255, b: 255 } } } });
  });
  // The native composite contains Photoshop artwork that layer reconstruction loses.
  ctx.fillStyle = '#ffffff'; ctx.fillRect(180, 0, 12, 240);
  ctx.fillStyle = '#7718ce'; ctx.fillRect(205, 160, 170, 55);
  children.push({ name: 'Hidden obsolete design', hidden: true, children: [{ name: 'Wrong old price', left: 0, top: 0, right: 50, bottom: 50, text: { text: '9999' } }] });
  return { bytes: writePsdBuffer({ width: 400, height: 240, canvas: composite, children }), pixels: ctx.getImageData(0, 0, 400, 240).data };
};

test('unchanged prices preserve the native Photoshop composite pixel for pixel', () => {
  const original = fixture();
  const actual = renderGeneratedPosterFromPsd(original.bytes, row).getContext('2d').getImageData(0, 0, 400, 240).data;
  assert.deepEqual(actual, original.pixels);
});

test('changed prices preserve all artwork outside price bounds and the transformed discount size', () => {
  const original = fixture();
  const actual = renderGeneratedPosterFromPsd(original.bytes, { regularPrice: 799, promoPrice: 499, priceDifference: 300, advertisingDiscountPercent: 40 }).getContext('2d').getImageData(0, 0, 400, 240).data;
  let changed = 0;
  const discountInkRows = new Set();
  for (let y = 0; y < 240; y++) for (let x = 0; x < 400; x++) {
    const offset = (y * 400 + x) * 4;
    const inside = regions.some(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height);
    if (!inside) assert.deepEqual(actual.subarray(offset, offset + 4), original.pixels.subarray(offset, offset + 4));
    else if (actual[offset] !== original.pixels[offset] || actual[offset + 1] !== original.pixels[offset + 1]) changed++;
    if (x >= 210 && x < 360 && y >= 45 && y < 110) {
      if (actual[offset] > 245 && actual[offset + 1] > 245 && actual[offset + 2] > 245) discountInkRows.add(y);
      else if (actual[offset] < 200) assert.ok(actual[offset + 1] > 50, 'Photoshop color overlay must remain orange, not red');
    }
  }
  assert.ok(changed > 1000);
  assert.ok(discountInkRows.size >= 60, 'discount must retain its 65px raster height despite a 20px PSD font size');
});

test('poster PDF retains the original aspect ratio as one page', () => {
  const pdf = createGeneratedPosterPdfFromPsd(fixture().bytes, row).toString('latin1');
  assert.match(pdf, /\/Count 1\b/);
  assert.match(pdf, /\/MediaBox \[0 0 453\.54 272\.13\]/);
  assert.match(pdf, /\/Width 400 \/Height 240/);
});
