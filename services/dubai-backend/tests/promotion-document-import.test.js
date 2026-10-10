const assert = require('node:assert/strict');
const test = require('node:test');
const { createPromotionDocumentImporter, PromotionImportPrerequisiteError, validatePromotionCsv } = require('../dist/services/promotionDocumentImportService');

const harness = (overrides = {}) => {
  const calls = [];
  const document = { id: 'doc', storageKey: 'key' };
  const importer = createPromotionDocumentImporter({
    validate: async () => { calls.push('validate'); },
    hasPriceList: async () => true,
    upload: async () => { calls.push('upload'); },
    deleteObject: async () => { calls.push('deleteObject'); },
    createDocument: async () => { calls.push('createDocument'); return document; },
    transaction: async (callback) => { calls.push('begin'); try { const result = await callback(); calls.push('commit'); return result; } catch (error) { calls.push('rollback'); throw error; } },
    priceList: async () => { calls.push('priceList'); return { imported: 2 }; },
    plan: async () => { calls.push('plan'); return { imported: 2, matched: 1 }; },
    invoice: async () => { calls.push('invoice'); return { imported: 2, matched: 1, period: {} }; },
    completeGmail: async (_id, status) => { calls.push(status); },
    query: async (sql) => {
      if (sql.startsWith('SELECT storage_key') || sql.startsWith('SELECT id FROM gmail_imports')) return { rows: [{}] };
      return { rows: [] };
    },
    ...overrides,
  });
  return { importer, calls, document };
};
const input = (documentType = 'two_month_plan', extra = {}) => ({ documentType, fileName: documentType === 'invoice' ? 'file.pdf' : 'file.xlsx', contentType: 'application/octet-stream', buffer: Buffer.from('content'), uploadedBy: 'manager', ...extra });

test('shared importer uses existing invoice, plan and price-list parsers in document transaction', async () => {
  for (const [type, parser] of [['invoice','invoice'],['two_month_plan','plan'],['retail_price_list','priceList']]) {
    const { importer, calls, document } = harness();
    assert.equal((await importer(input(type))).document, document);
    assert.deepEqual(calls, ['validate','upload','begin','createDocument',parser,'commit']);
  }
});
test('invoice prerequisite is checked before parser, R2 and DB writes', async () => {
  const { importer, calls } = harness({ hasPriceList: async () => false });
  await assert.rejects(importer(input('invoice')), PromotionImportPrerequisiteError);
  assert.deepEqual(calls, []);
});
test('deterministic validation failure creates no document and uploads no object', async () => {
  const { importer, calls } = harness({ validate: async () => { throw new Error('invalid content'); } });
  await assert.rejects(importer(input()), /invalid content/);
  assert.deepEqual(calls, []);
});
test('parser failure rolls back document and compensates R2 without losing original error', async () => {
  const original = new Error('parser error');
  const { importer, calls } = harness({ plan: async () => { throw original; } });
  await assert.rejects(importer(input()), (error) => error === original);
  assert.equal(calls.at(-2), 'rollback');
  assert.equal(calls.at(-1), 'deleteObject');
});
test('cleanup failure preserves original error and persistent pending object for recovery', async () => {
  const original = new Error('db failure');
  const { importer } = harness({ createDocument: async () => { throw original; }, deleteObject: async () => { throw new Error('cleanup failure'); } });
  await assert.rejects(importer(input()), (error) => error === original);
});
test('ambiguous commit response returns success and keeps object when DB confirms committed source', async () => {
  const original = Object.assign(new Error('commit lost'), { code: 'ECONNRESET' });
  const { importer, calls } = harness({
    transaction: async (callback) => { await callback(); throw original; },
    query: async () => ({ rows: [{ id: 'doc' }] }),
  });
  assert.equal((await importer(input())).document.id, 'doc');
  assert.ok(!calls.includes('deleteObject'));
});
test('Gmail success and source document share the import transaction', async () => {
  const { importer, calls } = harness();
  await importer(input('invoice', { gmailImportId: 'claim', gmailImportAttempt: 1 }));
  assert.ok(calls.indexOf('success') > calls.indexOf('invoice'));
  assert.ok(calls.indexOf('success') < calls.indexOf('commit'));
});
test('lost Gmail attempt fence prevents creating another document', async () => {
  const { importer, calls } = harness({ query: async (sql) => ({ rows: sql.includes('FROM gmail_imports') ? [] : [{}] }) });
  await assert.rejects(importer(input('invoice', { gmailImportId: 'claim', gmailImportAttempt: 1 })), /claim expired/);
  assert.ok(!calls.includes('createDocument'));
});
test('CSV validation rejects binary data, malformed UTF8 and excessive lines', () => {
  assert.equal(validatePromotionCsv(Buffer.from('Товар;Цена\nСосиски;100')), 'Товар;Цена\nСосиски;100');
  assert.throws(() => validatePromotionCsv(Buffer.from([0,1,2])));
  assert.throws(() => validatePromotionCsv(Buffer.from([0xff,0xfe])));
  assert.throws(() => validatePromotionCsv(Buffer.from('x'.repeat(100001))));
});
