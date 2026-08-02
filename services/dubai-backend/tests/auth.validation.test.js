const assert = require('node:assert/strict');
const test = require('node:test');

const { signOpsToken, signSessionToken, verifyOpsToken } = require('../dist/auth/auth');
const { createDubaiApp } = require('../dist/app/dubaiApp');
const {
  createRowSchema,
  createSellerOrderBulkSchema,
  createSellerOrderSchema,
  orderSheetQuerySchema,
  updateProductMetaSchema,
  updateProductSchema,
  updateSellerOrderStatusSchema,
  updateShopSchema,
  upsertStockValueSchema,
} = require('../dist/http/validation');

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
    orderDate: '2026-05-02',
  });
  assert.equal(parsed.shopId, 'shop_main');
  assert.equal(parsed.orderDate, '2026-05-02');
  assert.throws(() => createSellerOrderSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    requestedPacks: 1,
    requestedUnits: 6,
    orderDate: '2026-05-01',
  }));
  assert.equal(createSellerOrderSchema.parse({
    shopId: 'shop_main',
    businessCategory: 'Хлеб',
    productId: 'prod_1',
    requestedPacks: 1,
    requestedUnits: 6,
    orderDate: '2026-05-01',
  }).orderDate, '2026-05-01');
  assert.throws(() => createSellerOrderSchema.parse({
    shopId: 'shop_main',
    businessCategory: 'Деликатесы',
    productId: 'prod_1',
    requestedPacks: 1,
    requestedUnits: 6,
    orderDate: '2026-08-02',
  }));
  assert.equal(createSellerOrderSchema.parse({
    shopId: 'shop_main',
    businessCategory: 'Деликатесы',
    productId: 'prod_1',
    requestedPacks: 1,
    requestedUnits: 6,
    orderDate: '2026-08-03',
  }).orderDate, '2026-08-03');
  assert.throws(() => orderSheetQuerySchema.parse({
    businessCategory: 'Деликатесы',
    date: '2026-08-02',
  }));
  assert.throws(() => createSellerOrderSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    requestedPacks: 1,
    requestedUnits: 6,
    orderDate: '2026-02-31',
  }));
  assert.deepEqual(createSellerOrderBulkSchema.parse({
    shopId: 'shop_main',
    orderDate: '2026-05-02',
    items: [{
      productId: 'prod_1',
      stockOnHand: 2,
      requestedPacks: 1,
      requestedUnits: 6,
      autoSuggested: true,
    }],
  }).items.map((item) => item.productId), ['prod_1']);
  assert.equal(createSellerOrderBulkSchema.parse({
    shopId: 'shop_main',
    businessCategory: 'Сыр',
    orderDate: '2026-05-01',
    items: [{
      productId: 'prod_1',
      requestedPacks: 1,
      requestedUnits: 6,
    }],
  }).businessCategory, 'Сыр');
  assert.throws(() => createSellerOrderBulkSchema.parse({
    shopId: 'shop_main',
    orderDate: '2026-05-02',
    items: [],
  }));
  assert.throws(() => createSellerOrderBulkSchema.parse({
    shopId: 'shop_main',
    orderDate: '2026-05-02',
    items: [
      { productId: 'prod_1', requestedPacks: 1, requestedUnits: 6 },
      { productId: 'prod_1', requestedPacks: 2, requestedUnits: 12 },
    ],
  }));
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

test('Dubai mirrored auth schemas accept admin password length', () => {
  const { loginSchema, createUserSchema } = require('../dist/http/validation');
  assert.equal(loginSchema.parse({ username: 'admin', password: 'admin' }).password, 'admin');
  assert.equal(createUserSchema.parse({
    username: 'worker.short',
    firstName: 'Short',
    lastName: 'Password',
    password: 'admin',
    role: 'worker',
  }).password, 'admin');
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
  assert.throws(() => upsertStockValueSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    date: '2026-02-31',
    value: '12',
  }));
  assert.equal(updateProductMetaSchema.parse({ unitsInPack: 6 }).unitsInPack, 6);
  assert.equal(updateProductSchema.parse({
    name: 'Updated apples',
    category: '\u041c\u043e\u043b\u043e\u043a\u043e',
    packType: 'box',
    unitsInPack: 8,
    packWeightKg: 4,
    shelfLifeDays: 12,
    unitPriceRubVat: 99.5,
    minStockUnits: 2,
    maxStockUnits: 14,
  }).maxStockUnits, 14);
  assert.throws(() => updateProductSchema.parse({ minStockUnits: 4, maxStockUnits: 2 }));
  assert.equal(updateShopSchema.parse({ name: ' Shop 2 ', machineNumber: 2 }).name, 'Shop 2');
  assert.equal(updateSellerOrderStatusSchema.parse({ status: 'processed' }).status, 'processed');
  assert.equal(require('../dist/http/validation').upsertOrderSheetValueSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    date: '2026-05-06',
    value: '14',
  }).value, '14');
  assert.throws(() => require('../dist/http/validation').upsertOrderSheetValueSchema.parse({
    shopId: 'shop_main',
    productId: 'prod_1',
    date: '2026-05-06',
    value: 'hello',
  }));
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
