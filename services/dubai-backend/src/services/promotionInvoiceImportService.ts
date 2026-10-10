import { PDFParse } from 'pdf-parse';
import {
  listPromotionPriceListItems,
} from '../repositories/promotionPriceListRepository';
import { upsertPromotionDocumentRows } from '../repositories/promotionRowsRepository';
import { matchPromotionProduct } from './promotionProductMatcher';

export type ParsedInvoiceItem = {
  rawName: string;
  promoPrice: number;
  sourceLineText: string;
};

const RU = {
  period: '\u043f\u0435\u0440\u0438\u043e\u0434',
  action: '\u0430\u043a\u0446\u0438',
  recommended: '\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u043e\u0432\u0430\u043d',
  retail: '\u0440\u043e\u0437\u043d\u0438\u0447',
  price: '\u0446\u0435\u043d',
  chief: '\u043d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a',
  places: '\u043c\u0435\u0441\u0442\u0430',
  productName: '\u043d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435',
  product: '\u043f\u0440\u043e\u0434\u0443\u043a\u0442',
  rub: '\u0440',
  yo: '\u0451',
  ye: '\u0435',
};

const lower = (value: string) => value.normalize('NFC').toLowerCase().replaceAll(RU.yo, RU.ye);

const dashChars = '\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212';

const parseRuDate = (value: string) => {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const statusForPeriod = (startDate: string, endDate: string) => {
  const today = new Date().toISOString().slice(0, 10);
  if (endDate < today) return 'past';
  if (startDate > today) return 'future';
  return 'current';
};

const parseMoney = (value: string) => {
  const number = Number(value.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const extractPeriod = (text: string) => {
  const line = text
    .split(/\r?\n/)
    .find((item) => {
      const value = lower(item);
      return value.includes(RU.period) && value.includes(RU.action) && /\d{2}\.\d{2}\.\d{4}/.test(value);
    });
  if (!line) throw new Error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0439\u0442\u0438 \u043f\u0435\u0440\u0438\u043e\u0434 \u0430\u043a\u0446\u0438\u0438 \u0432 PDF.');

  const dates = [...line.matchAll(/(\d{2}\.\d{2}\.\d{4})/g)].map((match) => match[1]);
  const startDate = parseRuDate(dates[0] || '');
  const endDate = parseRuDate(dates[1] || '');
  if (!startDate || !endDate) throw new Error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0442\u044c \u0434\u0430\u0442\u044b \u043f\u0435\u0440\u0438\u043e\u0434\u0430 \u0430\u043a\u0446\u0438\u0438 \u0432 PDF.');
  return { startDate, endDate };
};

const isRecommendedPriceHeading = (line: string) => {
  const value = lower(line);
  return value.includes(RU.recommended) && value.includes(RU.retail) && value.includes(RU.price);
};

const isRecommendedBlockStop = (line: string) => {
  const value = lower(line);
  return (
    value.includes(RU.chief) ||
    (value.includes(RU.places) && value.includes(RU.action)) ||
    (value.includes(RU.productName) && value.includes(RU.product))
  );
};

const extractRecommendedPriceItems = (text: string): ParsedInvoiceItem[] => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(isRecommendedPriceHeading);
  if (start < 0) throw new Error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0439\u0442\u0438 \u0431\u043b\u043e\u043a \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0440\u043e\u0437\u043d\u0438\u0447\u043d\u044b\u0445 \u0446\u0435\u043d \u0432 PDF.');

  const priceLinePattern = new RegExp(`^(.+?)\\s*[${dashChars}]\\s*(\\d[\\d\\s]*(?:[,.]\\d+)?)\\s*${RU.rub}(?:\\/\\S+)?`, 'iu');
  const items: ParsedInvoiceItem[] = [];

  for (const line of lines.slice(start + 1)) {
    const textLine = line.trim();
    if (!textLine) continue;
    if (isRecommendedBlockStop(textLine)) break;
    const match = textLine.match(priceLinePattern);
    if (!match) continue;
    const promoPrice = parseMoney(match[2]);
    if (promoPrice === null) continue;
    items.push({
      rawName: match[1].trim(),
      promoPrice,
      sourceLineText: textLine,
    });
  }

  if (!items.length) throw new Error('\u0412 PDF \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e \u043d\u0438 \u043e\u0434\u043d\u043e\u0439 \u0441\u0442\u0440\u043e\u043a\u0438 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u043e\u0432\u0430\u043d\u043d\u043e\u0439 \u0440\u043e\u0437\u043d\u0438\u0447\u043d\u043e\u0439 \u0446\u0435\u043d\u044b.');
  return items;
};

const extractPdfText = async (buffer: Buffer) => {
  const parser = new PDFParse({ data: Buffer.from(buffer) as unknown as Uint8Array });
  try {
    const result = await parser.getText();
    // Combined text includes pdf-parse's page-number joiners even for an
    // image-only page. Inspect actual page text to diagnose no_text_layer.
    return result.pages.map((page) => page.text).join('\n');
  } finally {
    await parser.destroy?.();
  }
};

export class PromotionInvoiceRecognitionError extends Error {
  constructor(readonly reason: 'no_text_layer' | 'invoice_structure_not_recognized' | 'invalid_pdf', message: string) {
    super(message);
    this.name = 'PromotionInvoiceRecognitionError';
  }
}

export const parsePromotionInvoiceText = (text: string) => {
  if (!text.trim()) throw new PromotionInvoiceRecognitionError('no_text_layer', 'no_text_layer: PDF не содержит текстового слоя.');
  try {
    return { period: extractPeriod(text), items: extractRecommendedPriceItems(text) };
  } catch (error) {
    throw new PromotionInvoiceRecognitionError('invoice_structure_not_recognized', error instanceof Error ? error.message : 'Структура накладной не распознана.');
  }
};

export const parsePromotionInvoice = async (buffer: Buffer) => {
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new PromotionInvoiceRecognitionError('invalid_pdf', 'Файл не является PDF.');
  }
  let text: string;
  try {
    text = await extractPdfText(buffer);
  } catch {
    throw new PromotionInvoiceRecognitionError('invalid_pdf', 'Не удалось прочитать PDF.');
  }
  return parsePromotionInvoiceText(text);
};

export const importPromotionInvoice = async (input: {
  buffer: Buffer;
  sourceDocumentId: string;
  sourceFileName: string;
}) => {
  const { period, items: parsedItems } = await parsePromotionInvoice(input.buffer);
  const priceListItems = await listPromotionPriceListItems();
  const status = statusForPeriod(period.startDate, period.endDate);

  const rows = await upsertPromotionDocumentRows(parsedItems.map((item) => {
    const match = matchPromotionProduct(item.rawName, priceListItems, item.promoPrice);
    return {
      status,
      productName: match?.item.productNameClean || item.rawName,
      startDate: period.startDate,
      endDate: period.endDate,
      promoPrice: item.promoPrice,
      regularPrice: match?.item.regularPrice ?? null,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentFileName: input.sourceFileName,
      sourceProductName: item.rawName,
      sourceLineText: item.sourceLineText,
      priceListItemId: match?.item.id ?? null,
      matchConfidence: match?.score ?? null,
    };
  }), 'invoice');

  return {
    imported: rows.length,
    matched: rows.filter((row) => row.regularPrice !== null).length,
    period,
  };
};
