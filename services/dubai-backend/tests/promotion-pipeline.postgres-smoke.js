// Opt-in integration test. Use only a disposable local database ending in _test.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const databaseUrl = process.env.PROMOTION_SMOKE_DATABASE_URL;
if (!databaseUrl) throw new Error('Set PROMOTION_SMOKE_DATABASE_URL to a disposable local PostgreSQL database.');
const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.endsWith('_test')) {
  throw new Error('Smoke test requires a local database with a name ending in _test.');
}
process.env.OPS_DATABASE_URL = databaseUrl;
process.env.GMAIL_ENABLED = 'false';
const ExcelJS = require('exceljs');
const { opsDb } = require('../dist/db/opsDb');
const { runMigrations } = require('../dist/db/migrate');
const repository = require('../dist/repositories/gmailImportsRepository');
const { listPromotionRows } = require('../dist/repositories/promotionRowsRepository');
const { listPromotionDocuments } = require('../dist/repositories/promotionDocumentsRepository');
const { createPromotionDocumentImporter } = require('../dist/services/promotionDocumentImportService');
const { importPromotionPriceList } = require('../dist/services/promotionPriceListImportService');
const { parsePromotionInvoice } = require('../dist/services/promotionInvoiceImportService');
const { createPromotionPriceTagBatch } = require('../dist/services/promotionPriceTagBatchService');
const { createPromotionDocumentPreview } = require('../dist/services/promotionDocumentPreviewService');
const { GmailService } = require('../dist/gmail/gmailService');
const { promotionInvoicePdf } = require('./helpers/promotion-invoice-fixture');

