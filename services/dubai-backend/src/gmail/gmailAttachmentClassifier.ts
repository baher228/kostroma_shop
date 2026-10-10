import ExcelJS from 'exceljs';
import { ImportablePromotionDocumentType, validatePromotionCsv } from '../services/promotionDocumentImportService';
import { parsePromotionInvoice, PromotionInvoiceRecognitionError } from '../services/promotionInvoiceImportService';
import { parsePromotionPlan } from '../services/promotionPlanImportService';
import { parsePromotionPriceList } from '../services/promotionPriceListImportService';
import { fileExtension } from './gmailAttachmentParser';

export type AttachmentClassification = { documentType: ImportablePromotionDocumentType | null; reason: string | null };
const normalize = (value: string) => value.normalize('NFC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const classifyPromotionAttachment = async (filename: string,buffer: Buffer): Promise<AttachmentClassification> => {
  if (!buffer.byteLength) return { documentType: null,reason: 'empty_attachment' };
  const extension = fileExtension(filename);
  try {
    if (extension === '.pdf') {
      await parsePromotionInvoice(buffer);
      return { documentType: 'invoice',reason: null };
    }
    if (extension === '.csv') {
      validatePromotionCsv(buffer);
      await parsePromotionPlan(buffer,filename);
      return { documentType: 'two_month_plan',reason: null };
    }
    // ExcelJS does not support the legacy binary XLS format. Never pretend to
    // import it as XLSX or use its filename as sufficient classification.
    if (extension === '.xls') return { documentType: null,reason: 'legacy_xls_needs_xlsx_conversion' };
    if (extension !== '.xlsx') return { documentType: null,reason: 'unsupported_extension' };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
    let priceListSignal = false;
    let planSignal = false;
    workbook.eachSheet((worksheet) => worksheet.eachRow((row,rowNumber) => {
      if (rowNumber > 60) return;
      const values: string[] = [];
      row.eachCell({ includeEmpty: true },(cell,column) => { values[column-1] = normalize(cell.text || ''); });
      const isPriceHeader = (values[2] || '').includes('чист') && (values[3] || '').includes('рознич');
      if (isPriceHeader) priceListSignal = true;
      if (!isPriceHeader && values.some((value) => /наименование|товар|позици/u.test(value)) && values.some((value) =>
        /^ррц$/.test(value) || /цен/u.test(value) && /нов|акц|рекоменд/u.test(value) || /дат/u.test(value) && /нача|оконч/u.test(value))) planSignal = true;
    }));
    if (priceListSignal && planSignal) return { documentType: null,reason: 'ambiguous_workbook' };
    if (priceListSignal) {
      await parsePromotionPriceList({ buffer,sourceDocumentId: '',sourceFileName: filename });
      return { documentType: 'retail_price_list',reason: null };
    }
    if (planSignal) {
      await parsePromotionPlan(buffer,filename);
      return { documentType: 'two_month_plan',reason: null };
    }
    return { documentType: null,reason: 'document_structure_not_recognized' };
  } catch (error) {
    return { documentType: null,reason: error instanceof PromotionInvoiceRecognitionError ? error.reason : 'invalid_content_or_document_structure' };
  }
};
