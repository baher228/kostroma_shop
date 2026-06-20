import ExcelJS from 'exceljs';
import { listPromotionPriceListItems } from '../repositories/promotionPriceListRepository';
import { createPromotionInvoiceRows, PromotionRowStatus } from '../repositories/promotionRowsRepository';
import { matchPromotionProduct } from './promotionProductMatcher';

type ParsedPlanItem = {
  rawName: string;
  promoPrice: number | null;
  startDate: string | null;
  endDate: string | null;
  sourceLineText: string;
};

type HeaderMap = {
  product: number;
  promoPrice: number | null;
  startDate: number | null;
  endDate: number | null;
};

const RU = {
  productName: '\u043d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435',
  product: '\u0442\u043e\u0432\u0430\u0440',
  position: '\u043f\u043e\u0437\u0438\u0446',
  price: '\u0446\u0435\u043d',
  new: '\u043d\u043e\u0432',
  promo: '\u0430\u043a\u0446',
  recommended: '\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434',
  start: '\u043d\u0430\u0447\u0430',
  end: '\u043e\u043a\u043e\u043d\u0447',
  date: '\u0434\u0430\u0442',
  from: '\u0441',
  to: '\u043f\u043e',
  period: '\u043f\u0435\u0440\u0438\u043e\u0434',
  yo: '\u0451',
  ye: '\u0435',
};

const lower = (value: string) => value.normalize('NFC').toLowerCase().replaceAll(RU.yo, RU.ye);

const normalizeHeader = (value: string) =>
  lower(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const parseRuDateText = (value: string) => {
  const match = value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
};

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

const statusForPeriod = (startDate: string | null, endDate: string | null): PromotionRowStatus => {
  const today = new Date().toISOString().slice(0, 10);
  if (endDate && endDate < today) return 'past';
  if (startDate && startDate > today) return 'future';
  return 'current';
};

const parseMoneyText = (value: string) => {
  const cleaned = value.replace(/\s+/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
};

const cellText = (cell: ExcelJS.Cell) => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return dateOnly(value);
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  if ('result' in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
  if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim();
  return String(cell.text ?? '').trim();
};

const cellNumber = (cell: ExcelJS.Cell) => {
  const value = cell.value;
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'result' in value && typeof value.result === 'number') return value.result;
  return parseMoneyText(cellText(cell));
};

const cellDate = (cell: ExcelJS.Cell) => {
  const value = cell.value;
  if (value instanceof Date) return dateOnly(value);
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return dateOnly(new Date(excelEpoch + value * 24 * 60 * 60 * 1000));
  }
  return parseRuDateText(cellText(cell));
};

const isProductHeader = (value: string) =>
  value.includes(RU.productName) || value.includes(RU.product) || value.includes(RU.position);

const isPromoPriceHeader = (value: string) =>
  value.includes(RU.price) && (value.includes(RU.new) || value.includes(RU.promo) || value.includes(RU.recommended));

const isStartDateHeader = (value: string) =>
  value.includes(RU.date) && (value.includes(RU.start) || value === RU.from);

const isEndDateHeader = (value: string) =>
  value.includes(RU.date) && (value.includes(RU.end) || value === RU.to);

const findHeaderMap = (rows: string[][]): { rowIndex: number; map: HeaderMap } | null => {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 60); rowIndex += 1) {
    const row = rows[rowIndex].map(normalizeHeader);
    const product = row.findIndex(isProductHeader);
    if (product < 0) continue;

    const promoPrice = row.findIndex(isPromoPriceHeader);
    const startDate = row.findIndex(isStartDateHeader);
    const endDate = row.findIndex(isEndDateHeader);
    const score = Number(promoPrice >= 0) + Number(startDate >= 0) + Number(endDate >= 0);
    if (score < 1) continue;

    return {
      rowIndex,
      map: {
        product,
        promoPrice: promoPrice >= 0 ? promoPrice : null,
        startDate: startDate >= 0 ? startDate : null,
        endDate: endDate >= 0 ? endDate : null,
      },
    };
  }
  return null;
};

