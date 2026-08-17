const assert = require('node:assert/strict');
const test = require('node:test');
const { GlobalFonts } = require('@napi-rs/canvas');

test('promotion generators register bundled Golos Text regular, semibold and bold weights', () => {
  const {
    PROMOTION_FONT_FAMILY,
    promotionFont,
    registerPromotionFonts,
    resolvePromotionFontFiles,
  } = require('../dist/services/promotionFonts');

  const files = resolvePromotionFontFiles();
  assert.deepEqual(files.map((file) => file.weight), [400, 600, 700]);
  assert.ok(files.every((file) => file.path.includes('assets')));

  registerPromotionFonts();
  const family = GlobalFonts.families.find(({ family: name }) => name === PROMOTION_FONT_FAMILY);
  assert.ok(family, 'Golos Text must be registered for canvas rendering');
  const registeredWeights = new Set(family.styles.map(({ weight }) => weight));
  assert.ok(registeredWeights.has(400), 'Golos Text Regular must be available');
  assert.ok(registeredWeights.has(600), 'Golos Text SemiBold must be available');
  assert.ok(registeredWeights.has(700), 'Golos Text Bold must be available');
  assert.equal(promotionFont(48), '700 48px "Golos Text"');
  assert.equal(promotionFont(18, 400), '400 18px "Golos Text"');
  assert.equal(promotionFont(32, 600), '600 32px "Golos Text"');
});
