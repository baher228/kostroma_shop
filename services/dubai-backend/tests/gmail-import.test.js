const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const ExcelJS = require('exceljs');
const parser = require('../dist/gmail/gmailAttachmentParser');
const { classifyPromotionAttachment } = require('../dist/gmail/gmailAttachmentClassifier');
const { GmailService, GmailPollBusyError, buildGmailQuery } = require('../dist/gmail/gmailService');
const { GmailPoller } = require('../dist/gmail/gmailPoller');
const { withGmailRetry, isGmailAuthenticationError, isTemporaryGmailError, sanitizedGmailError } = require('../dist/gmail/gmailClient');
const { PromotionImportPrerequisiteError } = require('../dist/services/promotionDocumentImportService');
const { parsePromotionInvoice, parsePromotionInvoiceText } = require('../dist/services/promotionInvoiceImportService');
const { promotionInvoicePdf, textPdf } = require('./helpers/promotion-invoice-fixture');

const plan = Buffer.from('Наименование;Новая цена;Дата начала;Дата окончания\nСосиски;80;04.10.2026;10.10.2026');
const message = (id = 'message', overrides = {}) => ({ id, internalDate: String(Date.now()), payload: {
  headers: [{ name: 'From', value: 'Allowed <allowed@example.com>' }, { name: 'Subject', value: '' }],
  parts: [{ filename: 'plan.csv', mimeType: 'text/csv', body: { attachmentId: `file-${id}`, size: plan.length } }],
}, ...overrides });
const fakeRepository = () => {
  const records = new Map();
  let locked = false;
  let cursor;
  let cursorQuery;
  return {
    records,
    withGmailPollLock: async (callback) => {
      if (locked) return null;
      locked = true;
      try { return await callback(new AbortController().signal); } finally { locked=false; }
    },
    recoverGmailImportObjects: async () => {},
    failExhaustedGmailImports: async (max) => { for (const record of records.values()) if (record.status === 'processing' && record.attemptCount >= max) record.status='failed'; },
    claimGmailImport: async (input, max) => {
      const key = `${input.messageId}:${input.attachmentKey}`;
      let record = records.get(key);
      if (record && !((record.status === 'failed' && record.retryable || record.status === 'processing') && record.attemptCount < max)) return null;
      if (!record) { record = { ...input, id: key, attemptCount: 0 }; records.set(key, record); }
      record.status='processing'; record.retryable=false; record.attemptCount++;
      return { id: record.id, attemptCount: record.attemptCount };
    },
    setGmailImportHash: async (id, hash, attempt) => { const record=records.get(id); if (record.attemptCount === attempt) record.fileHash=hash; },
    completeGmailImport: async (id,status,options = {}) => {
      const record=records.get(id);
      if (record.status === 'processing' && (options.attemptCount === undefined || options.attemptCount === record.attemptCount)) Object.assign(record,options,{ status });
    },
    hasSuccessfulGmailImportHash: async (hash, id) => [...records.values()].some((r) => r.id !== id && r.status === 'success' && r.fileHash === hash),
    getGmailPollCursor: async (query) => cursorQuery === query ? cursor : undefined,
    setGmailPollCursor: async (query, token) => { cursorQuery=query; cursor=token; },
  };
};
const harness = ({ messages = [message()], repository = fakeRepository(), importDocument, classify, settings = {}, download } = {}) => {
  const imports = [];
  const downloads = [];
  const client = {
    listMessages: async (_query, max, token) => {
      const start=Number(token) || 0;
      return { messages: messages.slice(start,start+max).map((item) => ({ id: item.id })), nextPageToken: start+max < messages.length ? String(start+max) : undefined };
    },
    getMessage: async (id) => messages.find((item) => item.id === id),
    getAttachment: async (id, attachmentId) => { downloads.push(attachmentId); return download ? download(id,attachmentId) : plan.toString('base64url'); },
  };
  const importer = importDocument || (async (input) => {
    imports.push(input);
    await repository.completeGmailImport(input.gmailImportId,'success',{ attemptCount: input.gmailImportAttempt, promotionDocumentId: `document-${input.gmailImportId}` });
    return { document: { id: `document-${input.gmailImportId}` }, import: { imported: 1 } };
  });
  const options = { settings: { allowedSenders: ['allowed@example.com'], ...settings }, dependencies: { repository, importDocument: importer, ...(classify ? { classify } : {}) } };
  return { service: new GmailService(client, options), client, repository, imports, downloads, options };
};

