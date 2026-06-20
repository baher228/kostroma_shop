import { PDFParse } from 'pdf-parse';
import {
  PromotionPriceListItem,
  listPromotionPriceListItems,
} from '../repositories/promotionPriceListRepository';
import { createPromotionInvoiceRows } from '../repositories/promotionRowsRepository';

type ParsedInvoiceItem = {
  rawName: string;
  promoPrice: number;
  sourceLineText: string;
};

type PackageMark = {
  grams: number;
  unit: 'g' | 'kg';
};

type MatchCandidate = {
  item: PromotionPriceListItem;
  score: number;
  exactPackage: boolean;
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
  category: '\u043a\u0430\u0442',
  rub: '\u0440',
  kg: '\u043a\u0433',
  gram: '\u0433',
  yo: '\u0451',
  ye: '\u0435',
  cooledFull: '\u043e\u0445\u043b\u0430\u0436\u0434\u0435\u043d\u043d\u044b\u0439',
  cooledShort: '\u043e\u0445\u043b',
  cellophane: '\u0446\u0435\u043b\u043b\u043e\u0444',
  vacuum: '\u0432\u0430\u043a',
  packageWord: '\u0443\u043f',
  frozenFull: '\u0437\u0430\u043c\u043e\u0440\u043e\u0436',
  frozenShort: '\u0437\u0430\u043c',
  packedShort: '\u0444\u0430\u0441',
  middlePackage: '\u0437\u0441\u0440',
  pieces: '\u0448\u0442',
};

const lower = (value: string) => value.normalize('NFC').toLowerCase().replaceAll(RU.yo, RU.ye);

const quoteChars = '\u00ab\u00bb"';
const dashChars = '\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212';
const packagePattern = new RegExp(`(\\d+(?:[,.]\\d+)?)\\s*(${RU.kg}|${RU.gram})\\.?`, 'giu');

const stripDecorativeAttributes = (value: string) =>
  value
    .replace(new RegExp(`${RU.category}\\.?\\s*[\\u0430-\\u044fa-z]`, 'giu'), ' ')
    .replace(new RegExp(`\\b[\\u0432v]/[\\u043ak]\\b`, 'giu'), ' ')
    .replace(new RegExp(`${RU.vacuum}\\.?\\s*${RU.packageWord}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.frozenFull}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.frozenShort}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.packedShort}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.middlePackage}\\.?`, 'giu'), ' ')
    .replace(new RegExp(`${RU.pieces}\\.?`, 'giu'), ' ');

const normalizeKnownAbbreviations = (value: string) =>
  value
    .replace(new RegExp(`${RU.cooledFull}`, 'giu'), ` ${RU.cooledShort} `)
    .replace(new RegExp(`${RU.cooledShort}\\.?`, 'giu'), ` ${RU.cooledShort} `)
    .replace(new RegExp(`${RU.cellophane}\\.?[^\\s)]*`, 'giu'), ` ${RU.cellophane} `);

const extractPackageMarks = (value: string): PackageMark[] => {
  const marks: PackageMark[] = [];
  for (const match of lower(value).matchAll(packagePattern)) {
    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    const unit = match[2] === RU.kg ? 'kg' : 'g';
    marks.push({
      grams: unit === 'kg' ? amount * 1000 : amount,
      unit,
    });
  }
  return marks;
};

const normalizeProductName = (value: string) =>
  stripDecorativeAttributes(normalizeKnownAbbreviations(lower(value)))
    .replace(new RegExp(`[${quoteChars}]`, 'gu'), '')
    .replace(packagePattern, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const stopTokens = new Set([
  RU.category,
  RU.packageWord,
  RU.vacuum,
  RU.rub,
  RU.kg,
  RU.gram,
]);

const tokens = (value: string) =>
  normalizeProductName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopTokens.has(token) && !/^\d+(?:[,.]\d+)?$/.test(token));

