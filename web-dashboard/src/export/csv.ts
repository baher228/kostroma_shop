export const safeFileName = (value: string): string =>
  value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const buildCsv = (rows: string[][]): string =>
  rows.map((row) => row.map(csvEscape).join(';')).join('\n');
