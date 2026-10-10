import ExcelJS from 'exceljs';
import { TextDecoder } from 'node:util';

export const promotionPreviewLimits = { sheets: 3, rows: 100, columns: 30, cellCharacters: 500 } as const;

export type PromotionTablePreview = {
  type: 'table';
  sheets: Array<{ name: string; rows: string[][] }>;
  truncated: boolean;
};

const boundedCell = (value: string, onTruncate: () => void) => {
  if (value.length <= promotionPreviewLimits.cellCharacters) return value;
  onTruncate();
  return `${value.slice(0, promotionPreviewLimits.cellCharacters)}…`;
};

const spreadsheetCellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return String(value);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('result' in value) {
    const result = value.result;
    if (result instanceof Date) return result.toISOString().slice(0, 10);
    if (result && typeof result === 'object' && 'error' in result) return result.error;
    return result === undefined || result === null ? '' : String(result);
  }
  if ('text' in value) return value.text;
  if ('error' in value) return value.error;
  return cell.text;
};

/** Reads only the first record to identify the delimiter, respecting quoted fields. */
const csvDelimiter = (text: string) => {
  const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\r' || char === '\n') break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0][0];
};

export const createPromotionCsvPreview = (buffer: Buffer, name = 'Таблица'): PromotionTablePreview => {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    throw new Error('CSV должен содержать корректный текст UTF-8.');
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) throw new Error('CSV содержит бинарные данные.');
  const delimiter = csvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let columnCount = 0;
  let field = '';
  let quoted = false;
  let truncated = false;
  const markTruncated = () => { truncated = true; };
  const appendField = () => {
    columnCount += 1;
    if (columnCount <= promotionPreviewLimits.columns) row.push(boundedCell(field, markTruncated));
    else truncated = true;
    field = '';
  };
  const appendRow = () => {
    appendField();
    rows.push(row);
    row = [];
    columnCount = 0;
  };
  for (let index = 0; index < text.length; index += 1) {
    if (rows.length === promotionPreviewLimits.rows) {
      truncated ||= text.slice(index).trim().length > 0;
      break;
    }
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        if (field.length <= promotionPreviewLimits.cellCharacters) field += '"';
        else truncated = true;
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) appendField();
    else if (!quoted && (char === '\n' || char === '\r')) {
      appendRow();
      if (char === '\r' && text[index + 1] === '\n') index += 1;
    } else if (field.length <= promotionPreviewLimits.cellCharacters) field += char;
    else truncated = true;
  }
  if (rows.length < promotionPreviewLimits.rows) {
    if (quoted) throw new Error('CSV содержит незакрытую кавычку.');
    if (field.length || row.length || columnCount) appendRow();
  }
  return { type: 'table', sheets: [{ name, rows }], truncated };
};

export const createPromotionDocumentPreview = async (fileName: string, buffer: Buffer): Promise<PromotionTablePreview> => {
  if (fileName.toLowerCase().endsWith('.csv')) return createPromotionCsvPreview(buffer);
  if (!/\.xlsx$/i.test(fileName)) throw new Error('Предпросмотр доступен для PDF, XLSX и CSV. Скачайте исходный файл.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  let truncated = workbook.worksheets.length > promotionPreviewLimits.sheets;
  const markTruncated = () => { truncated = true; };
  const sheets = workbook.worksheets.slice(0, promotionPreviewLimits.sheets).map((worksheet) => {
    truncated ||= worksheet.rowCount > promotionPreviewLimits.rows || worksheet.columnCount > promotionPreviewLimits.columns;
    const rows: string[][] = [];
    for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, promotionPreviewLimits.rows); rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const cells: string[] = [];
      for (let column = 1; column <= Math.min(worksheet.columnCount, promotionPreviewLimits.columns); column += 1) {
        cells.push(boundedCell(spreadsheetCellText(row.getCell(column)), markTruncated));
      }
      rows.push(cells);
    }
    return { name: worksheet.name, rows };
  });
  return { type: 'table', sheets, truncated };
};