const main = async () => {
  await runMigrations();
  const suffix = randomUUID().slice(0, 8);
  const product = `Сервелат Финский ${suffix}`;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Прайс');
  worksheet.addRow(['', 'Наименование', 'Чистое наименование', 'Розничная цена']);
  worksheet.addRow(['', product, product, 120]);
  const price = Buffer.from(await workbook.xlsx.writeBuffer());
  const plan = Buffer.from(`Наименование;Новая цена;Дата начала;Дата окончания\n${product};90;04.10.2026;10.10.2026`);
  const invoice = promotionInvoicePdf(product);
  const parsed = await parsePromotionInvoice(invoice);
  assert.equal(parsed.items[0].rawName, product);
  const files = new Map([['price', price], ['plan', plan], ['invoice', invoice]]);
  const objects = new Map();
  const deletedKeys = [];
  const importer = createPromotionDocumentImporter({
    upload: async ({ key, body }) => { objects.set(key, Buffer.from(body)); },
    deleteObject: async (key) => { deletedKeys.push(key); objects.delete(key); },
  });
  const messageId = `smoke-${suffix}`;
  const attachments = [
    { filename: 'C3 Патенты.pdf', mimeType: 'application/pdf', body: { attachmentId: 'invoice', size: invoice.length } },
    { filename: 'план.csv', mimeType: 'text/csv', body: { attachmentId: 'plan', size: plan.length } },
    { filename: 'прайс.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: { attachmentId: 'price', size: price.length } },
  ];
  attachments.forEach((part,index) => { part.partId=String(index+1); });
  let downloadEpoch=0;
  let downloads=0;
  const client = {
    listMessages: async () => ({ messages: [{ id: messageId }, { id: messageId }] }),
    getMessage: async () => ({
      internalDate: String(Date.now()),
      payload: { headers: [{ name: 'From', value: 'Allowed <allowed@example.com>' }, { name: 'Subject', value: '' }], parts: [{ parts: attachments.map((part) => ({ ...part,body: { ...part.body,attachmentId: `${downloadEpoch}:${part.body.attachmentId}` } })) }] },
    }),
    getAttachment: async (_id, attachmentId) => { downloads++; return files.get(attachmentId.split(':')[1]).toString('base64url'); },
  };
  const options = {
    settings: { allowedSenders: ['allowed@example.com'], allowedExtensions: ['.pdf', '.xlsx', '.csv'],globalDedupe: false },
    dependencies: { importDocument: importer },
  };
  const first = await new GmailService(client, options).poll();
  assert.equal(first.imported, 3);
  assert.equal(first.failed, 0);
  const sourceDocuments = (await listPromotionDocuments()).filter((doc) => doc.uploadedBy === 'gmail:allowed@example.com' && objects.has(doc.storageKey));
  assert.equal(sourceDocuments.length, 3);
  const rows = (await listPromotionRows()).filter((row) => row.productName === product);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].regularPrice, 120);
  assert.equal(rows[0].promoPrice, 80);
  assert.ok(rows[0].invoiceDocumentId);
  assert.ok(rows[0].planDocumentId);
  assert.equal((await createPromotionDocumentPreview('прайс.xlsx', price)).sheets[0].rows[1][2], product);
  const batch = await createPromotionPriceTagBatch({ scope: 'selected', rowNumbers: [rows[0].rowNumber], layout: 'a4_2x2' });
  assert.equal(batch.pageCount, 1);
  assert.equal(batch.pdf.subarray(0, 5).toString(), '%PDF-');

  // A fresh service and rotated Gmail download handles must keep claims terminal.
  downloadEpoch++;
  const firstDownloads=downloads;
  const repeated = await new GmailService(client, options).poll();
  assert.equal(repeated.imported, 0);
  assert.equal(downloads,firstDownloads);
  assert.equal(objects.size, 3);
  const successful = await opsDb.query('SELECT * FROM gmail_imports WHERE message_id = $1;', [messageId]);
  assert.equal(successful.rows.length, 3);
  for (const row of successful.rows) {
    assert.equal(row.status, 'success');
    assert.equal(row.attempt_count, 1);
    assert.ok(row.promotion_document_id);
    await repository.completeGmailImport(row.id, 'failed', { error: 'lost_commit_reply', retryable: true });
  }
  assert.equal((await opsDb.query("SELECT COUNT(*)::int AS count FROM gmail_imports WHERE message_id=$1 AND status='success';", [messageId])).rows[0].count, 3);

  // Nested repository commits must not escape the import transaction.
  const failingPrice = createPromotionDocumentImporter({
    upload: async ({ key, body }) => { objects.set(key, Buffer.from(body)); },
    deleteObject: async (key) => { deletedKeys.push(key); objects.delete(key); },
    priceList: async (input) => { await importPromotionPriceList(input); throw new Error('forced-parser-failure'); },
  });
  const modified = new ExcelJS.Workbook();
  const modifiedSheet = modified.addWorksheet('Прайс');
  modifiedSheet.addRow(['', 'Наименование', 'Чистое наименование', 'Розничная цена']);
  modifiedSheet.addRow(['', product, product, 999]);
  await assert.rejects(failingPrice({ documentType: 'retail_price_list', fileName: `rollback-${suffix}.xlsx`, contentType: 'application/octet-stream', buffer: Buffer.from(await modified.xlsx.writeBuffer()), uploadedBy: 'smoke-rollback' }), /forced-parser-failure/);
  const prices = await opsDb.query('SELECT regular_price FROM promotion_price_list_items WHERE product_name_clean=$1;', [product]);
  assert.equal(Number(prices.rows[0].regular_price), 120);
  assert.equal((await listPromotionDocuments()).filter((doc) => doc.uploadedBy === 'smoke-rollback').length, 0);
  assert.equal(objects.size, 3);
  assert.equal(deletedKeys.length, 1);
  assert.equal((await opsDb.query('SELECT COUNT(*)::int AS count FROM promotion_import_objects;')).rows[0].count, 0);

  // PostgreSQL serializes independent service instances across a full poll.
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const held = repository.withGmailPollLock(async () => { entered(); await barrier; return true; });
  await ready;
  assert.equal(await repository.withGmailPollLock(async () => true), null);
  release();
  assert.equal(await held, true);
  // OAuth state expiry and one-time consumption use real PostgreSQL, rather
  // than an in-memory approximation of DELETE ... RETURNING.
  const connections = require('../dist/repositories/gmailConnectionRepository');
  await connections.saveGmailOAuthState('expired-state','browser','encrypted-verifier');
  await opsDb.query("UPDATE gmail_oauth_states SET expires_at=NOW() - INTERVAL '1 second' WHERE state_hash='expired-state';");
  assert.equal(await connections.consumeGmailOAuthState('expired-state','browser'),null);
  await connections.saveGmailOAuthState('valid-state','browser','encrypted-verifier');
  assert.equal(await connections.consumeGmailOAuthState('valid-state','wrong-browser'),null);
  assert.equal(await connections.consumeGmailOAuthState('valid-state','browser'),'encrypted-verifier');
  assert.equal(await connections.consumeGmailOAuthState('valid-state','browser'),null);
  await connections.saveGmailConnection('first@example.com','encrypted-token-one');
  assert.equal((await connections.readGmailConnection()).refresh_token_encrypted,'encrypted-token-one');
  await connections.saveGmailConnection('second@example.com','encrypted-token-two');
  assert.equal((await connections.readGmailConnection()).email,'second@example.com');
  assert.equal((await opsDb.query('SELECT COUNT(*)::int AS count FROM gmail_connection;')).rows[0].count,1);
  await connections.deleteGmailConnection();
  assert.equal(await connections.readGmailConnection(),null);
  // Gmail message/attachment IDs are unique only within a mailbox. A switch
  // must not inherit terminal claims from the previous mailbox.
  const metadata = { messageId: `shared-id-${suffix}`,attachmentId: 'attachment',attachmentKey: 'shared-attachment',
    filename: 'plan.csv',mimeType: 'text/csv',sender: 'sender@example.com',subject: '',receivedAt: null };
  const claimOne = await repository.claimGmailImport({ ...metadata,mailbox: 'first@example.com' },3);
  assert.ok(claimOne);
  await repository.completeGmailImport(claimOne.id,'skipped');
  assert.equal(await repository.claimGmailImport({ ...metadata,mailbox: 'first@example.com' },3),null);
  assert.ok(await repository.claimGmailImport({ ...metadata,mailbox: 'second@example.com' },3));
  console.log('PostgreSQL smoke PASS: migrations, PDF recognition, priority, Gmail→document→parsers→row→A4 PDF, restart dedupe, terminal success, nested rollback, R2 compensation, poll locking.');
  console.log('OAuth PostgreSQL smoke PASS: expiring browser-bound one-time states, persistent single mailbox, disconnect and mailbox-scoped import claims.');
};

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => opsDb.close());