test('Gmail base64url decoding supports padding and rejects malformed input', () => {
  const input = Buffer.from([251,255,0,250]);
  assert.deepEqual(parser.decodeGmailBase64Url(input.toString('base64url')), input);
  assert.deepEqual(parser.decodeGmailBase64Url('SGVsbG8='), Buffer.from('Hello'));
  assert.throws(() => parser.decodeGmailBase64Url('!!token'));
});
test('MIME attachments recurse deeply and support attachmentId plus inline data with stable identity', () => {
  const payload = { parts: [{ parts: [{ parts: [
    { filename: 'invoice.pdf', body: { attachmentId: 'attachment-id' } },
    { partId: '1.2.3', filename: 'plan.csv', body: { data: plan.toString('base64url') } },
    { partId: '1.2.4', filename: 'plan.csv', body: { data: plan.toString('base64url') } },
  ] }] }] };
  const attachments=parser.extractGmailAttachments(payload);
  assert.equal(attachments.length,3);
  assert.equal(attachments[0].attachmentId,'attachment-id');
  assert.equal(attachments[1].inlineData,plan.toString('base64url'));
  assert.notEqual(attachments[1].attachmentKey,attachments[2].attachmentKey);
  assert.deepEqual(parser.extractGmailAttachments(JSON.parse(JSON.stringify(payload))),attachments);
});
test('allowed sender is checked from actual header and empty subject imports normally', async () => {
  const pdf=promotionInvoicePdf();
  const email=message();
  email.payload.parts[0]={ filename: 'C3 2110468 Патенты 14.10.pdf',mimeType: 'application/pdf',body: { attachmentId: 'invoice',size: pdf.length } };
  const h=harness({ messages: [email],download: async () => pdf.toString('base64url') });
  assert.equal((await h.service.poll()).imported,1);
  assert.equal([...h.repository.records.values()][0].subject,'');
  assert.equal(h.imports[0].uploadedBy,'gmail:allowed@example.com');
  assert.equal(h.imports[0].documentType,'invoice');
  assert.equal(parser.senderAddress('Allowed <ALLOWED@example.com>'),'allowed@example.com');
  assert.ok(parser.senderAllowed('allowed@example.com',['allowed@example.com']));
  assert.match(buildGmailQuery('has:attachment',['allowed@example.com']),/from:"allowed@example.com"/);
});
test('blocked or malformed sender never downloads attachments despite Gmail search results', async () => {
  for (const from of ['blocked@example.com','allowed@example.com,attacker@example.com','Allowed <allowed@example.com> attacker@example.com']) {
    const m=message(); m.payload.headers[0].value=from;
    const h=harness({ messages: [m] });
    assert.equal((await h.service.poll()).imported,0);
    assert.equal(h.downloads.length,0);
  }
});
test('signature PNG, oversized metadata and empty inline attachment are skipped', async () => {
  const m=message(); m.payload.parts=[
    { filename: 'signature.png', mimeType: 'image/png', body: { attachmentId: 'png',size: 100 } },
    { filename: 'huge.pdf', mimeType: 'application/pdf', body: { attachmentId: 'huge',size: 26*1024*1024 } },
    { filename: 'empty.csv', mimeType: 'text/csv', body: { data: '',size: 0 } },
  ];
  const h=harness({ messages: [m] });
  const result=await h.service.poll();
  assert.equal(result.imported,0); assert.equal(result.skipped,3); assert.equal(h.downloads.length,0);
});
test('PDF recognition requires magic, period, recommended retail prices and at least one item', async () => {
  const parsed=await parsePromotionInvoice(promotionInvoicePdf());
  assert.equal(parsed.items.length,1);
  assert.equal((await classifyPromotionAttachment('C3 2110468 Патенты 14.10.pdf',promotionInvoicePdf())).documentType,'invoice');
  assert.equal((await classifyPromotionAttachment('fake.pdf',Buffer.from('not PDF'))).reason,'invalid_pdf');
  assert.equal((await classifyPromotionAttachment('unrelated.pdf',textPdf(['Hello world']))).documentType,null);
  assert.throws(() => parsePromotionInvoiceText(''),/no_text_layer/);
  assert.equal((await classifyPromotionAttachment('scanned.pdf',textPdf(['']))).reason,'no_text_layer');
});
test('XLSX classifier recognizes price list and plan, rejects invalid and ambiguous workbooks', async () => {
  const price=new ExcelJS.Workbook();
  price.addWorksheet('Price').addRows([['','Наименование','Чистое наименование','Розничная цена'],['','Сосиски','Сосиски',100]]);
  const priceBuffer=Buffer.from(await price.xlsx.writeBuffer());
  assert.equal((await classifyPromotionAttachment('price.xlsx',priceBuffer)).documentType,'retail_price_list');
  const promotion=new ExcelJS.Workbook();
  promotion.addWorksheet('Plan').addRows([['Наименование','Новая цена','Дата начала','Дата окончания'],['Сосиски',80,new Date('2026-10-04'),new Date('2026-10-10')]]);
  assert.equal((await classifyPromotionAttachment('plan.xlsx',Buffer.from(await promotion.xlsx.writeBuffer()))).documentType,'two_month_plan');
  price.addWorksheet('Plan').addRows([['Наименование','Новая цена','Дата начала'],['Сосиски',80,'04.10.2026']]);
  assert.equal((await classifyPromotionAttachment('ambiguous.xlsx',Buffer.from(await price.xlsx.writeBuffer()))).reason,'ambiguous_workbook');
  assert.equal((await classifyPromotionAttachment('invalid.xlsx',Buffer.from('bad'))).documentType,null);
  assert.equal((await classifyPromotionAttachment('legacy.xls',Buffer.from('bad'))).reason,'legacy_xls_needs_xlsx_conversion');
  assert.equal((await classifyPromotionAttachment('binary.csv',Buffer.from([0,1,2]))).documentType,null);
});
test('same message and duplicate MIME attachment import once across100polls and new service restart', async () => {
  const m=message(); m.payload.parts[0].partId='1'; m.payload.parts.push(m.payload.parts[0]);
  const h=harness({ messages: [m,m] });
  for (let i=0;i<100;i++) await h.service.poll();
  await new GmailService(h.client,h.options).poll();
  assert.equal(h.imports.length,1); assert.equal(h.repository.records.size,1);
  assert.equal(h.downloads.length,2); // classification + import; terminal polls download nothing.
});

