const assert = require('node:assert/strict');
const test = require('node:test');

const loadWithMock = (modulePath, mocks) => {
  for (const [mockPath, exports] of Object.entries(mocks)) {
    const resolved = require.resolve(mockPath);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports,
    };
  }
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
};

test('shop service limits worker-visible shops to assigned shop ids', async () => {
  const stockRepositoryPath = '../dist/repositories/stockRepository';
  const { getVisibleShops } = loadWithMock('../dist/services/shopService', {
    [stockRepositoryPath]: {
      getShopById: async (shopId) => (
        shopId === 'shop_a'
          ? { id: 'shop_a', name: 'Shop A', machineNumber: 1 }
          : null
      ),
      listShops: async () => [
        { id: 'shop_a', name: 'Shop A', machineNumber: 1 },
        { id: 'shop_b', name: 'Shop B', machineNumber: 2 },
      ],
      createShop: async () => null,
      updateShopMachine: async () => null,
      updateShop: async () => null,
      deleteShop: async () => false,
    },
  });

  const workerShops = await getVisibleShops({
    role: 'worker',
    shopIds: ['shop_a', 'missing_shop'],
    scopes: ['shops:read'],
    jti: 'jti_worker',
  });
  assert.deepEqual(workerShops.map((shop) => shop.id), ['shop_a']);

  const managerShops = await getVisibleShops({
    role: 'manager',
    shopIds: [],
    scopes: ['shops:read'],
    jti: 'jti_manager',
  });
  assert.deepEqual(managerShops.map((shop) => shop.id), ['shop_a', 'shop_b']);
});

test('stock service normalizes zero order values before repository write', async () => {
  let capturedPayload = null;
  const { setShopOrderValue } = loadWithMock('../dist/services/stockService', {
    '../dist/repositories/orderSheetRepository': {
      listOrderSheetValues: async () => [],
      upsertOrderSheetValue: async (payload) => {
        capturedPayload = payload;
        return true;
      },
    },
    '../dist/repositories/stockRepository': {
      createProduct: async () => null,
      deleteProduct: async () => false,
      getStockTable: async () => null,
      updateProduct: async () => null,
      updateProductMeta: async () => null,
      upsertStockValue: async () => false,
    },
  });

  const ok = await setShopOrderValue({
    shopId: 'shop_a',
    productId: 'prod_a',
    date: '2026-05-12',
    value: '0',
  });

  assert.equal(ok, true);
  assert.deepEqual(capturedPayload, {
    shopId: 'shop_a',
    productId: 'prod_a',
    date: '2026-05-12',
    value: '',
  });
});

test('order service delegates seller order creation and preserves not-found outcome', async () => {
  let capturedViewer = null;
  let capturedPayload = null;
  const { submitSellerOrder } = loadWithMock('../dist/services/orderService', {
    '../dist/repositories/orderSheetRepository': {
      getOrderSheet: async () => null,
      upsertOrderSheetValue: async () => false,
    },
    '../dist/repositories/ordersRepository': {
      createSellerOrder: async (viewer, payload) => {
        capturedViewer = viewer;
        capturedPayload = payload;
        return null;
      },
      listSellerOrders: async () => [],
      updateSellerOrderStatus: async () => null,
    },
  });

  const result = await submitSellerOrder(
    { role: 'worker', shopIds: ['shop_a'], scopes: ['orders:write'], jti: 'jti_1' },
    {
      shopId: 'shop_a',
      productId: 'missing_product',
      stockOnHand: 1,
      requestedPacks: 2,
      requestedUnits: 12,
      autoSuggested: false,
    },
  );

  assert.equal(result, null);
  assert.equal(capturedViewer.role, 'worker');
  assert.equal(capturedPayload.productId, 'missing_product');
});