const extractFallbackPeriod = (rows: string[][]) => {
  const dates = rows
    .slice(0, 20)
    .flatMap((row) => row.flatMap((cell) => [...cell.matchAll(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/g)].map((match) => match[1])))
    .map(parseRuDateText)
    .filter((date): date is string => Boolean(date));

  return {
    startDate: dates[0] ?? null,
    endDate: dates[1] ?? null,
  };
};

const rowSourceText = (row: string[]) => row.filter(Boolean).join(' | ');

const parseTableRows = (rows: string[][], getNumber: (rowIndex: number, colIndex: number) => number | null, getDate: (rowIndex: number, colIndex: number) => string | null) => {
  const header = findHeaderMap(rows);
  if (!header) {
    throw new Error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0439\u0442\u0438 \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u0442\u043e\u0432\u0430\u0440\u0430, \u0434\u0430\u0442 \u0438 \u0430\u043a\u0446\u0438\u043e\u043d\u043d\u043e\u0439 \u0446\u0435\u043d\u044b \u0432 \u043f\u043b\u0430\u043d\u0435.');
  }

  const fallbackPeriod = extractFallbackPeriod(rows);
  const items: ParsedPlanItem[] = [];

  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rawName = (row[header.map.product] ?? '').trim();
    if (!rawName || isProductHeader(normalizeHeader(rawName))) continue;

    const promoPrice = header.map.promoPrice === null ? null : getNumber(rowIndex, header.map.promoPrice);
    const startDate = header.map.startDate === null ? fallbackPeriod.startDate : getDate(rowIndex, header.map.startDate) ?? fallbackPeriod.startDate;
    const endDate = header.map.endDate === null ? fallbackPeriod.endDate : getDate(rowIndex, header.map.endDate) ?? fallbackPeriod.endDate;
    if (promoPrice === null && !startDate && !endDate) continue;

    items.push({
      rawName,
      promoPrice,
      startDate,
      endDate,
      sourceLineText: rowSourceText(row),
    });
  }

  return items;
};

const parseXlsx = async (buffer: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);

  const items: ParsedPlanItem[] = [];
  workbook.eachSheet((worksheet) => {
    const rows: string[][] = [];
    worksheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellText(cell);
      });
      rows.push(cells);
    });

    items.push(...parseTableRows(
      rows,
      (rowIndex, colIndex) => cellNumber(worksheet.getRow(rowIndex + 1).getCell(colIndex + 1)),
      (rowIndex, colIndex) => cellDate(worksheet.getRow(rowIndex + 1).getCell(colIndex + 1)),
    ));
  });

  return items;
};

const splitCsvLine = (line: string, delimiter: string) => {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
};

const parseCsv = (buffer: Buffer) => {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => splitCsvLine(line, delimiter));

  return parseTableRows(
    rows,
    (rowIndex, colIndex) => parseMoneyText(rows[rowIndex]?.[colIndex] ?? ''),
    (rowIndex, colIndex) => parseRuDateText(rows[rowIndex]?.[colIndex] ?? ''),
  );
};

export const importPromotionPlan = async (input: {
  buffer: Buffer;
  sourceDocumentId: string;
  sourceFileName: string;
}) => {
  const lowerName = input.sourceFileName.toLowerCase();
  const parsedItems = lowerName.endsWith('.csv') ? parseCsv(input.buffer) : await parseXlsx(input.buffer);
  const priceListItems = await listPromotionPriceListItems();

  const rows = await createPromotionInvoiceRows(parsedItems.map((item) => {
    const match = matchPromotionProduct(item.rawName, priceListItems);
    return {
      status: statusForPeriod(item.startDate, item.endDate),
      productName: match?.item.productNameClean || item.rawName,
      startDate: item.startDate,
      endDate: item.endDate,
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
  };
};