test('rotating Gmail download IDs preserve MIME identity across polls and restart without global hash dedupe', async () => {
  for (const partId of ['1', undefined]) {
    const m=message(); m.payload.parts[0].partId=partId;
    const h=harness({ messages: [m],settings: { globalDedupe: false } });
    for (let i=0;i<5;i++) {
      m.payload.parts[0].body.attachmentId=`download-${i}`;
      await new GmailService(h.client,h.options).poll();
    }
    assert.equal(h.imports.length,1);
    assert.equal(h.repository.records.size,1);
    assert.deepEqual(h.downloads,['download-0','download-0']);
  }
});

test('distinct MIME parts with identical names and bytes remain independent without global hash dedupe', async () => {
  for (const partIds of [['1','2'],[undefined,undefined]]) {
    const m=message();
    m.payload.parts=partIds.map((partId) => ({ ...m.payload.parts[0],partId }));
    const h=harness({ messages: [m],settings: { globalDedupe: false } });
    assert.equal((await h.service.poll()).imported,2);
    assert.equal(h.repository.records.size,2);
  }
});
test('inline body.data imports through same service after releasing preparation payload', async () => {
  const m=message(); m.payload.parts[0].body={ data: plan.toString('base64url'),size: plan.length };
  const h=harness({ messages: [m] });
  assert.equal((await h.service.poll()).imported,1); assert.deepEqual(h.imports[0].buffer,plan); assert.equal(h.downloads.length,0);
});
test('attachments are preclassified before price-list, plan, invoice priority import', async () => {
  const m=message(); m.payload.parts=['invoice.pdf','plan.csv','price.xlsx'].map((filename) => ({ filename,mimeType: 'application/octet-stream',body: { attachmentId: filename } }));
  const h=harness({ messages: [m], classify: async (filename) => ({ documentType: filename.endsWith('.pdf') ? 'invoice' : filename.endsWith('.xlsx') ? 'retail_price_list' : 'two_month_plan',reason: null }) });
  assert.equal((await h.service.poll()).imported,3);
  assert.deepEqual(h.imports.map((item) => item.documentType),['retail_price_list','two_month_plan','invoice']);
});
test('temporary import failure and invoice prerequisite retry stop at configured attempt limit', async () => {
  for (const error of [Object.assign(new Error('timeout'),{ code: 'ETIMEDOUT' }),new PromotionImportPrerequisiteError()]) {
    let attempts=0;
    const h=harness({ importDocument: async () => { attempts++; throw error; },settings: { maxAttempts: 3 } });
    for (let i=0;i<5;i++) await h.service.poll();
    assert.equal(attempts,3);
    const record=[...h.repository.records.values()][0];
    assert.equal(record.attemptCount,3); assert.equal(record.retryable,false); assert.match(record.error,/лимит/);
  }
});
test('deterministic parser error is terminal while global SHA dedupe is opt-in', async () => {
  let attempts=0;
  const h=harness({ importDocument: async () => { attempts++; throw new Error('parser error'); } });
  await h.service.poll(); await h.service.poll(); assert.equal(attempts,1);
  const deduped=harness({ messages: [message('one'),message('two')],settings: { globalDedupe: true } });
  assert.equal((await deduped.service.poll()).imported,1);
  const normal=harness({ messages: [message('one'),message('two')] });
  assert.equal((await normal.service.poll()).imported,2);
});
test('bounded persistent Gmail cursor reaches older messages across restarted instances', async () => {
  const h=harness({ messages: Array.from({ length: 101 },(_,index) => message(String(index))),settings: { maxMessages: 100 },classify: async () => ({ documentType: 'two_month_plan',reason: null }) });
  assert.equal((await h.service.poll()).imported,100);
  assert.equal((await new GmailService(h.client,h.options).poll()).imported,1);
  assert.equal((await new GmailService(h.client,h.options).poll()).imported,0);
  assert.equal(h.repository.records.size,101);
});
test('expired Gmail page token resets once and query change resets persisted cursor', async () => {
  const h=harness({ messages: [message('one'),message('two')],settings: { maxMessages: 1 },classify: async () => ({ documentType: 'two_month_plan',reason: null }) });
  await h.service.poll();
  const list=h.client.listMessages;
  let expired=0;
  h.client.listMessages=async (query,max,token) => {
    if (token && expired++ === 0) throw Object.assign(new Error('Invalid PageToken'),{ code: 400 });
    return list(query,max,token);
  };
  const refreshed=new GmailService(h.client,h.options);
  assert.equal((await refreshed.poll()).imported,0); // restarts at terminal first page safely.
  assert.equal((await refreshed.poll()).imported,1);
  const calls=[];
  h.client.listMessages=async (query,max,token) => { calls.push(token); return list(query,max,token); };
  await new GmailService(h.client,{ ...h.options,settings: { ...h.options.settings,query: 'has:attachment newer_than:60d' } }).poll();
  assert.equal(calls[0],undefined);
});
test('lost poll lock cannot fail a newer recovered claim', async () => {
  const repository=fakeRepository();
  const controller=new AbortController();
  repository.withGmailPollLock=async (callback) => callback(controller.signal);
  const h=harness({ repository,importDocument: async (input) => {
    const record=repository.records.get(input.gmailImportId);
    record.attemptCount++; // simulate another process recovering the claim.
    controller.abort(new Error('lock lost'));
    throw new Error('old R2 upload interrupted');
  } });
  await assert.rejects(h.service.poll(),/lock lost/);
  const record=[...repository.records.values()][0];
  assert.equal(record.attemptCount,2); assert.equal(record.status,'processing');
  await repository.completeGmailImport(record.id,'failed',{ attemptCount: 1 });
  assert.equal(record.status,'processing');
});
test('temporary Gmail failures retry with bounded attempts; invalid_grant never retries or exposes secrets', async () => {
  let attempts=0;
  assert.equal(await withGmailRetry(async () => { if (++attempts < 3) throw { response: { status: 429 } }; return 'ok'; },3,async () => {}),'ok');
  assert.equal(attempts,3);
  const auth=Object.assign(new Error('invalid_grant secret=refresh_token_value'),{ response: { status: 401, data: { client_secret: 'client_secret_value' } } });
  attempts=0;
  await assert.rejects(withGmailRetry(async () => { attempts++; throw auth; },3,async () => {}));
  assert.equal(attempts,1); assert.ok(isGmailAuthenticationError(auth)); assert.ok(!isTemporaryGmailError(auth));
  assert.ok(!sanitizedGmailError(auth).includes('refresh_token_value'));
  assert.ok(!sanitizedGmailError(auth).includes('client_secret_value'));
});
test('poller does not overlap and authentication failure leaves backend cached health usable', async () => {
  let release; const barrier=new Promise((resolve) => { release=resolve; }); let polls=0;
  const poller=new GmailPoller({ enabled: true,intervalMs: 60000,createService: () => ({ poll: async () => { polls++; await barrier; return { messages: 1,attachments: 1,imported: 1,skipped: 0,failed: 0 }; } }) });
  const running=poller.pollNow();
  await assert.rejects(poller.pollNow(),GmailPollBusyError);
  assert.equal(polls,1); assert.equal(poller.getHealth().running,true); release(); await running;
  assert.equal(poller.getHealth().authenticated,true); assert.ok(poller.getHealth().lastImportAt); await poller.stop();
  const broken=new GmailPoller({ enabled: true,intervalMs: 60000,createService: () => ({ poll: async () => { throw new Error('invalid_grant access_token=hidden'); } }) });
  await assert.rejects(broken.pollNow());
  const health=broken.getHealth(); assert.equal(health.authenticated,false); assert.equal(health.running,false); assert.match(health.lastError,/авторизации/); assert.ok(!JSON.stringify(health).includes('hidden')); await broken.stop();
});
test('repository SQL fences stale attempts and ignores terminal success', async (t) => {
  const { opsDb }=require('../dist/db/opsDb');
  const repository=require('../dist/repositories/gmailImportsRepository');
  const calls=[];
  t.mock.method(opsDb,'query',async (sql,params) => { calls.push({ sql,params }); return { rows: [] }; });
  await repository.completeGmailImport('claim','failed',{ attemptCount: 1,retryable: true });
  await repository.setGmailImportHash('claim','hash',1);
  assert.match(calls[0].sql,/status='processing'/); assert.match(calls[0].sql,/attempt_count=\$6/); assert.equal(calls[0].params[5],1);
  assert.match(calls[1].sql,/attempt_count=\$3/);
});
test('reserved PostgreSQL poll session aborts work on connection error instead of emitting unhandled error', async (t) => {
  const db=require('../dist/db/opsDb'); const repository=require('../dist/repositories/gmailImportsRepository');
  const client=new EventEmitter(); client.query=async () => ({ rows: [{ locked: true }] });
  t.mock.method(db,'withOpsSession',async (callback) => callback(client));
  await assert.rejects(repository.withGmailPollLock(async (signal) => { client.emit('error',new Error('connection lost')); assert.equal(signal.aborted,true); signal.throwIfAborted(); }),/lock lost/);
});
