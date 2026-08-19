const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PromotionDocumentFileMissingError,
  createPromotionDocumentStorageKey,
  deletePromotionDocumentObjects,
  downloadPromotionDocument,
  promotionDocumentDownloadContentType,
  promotionDocumentStorageKeyCandidates,
} = require('../dist/services/promotionDocumentStorageService');

const downloadedFile = {
  body: Buffer.from('xlsx'),
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  contentLength: 4,
};

const noSuchKey = () => Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' });

test('promotion document keys normalize decomposed names for new uploads', () => {
  const decomposedName = '\u041f\u0440\u0430\u0438\u0306\u0441.xlsx';
  const composedName = '\u041f\u0440\u0430\u0439\u0441.xlsx';

  assert.equal(
    createPromotionDocumentStorageKey('retail_price_list', decomposedName, 123),
    createPromotionDocumentStorageKey('retail_price_list', composedName, 123),
  );
});

test('promotion document download candidates support flat and legacy typed layouts', () => {
  const objectName = '1785229236000_price.xlsx';

  assert.deepEqual(
    promotionDocumentStorageKeyCandidates({
      documentType: 'retail_price_list',
      storageKey: `promotions/documents/${objectName}`,
    }),
    [
      `promotions/documents/${objectName}`,
      `promotions/documents/retail_price_list/${objectName}`,
    ],
  );

  assert.deepEqual(
    promotionDocumentStorageKeyCandidates({
      documentType: 'retail_price_list',
      storageKey: `promotions/documents/retail_price_list/${objectName}`,
    }),
    [
      `promotions/documents/retail_price_list/${objectName}`,
      `promotions/documents/${objectName}`,
    ],
  );
});

test('promotion document download falls back only after an object-not-found response', async () => {
  const calls = [];
  const objectName = '1785229236000_price.xlsx';
  const document = {
    documentType: 'retail_price_list',
    storageKey: `promotions/documents/retail_price_list/${objectName}`,
  };

  const result = await downloadPromotionDocument(document, async (key) => {
    calls.push(key);
    if (calls.length === 1) throw noSuchKey();
    return downloadedFile;
  });

  assert.deepEqual(calls, [
    `promotions/documents/retail_price_list/${objectName}`,
    `promotions/documents/${objectName}`,
  ]);
  assert.equal(result.resolvedStorageKey, `promotions/documents/${objectName}`);
  assert.deepEqual(result.body, downloadedFile.body);
});

test('retail price list download is advertised as XLSX even when object metadata is stale', () => {
  assert.equal(
    promotionDocumentDownloadContentType(
      {
        documentType: 'retail_price_list',
        fileName: 'Прайс.xlsx',
        contentType: 'application/octet-stream',
      },
      'application/pdf',
    ),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
});

test('promotion document download keeps an exact hit and can fall back from flat to legacy layout', async () => {
  const objectName = '1785229236000_price.xlsx';
  const flatKey = `promotions/documents/${objectName}`;
  const legacyKey = `promotions/documents/retail_price_list/${objectName}`;
  const exactCalls = [];

  const exact = await downloadPromotionDocument(
    { documentType: 'retail_price_list', storageKey: flatKey },
    async (key) => {
      exactCalls.push(key);
      return downloadedFile;
    },
  );
  assert.deepEqual(exactCalls, [flatKey]);
  assert.equal(exact.resolvedStorageKey, flatKey);

  const fallbackCalls = [];
  const fallback = await downloadPromotionDocument(
    { documentType: 'retail_price_list', storageKey: flatKey },
    async (key) => {
      fallbackCalls.push(key);
      if (key === flatKey) throw noSuchKey();
      return downloadedFile;
    },
  );
  assert.deepEqual(fallbackCalls, [flatKey, legacyKey]);
  assert.equal(fallback.resolvedStorageKey, legacyKey);
});

test('promotion document download does not hide non-missing R2 errors', async () => {
  const accessDenied = Object.assign(new Error('Access denied'), { name: 'AccessDenied' });
  let calls = 0;

  await assert.rejects(
    downloadPromotionDocument(
      {
        documentType: 'retail_price_list',
        storageKey: 'promotions/documents/1785229236000_price.xlsx',
      },
      async () => {
        calls += 1;
        throw accessDenied;
      },
    ),
    (error) => error === accessDenied,
  );
  assert.equal(calls, 1);
});

test('promotion document download reports a domain 404 after all compatible keys are missing', async () => {
  await assert.rejects(
    downloadPromotionDocument(
      {
        documentType: 'retail_price_list',
        storageKey: 'promotions/documents/1785229236000_price.xlsx',
      },
      async () => {
        throw noSuchKey();
      },
    ),
    (error) => {
      assert.ok(error instanceof PromotionDocumentFileMissingError);
      assert.equal(error.storageKeys.length, 2);
      assert.match(error.message, /хранилище/u);
      return true;
    },
  );
});

test('promotion document deletion removes both flat and legacy object candidates', async () => {
  const objectName = '1785229236000_price.xlsx';
  const calls = [];

  const deletedKeys = await deletePromotionDocumentObjects(
    {
      documentType: 'retail_price_list',
      storageKey: `promotions/documents/${objectName}`,
    },
    async (key) => {
      calls.push(key);
    },
  );

  assert.deepEqual(calls, [
    `promotions/documents/${objectName}`,
    `promotions/documents/retail_price_list/${objectName}`,
  ]);
  assert.deepEqual(deletedKeys, calls);
});

test('promotion document deletion ignores missing candidates but surfaces storage failures', async () => {
  const document = {
    documentType: 'retail_price_list',
    storageKey: 'promotions/documents/1785229236000_price.xlsx',
  };
  const calls = [];
  const accessDenied = Object.assign(new Error('Access denied'), { name: 'AccessDenied' });

  await assert.rejects(
    deletePromotionDocumentObjects(document, async (key) => {
      calls.push(key);
      if (calls.length === 1) throw noSuchKey();
      throw accessDenied;
    }),
    (error) => error === accessDenied,
  );
  assert.equal(calls.length, 2);
});
