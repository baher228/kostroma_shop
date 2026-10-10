const assert = require('node:assert/strict');
const test = require('node:test');
const { parsePromotionInvoice } = require('../dist/services/promotionInvoiceImportService');
const { classifyPromotionAttachment } = require('../dist/gmail/gmailAttachmentClassifier');
const { promotionInvoicePdf, textPdf } = require('./helpers/promotion-invoice-fixture');

test('actual Unicode PDF text is recognized before any document is persisted', async () => {
  const buffer = promotionInvoicePdf();
  const parsed = await parsePromotionInvoice(buffer);
  assert.deepEqual(parsed.period, { startDate: '2026-10-04', endDate: '2026-10-10' });
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].rawName, 'Сервелат Финский');
  assert.equal(parsed.items[0].promoPrice, 80);
  assert.deepEqual(await classifyPromotionAttachment('C3 Патенты.pdf', buffer), { documentType: 'invoice', reason: null });
});

test('a valid unrelated PDF is skipped rather than classified by extension', async () => {
  const classification = await classifyPromotionAttachment('invoice.pdf', textPdf(['Обычный документ', 'Текст без периода акции и рекомендованных цен']));
  assert.deepEqual(classification, { documentType: null, reason: 'invoice_structure_not_recognized' });
});

test('PDF with no text layer and invalid PDF bytes have separate terminal diagnostics', async () => {
  assert.deepEqual(await classifyPromotionAttachment('scan.pdf', textPdf([])), { documentType: null, reason: 'no_text_layer' });
  assert.deepEqual(await classifyPromotionAttachment('broken.pdf', Buffer.from('not a PDF')), { documentType: null, reason: 'invalid_pdf' });
});
