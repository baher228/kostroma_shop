const assert = require('node:assert/strict');
const test = require('node:test');

const { signOpsToken, signSessionToken, verifyOpsToken } = require('../dist/auth');
const { createDubaiApp } = require('../dist/dubaiApp');
const {
  createRowSchema,
  createSellerOrderSchema,
  updateProductMetaSchema,
  upsertStockValueSchema,
} = require('../dist/validation');

const personalSessionUser = {
  id: 'u1',
  username: 'manager',
  firstName: 'Main',
  lastName: 'Manager',
  fullName: 'Main Manager',
  role: 'manager',
  shopId: null,
  shopName: null,
};

test('Dubai verifier accepts ops tokens and rejects personal session tokens', () => {
  const opsToken = signOpsToken(personalSessionUser);
  assert.equal(verifyOpsToken(opsToken).role, 'manager');
  assert.equal(verifyOpsToken(signSessionToken(personalSessionUser)), null);
});

test('Dubai order schema rejects personal and free-text fields', () => {
  const parsed = createSellerOrderSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    stockOnHand: 2,
    requestedPacks: 1,
    requestedUnits: 6,
    autoSuggested: true,
  });
  assert.equal(parsed.shopId, 'shop_main');
  assert.throws(() => createSellerOrderSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    requestedPacks: 1,
    requestedUnits: 6,
    note: 'Please call Ivan',
  }));
  assert.throws(() => createSellerOrderSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    requestedPacks: 1,
    requestedUnits: 6,
    workerDisplayName: 'Ivan Petrov',
  }));
});

test('Dubai stock schemas validate operational fields', () => {
  const product = createRowSchema.parse({
    name: ' Apples ',
    category: 'Йогурты',
    packType: 'ПЭТ',
    unitsInPack: 6,
    packWeightKg: 2.88,
    shelfLifeDays: 14,
    unitPriceRubVat: 68.61,
    minStockUnits: 1,
    maxStockUnits: 12,
  });
  assert.equal(product.name, 'Apples');
  assert.equal(product.unitsInPack, 6);
  assert.throws(() => createRowSchema.parse({
    name: 'Missing category',
    packType: 'ПЭТ',
    unitsInPack: 6,
    packWeightKg: 2.88,
    shelfLifeDays: 14,
    unitPriceRubVat: 68.61,
    minStockUnits: 1,
    maxStockUnits: 12,
  }));
  assert.throws(() => createRowSchema.parse({
    name: 'Bad range',
    packType: 'ПЭТ',
    unitsInPack: 6,
    packWeightKg: 2.88,
    shelfLifeDays: 14,
    unitPriceRubVat: 68.61,
    minStockUnits: 12,
    maxStockUnits: 1,
  }));
  assert.equal(upsertStockValueSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    date: '2026-05-06',
    value: '12',
  }).value, '12');
  assert.equal(updateProductMetaSchema.parse({ unitsInPack: 6 }).unitsInPack, 6);
});

test('Dubai app rejects personal session tokens before route handlers run', async (t) => {
  const server = createDubaiApp().listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/stock`, {
    headers: { Authorization: `Bearer ${signSessionToken(personalSessionUser)}` },
  });
  assert.equal(response.status, 401);
});
