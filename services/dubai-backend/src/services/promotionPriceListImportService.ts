import ExcelJS from 'exceljs';
import {
  PromotionPriceListItemInput,
  upsertPromotionPriceListItems,
} from '../repositories/promotionPriceListRepository';

const normalizeProductName = (value: string) =>
  value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const cellText = (cell: ExcelJS.Cell) => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  if ('result' in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
  if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim();
  try {
    return String(cell.text ?? '').trim();
  } catch {
    return '';
  }
};

const cellNumber = (cell: ExcelJS.Cell) => {
  const value = cell.value;
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'result' in value && typeof value.result === 'number') return value.result;
  const text = cellText(cell).replace(/\s+/g, '').replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const looksLikeHeader = (text: string) => /наименование|стоимость|рознич/i.test(text);

export const importPromotionPriceList = async (input: {
  buffer: Buffer;
  sourceDocumentId: string;
  sourceFileName: string;
}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(input.buffer) as unknown as ExcelJS.Buffer);

  const items: PromotionPriceListItemInput[] = [];
  workbook.eachSheet((worksheet) => {
    let category: string | null = null;
    let headerRowNumber = 0;

    worksheet.eachRow((row, rowNumber) => {
      const cleanHeader = cellText(row.getCell(3)).toLowerCase();
      const priceHeader = cellText(row.getCell(4)).toLowerCase();
      if (cleanHeader.includes('чист') && priceHeader.includes('рознич')) {
        headerRowNumber = rowNumber;
      }
    });

    if (!headerRowNumber) return;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const rawName = cellText(row.getCell(2));
      const cleanName = cellText(row.getCell(3));
      const price = cellNumber(row.getCell(4));

      if (looksLikeHeader([rawName, cleanName, cellText(row.getCell(4))].join(' '))) {
        return;
      }

      if (price === null) {
        const maybeCategory = cleanName || rawName || cellText(row.getCell(1));
        if (maybeCategory) category = maybeCategory;
        return;
      }

      const productNameClean = cleanName || rawName;
      const normalizedProductName = normalizeProductName(productNameClean);
      if (!productNameClean || !normalizedProductName || price < 0) return;

      items.push({
        sourceDocumentId: input.sourceDocumentId,
        sourceFileName: input.sourceFileName,
        sourceRowNumber: rowNumber,
        category,
        productNameRaw: rawName || null,
        productNameClean,
        normalizedProductName,
        regularPrice: price,
      });
    });
  });

  return {
    imported: await upsertPromotionPriceListItems(items),
  };
};