const tokenSimilarity = (left: string, right: string) => {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  return intersection / Math.max(leftTokens.size, rightTokens.size);
};

const packageScore = (rawName: string, cleanName: string) => {
  const rawMarks = extractPackageMarks(rawName);
  const cleanMarks = extractPackageMarks(cleanName);
  if (!rawMarks.length || !cleanMarks.length) return { score: 0, exact: false };

  const hasExact = rawMarks.some((raw) =>
    cleanMarks.some((clean) => Math.abs(raw.grams - clean.grams) <= 5),
  );
  if (hasExact) return { score: 0.25, exact: true };

  const rawHasKg = rawMarks.some((mark) => mark.unit === 'kg' && mark.grams >= 1000);
  const cleanHasKg = cleanMarks.some((mark) => mark.unit === 'kg');
  const rawHasSmallGram = rawMarks.some((mark) => mark.unit === 'g' && mark.grams < 1000);
  const cleanHasSmallGram = cleanMarks.some((mark) => mark.unit === 'g' && mark.grams < 1000);

  if (rawHasKg && cleanHasKg) return { score: 0.04, exact: false };
  if (rawHasSmallGram && cleanHasSmallGram) return { score: 0.04, exact: false };
  return { score: -0.18, exact: false };
};

const quotedTokens = (value: string) => {
  const result = new Set<string>();
  const pattern = new RegExp(`[\\u00ab"]([^\\u00bb"]+)[\\u00bb"]`, 'gu');
  for (const match of lower(value).matchAll(pattern)) {
    tokens(match[1]).forEach((token) => result.add(token));
  }
  return result;
};

const quoteScore = (rawName: string, cleanName: string) => {
  const rawQuoted = quotedTokens(rawName);
  if (!rawQuoted.size) return 0;
  const clean = new Set(tokens(cleanName));
  let matched = 0;
  rawQuoted.forEach((token) => {
    if (clean.has(token)) matched += 1;
  });
  return matched === rawQuoted.size ? 0.12 : -0.18;
};

const matchScore = (rawName: string, cleanName: string) => {
  const base = tokenSimilarity(rawName, cleanName);
  const pack = packageScore(rawName, cleanName);
  return {
    score: Math.max(0, Math.min(1, base * 0.82 + pack.score + quoteScore(rawName, cleanName))),
    exactPackage: pack.exact,
  };
};

const itemMatchScore = (rawName: string, item: PromotionPriceListItem) => {
  const cleanScore = matchScore(rawName, item.productNameClean);
  const rawScore = item.productNameRaw ? matchScore(rawName, item.productNameRaw) : null;
  if (rawScore && rawScore.score > cleanScore.score) return rawScore;
  return cleanScore;
};

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

const bestMatch = (rawName: string, priceListItems: PromotionPriceListItem[]): MatchCandidate | null => {
  const scored = priceListItems
    .map((item) => ({ item, ...itemMatchScore(rawName, item) }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.45) return null;

  const margin = second ? best.score - second.score : 1;
  if (margin < 0.04 && !best.exactPackage) return null;
  return best;
};

const extractPdfText = async (buffer: Buffer) => {
  const parser = new PDFParse({ data: Buffer.from(buffer) as unknown as Uint8Array });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy?.();
  }
};

export const importPromotionInvoice = async (input: {
  buffer: Buffer;
  sourceDocumentId: string;
  sourceFileName: string;
}) => {
  const text = await extractPdfText(input.buffer);
  const period = extractPeriod(text);
  const parsedItems = extractRecommendedPriceItems(text);
  const priceListItems = await listPromotionPriceListItems();
  const status = statusForPeriod(period.startDate, period.endDate);

  const rows = await createPromotionInvoiceRows(parsedItems.map((item) => {
    const match = bestMatch(item.rawName, priceListItems);
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
  }));

  return {
    imported: rows.length,
    matched: rows.filter((row) => row.regularPrice !== null).length,
    period,
  };
};
