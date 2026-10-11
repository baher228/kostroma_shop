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
const { promotionInvoicePdf,textPdf } = require('./helpers/promotion-invoice-fixture');
const deliveryRepository=require('../dist/repositories/gmailDeliveryRepository');
const {createGmailDeliveryProcessor}=require('../dist/gmail/gmailDeliveryProcessor');
const {createPromotionPackageBuilder}=require('../dist/gmail/gmailPromotionPackage');
const {readPackageFile,readPackageFileIndex}=require('../dist/gmail/gmailPackageStorage');

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
      payload: { headers: [{ name: 'From', value: 'Allowed <allowed@example.com>' }, { name: 'Subject', value: '' },
        {name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.com'}], parts: [{ parts: attachments.map((part) => ({ ...part,body: { ...part.body,attachmentId: `${downloadEpoch}:${part.body.attachmentId}` } })) }] },
    }),
    getAttachment: async (_id, attachmentId) => { downloads++; return files.get(attachmentId.split(':')[1]).toString('base64url'); },
  };
  const options = {
    mailbox:'smoke@example.com',
    settings: { allowedSenders: ['allowed@example.com'], allowedExtensions: ['.pdf', '.xlsx', '.csv'],globalDedupe: false,requireAuthentication:true },
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

  // Adjacent invoice periods consolidate in the table. The queued email must
  // still use the original message's own period and prices, not the new ones.
  await importer({documentType:'invoice',fileName:'adjacent.pdf',contentType:'application/pdf',uploadedBy:'smoke-adjacent',buffer:textPdf([
    'Период акции: 11.10.2026 - 20.10.2026','Рекомендованные розничные цены:',`${product} - 70 р/кг`])});
  const queued=(await opsDb.query('SELECT * FROM gmail_deliveries WHERE mailbox=$1 AND message_id=$2;',['smoke@example.com',messageId])).rows;
  assert.equal(queued.length,1);assert.equal(queued[0].status,'queued');
  const mailObjects=new Map();const sent=[];
    const deliveryRecipient=`recipient-${suffix}@example.com`;
    const processor=createGmailDeliveryProcessor({repository:{...deliveryRepository,
      readGmailDeliverySettings:async()=>({recipient:deliveryRecipient,allowedSenders:['allowed@example.com'],autoSend:true}),
    pendingGmailDeliveries:async()=>(await opsDb.query("SELECT * FROM gmail_deliveries WHERE id=$1 AND status NOT IN ('sent','failed');",[queued[0].id])).rows},
    getConnection:async()=>({mailbox:'smoke@example.com',canSend:true,client:{...client,sendMessage:async raw=>{sent.push(raw);return 'fake-sent-id';},findSentMessage:async()=>null}}),
    build:createPromotionPackageBuilder({findPoster:async()=>({best:null,candidates:[]})}),
    upload:async({key,body})=>mailObjects.set(key,body),download:async key=>({body:mailObjects.get(key)})});
  await processor();await processor();assert.equal(sent.length,1);
  const delivered=(await opsDb.query('SELECT * FROM gmail_deliveries WHERE id=$1;',[queued[0].id])).rows[0];
    assert.equal(delivered.status,'sent');assert.equal(delivered.recipient,deliveryRecipient);
  assert.equal(delivered.rows_snapshot.length,1);assert.equal(delivered.rows_snapshot[0].promoPrice,80);
  assert.equal(delivered.rows_snapshot[0].startDate,'2026-10-04');assert.equal(delivered.rows_snapshot[0].endDate,'2026-10-10');
  const download=async key=>({body:mailObjects.get(key)});
  const packageFiles=await readPackageFileIndex(delivered.storage_key,download);
  assert.equal(packageFiles.length,1);assert.ok(packageFiles[0].name.includes('Ценник'));
  assert.equal((await readPackageFile(delivered.storage_key,0,download)).body.subarray(0,5).toString(),'%PDF-');
  assert.ok(!Buffer.from(sent[0],'base64url').toString().includes('application/zip'));
  const requestId=randomUUID();const manualRows=delivered.rows_snapshot;
  const manualOne=await deliveryRepository.createManualGmailDelivery('smoke@example.com',requestId,manualRows);
  const manualTwo=await deliveryRepository.createManualGmailDelivery('smoke@example.com',requestId,manualRows);
  assert.equal(manualOne.id,manualTwo.id);
  const resendRequest=`resend:${delivered.id}:${randomUUID()}`;
  const resend=await deliveryRepository.createManualGmailDelivery(delivered.mailbox,resendRequest,manualRows);
  const resendAgain=await deliveryRepository.createManualGmailDelivery(delivered.mailbox,resendRequest,manualRows);
  assert.equal(resend.id,resendAgain.id);assert.notEqual(resend.send_message_id,delivered.send_message_id);
  assert.equal((await deliveryRepository.getGmailDelivery(delivered.id)).status,'sent');
    // The daily quota is global for a recipient, including uncertain sends,
    // but excludes old sends and definite provider rejections.
    const quotaIds=[];
    for(const status of ['sent','sent','sent','unknown']){
      const id=randomUUID();quotaIds.push(id);
      await opsDb.query(`INSERT INTO gmail_deliveries(id,mailbox,source_key,status,recipient,send_message_id,send_started_at,sent_at)
        VALUES($1,'quota-test',$1,$2,$3,$1,NOW(),CASE WHEN $2='sent' THEN NOW() END);`,[id,status,deliveryRecipient.toUpperCase()]);
    }
    assert.equal(await deliveryRepository.canSendGmailToRecipient(deliveryRecipient),false);
    assert.equal(await deliveryRepository.canSendGmailToRecipient('other@example.com'),true);
    await opsDb.query("UPDATE gmail_deliveries SET status='failed' WHERE id=$1;",[quotaIds[3]]);
    assert.equal(await deliveryRepository.canSendGmailToRecipient(deliveryRecipient),true);
    await opsDb.query("UPDATE gmail_deliveries SET status='unknown',send_started_at=NOW()-INTERVAL '25 hours' WHERE id=$1;",[quotaIds[3]]);
    assert.equal(await deliveryRepository.canSendGmailToRecipient(deliveryRecipient),true);
    await opsDb.query("UPDATE gmail_deliveries SET send_started_at=NOW() WHERE id=$1;",[quotaIds[3]]);
    const limitedProcessor=createGmailDeliveryProcessor({repository:{...deliveryRepository,
      readGmailDeliverySettings:async()=>({recipient:deliveryRecipient,allowedSenders:['allowed@example.com'],autoSend:true}),
      pendingGmailDeliveries:async()=>(await opsDb.query('SELECT * FROM gmail_deliveries WHERE id=$1;',[manualOne.id])).rows},
      getConnection:async()=>({mailbox:'smoke@example.com',canSend:true,client:{sendMessage:async()=>{throw Error('Quota must prevent Gmail request');}}}),
      build:createPromotionPackageBuilder({findPoster:async()=>({best:null,candidates:[]})}),
      upload:async({key,body})=>mailObjects.set(key,body)});
    await limitedProcessor();const limited=await deliveryRepository.getGmailDelivery(manualOne.id);
    assert.equal(limited.status,'ready');assert.ok(limited.error.includes('5 писем'));
    await opsDb.query('DELETE FROM gmail_deliveries WHERE id=ANY($1);',[quotaIds]);
  const expectedObjects=objects.size;

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
  assert.equal(objects.size, expectedObjects);
  assert.equal(deletedKeys.length, 1);
  assert.equal((await opsDb.query('SELECT COUNT(*)::int AS count FROM promotion_import_objects;')).rows[0].count, 0);

  const rollbackMessage=`queue-rollback-${suffix}`;
  const rollbackClaim=await repository.claimGmailImport({mailbox:'smoke@example.com',messageId:rollbackMessage,attachmentId:'rollback',attachmentKey:'rollback',
    filename:'rollback.pdf',mimeType:'application/pdf',sender:'allowed@example.com',subject:'',receivedAt:null},3);
  const failingQueue=createPromotionDocumentImporter({upload:async({key,body})=>objects.set(key,body),deleteObject:async key=>objects.delete(key),
    query:async(sql,params)=>{if(sql.includes('INSERT INTO gmail_deliveries'))throw Error('forced-queue-failure');return opsDb.query(sql,params);}});
  await assert.rejects(failingQueue({documentType:'invoice',fileName:'queue-rollback.pdf',contentType:'application/pdf',buffer:invoice,uploadedBy:'smoke-queue-rollback',
    gmailImportId:rollbackClaim.id,gmailImportAttempt:rollbackClaim.attemptCount}),/forced-queue-failure/);
  assert.equal((await opsDb.query('SELECT COUNT(*)::int AS count FROM gmail_deliveries WHERE message_id=$1;',[rollbackMessage])).rows[0].count,0);
  assert.equal((await opsDb.query('SELECT status FROM gmail_imports WHERE id=$1;',[rollbackClaim.id])).rows[0].status,'processing');
  assert.equal((await listPromotionDocuments()).filter(doc=>doc.uploadedBy==='smoke-queue-rollback').length,0);
  assert.equal(objects.size,expectedObjects);

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
  console.log('Email PostgreSQL smoke PASS: atomic invoice/outbox rollback, exact source snapshot, separate PDF files/MIME/fake-send, quota, restart dedupe and idempotent resend queue.');
};

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => opsDb.close());
