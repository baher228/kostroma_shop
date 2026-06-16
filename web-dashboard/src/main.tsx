import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import './styles.css';
import { sortProductsLikeImage } from './productOrdering';
import {
  CheckInStats,
  ManagedUser,
  OrderSheet,
  OrderSheetRow,
  Product,
  ProductCategory,
  ProductPayload,
  Role,
  SellerOrder,
  Session,
  Shop,
  StockTable,
  WorkerCheckInEvent,
} from './types';

type Section = 'overview' | 'attendance' | 'users' | 'shops' | 'products' | 'orders';

const STORAGE_KEY = 'analitika_dashboard_session_v1';
const PRODUCT_CATEGORIES: ProductCategory[] = ['Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'];
type MachineNumber = 1 | 2 | 3;
type MachineGroup = {
  machineNumber: MachineNumber;
  shops: Shop[];
};
const MACHINE_NUMBERS: MachineNumber[] = [1, 2, 3];
const ALLOWED_ORDER_WEEKDAYS = new Set([2, 4, 6]);
type StockView = 'dashboard' | 'calendar';
type DashboardManualOrderKey = 'orderPackThu' | 'orderPackSat' | 'orderPackTue';
type DashboardColumnKey =
  | 'currentTue'
  | DashboardManualOrderKey
  | 'orderUnitsThu'
  | 'orderUnitsSat'
  | 'orderUnitsTue'
  | 'prevWed'
  | 'soldPrevMonWed'
  | 'soldMonWed'
  | 'currentWed'
  | 'currentThu'
  | 'prevFri'
  | 'soldPrevWedFri'
  | 'soldWedFri'
  | 'currentFri'
  | 'currentSun'
  | 'prevMon'
  | 'soldPrevFriMon'
  | 'soldFriMon'
  | 'currentMon';
type DashboardTone = 'neutral' | 'order' | 'yellow' | 'green' | 'blue';
type DashboardWeekRef = 'current' | 'previous';
type WeekSlot = keyof WeekDateMap;
type WeekDateMap = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sun', string>>;
type DashboardRowValues = Record<DashboardColumnKey, string>;
type DashboardOverrideKey = keyof DashboardRowValues;

type DashboardColumn = {
  key: DashboardColumnKey;
  title: string;
  subtitle: string;
  kind: 'stock' | 'order' | 'metric';
  tone: DashboardTone;
  dateKind?: 'none' | 'day' | 'range';
  dateWeek?: DashboardWeekRef;
  dateDay?: WeekSlot;
  dateFrom?: WeekSlot;
  dateTo?: WeekSlot;
  dateToWeek?: DashboardWeekRef;
};

const WEEK_DAYS = 7;
const TWO_WEEKS_DAYS = 14;
const MAX_ORDER_VALUE_LEN = 5;
const DASHBOARD_WINDOW_START = '2026-04-28';

const DASHBOARD_COLUMNS: DashboardColumn[] = [
  { key: 'currentTue', title: 'Текущий остаток', subtitle: 'Вторник', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'tue' },
  { key: 'orderPackThu', title: 'Заказ упаковок на четверг', subtitle: 'Вторник', kind: 'order', tone: 'order', dateKind: 'day', dateWeek: 'current', dateDay: 'tue' },
  { key: 'orderUnitsThu', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral', dateKind: 'none' },
  { key: 'prevWed', title: 'Прошлый остаток', subtitle: 'Среда', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'previous', dateDay: 'wed' },
  { key: 'soldPrevMonWed', title: 'Продано на прошлой неделе', subtitle: 'Пн-Ср', kind: 'metric', tone: 'yellow', dateKind: 'range', dateWeek: 'previous', dateFrom: 'mon', dateTo: 'wed' },
  { key: 'currentWed', title: 'Текущий остаток', subtitle: 'Среда', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'wed' },
  { key: 'soldMonWed', title: 'Продано', subtitle: 'Пн-Ср', kind: 'metric', tone: 'yellow', dateKind: 'range', dateWeek: 'current', dateFrom: 'mon', dateTo: 'wed' },
  { key: 'currentThu', title: 'Текущий остаток', subtitle: 'Четверг', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'thu' },
  { key: 'orderPackSat', title: 'Заказ упаковок на субботу', subtitle: 'Четверг', kind: 'order', tone: 'order', dateKind: 'day', dateWeek: 'current', dateDay: 'thu' },
  { key: 'orderUnitsSat', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral', dateKind: 'none' },
  { key: 'prevFri', title: 'Прошлый остаток', subtitle: 'Пятница', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'previous', dateDay: 'fri' },
  { key: 'soldPrevWedFri', title: 'Продано на прошлой неделе', subtitle: 'Ср-Пт', kind: 'metric', tone: 'green', dateKind: 'range', dateWeek: 'previous', dateFrom: 'wed', dateTo: 'fri' },
  { key: 'currentFri', title: 'Текущий остаток', subtitle: 'Пятница', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'fri' },
  { key: 'soldWedFri', title: 'Продано', subtitle: 'Ср-Пт', kind: 'metric', tone: 'green', dateKind: 'range', dateWeek: 'current', dateFrom: 'wed', dateTo: 'fri' },
  { key: 'currentSun', title: 'Текущий остаток', subtitle: 'Воскрес', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'sun' },
  { key: 'orderPackTue', title: 'Заказ упаковок на вторник', subtitle: 'Воскрес', kind: 'order', tone: 'order', dateKind: 'day', dateWeek: 'current', dateDay: 'sun' },
  { key: 'orderUnitsTue', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral', dateKind: 'none' },
  { key: 'prevMon', title: 'Прошлый остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'previous', dateDay: 'mon' },
  { key: 'soldPrevFriMon', title: 'Продано на прошлой неделе', subtitle: 'Пт-Пн', kind: 'metric', tone: 'blue', dateKind: 'range', dateWeek: 'previous', dateFrom: 'fri', dateTo: 'mon', dateToWeek: 'previous' },
  { key: 'currentMon', title: 'Текущий остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'mon' },
  { key: 'soldFriMon', title: 'Продано', subtitle: 'Пт-Пн', kind: 'metric', tone: 'blue', dateKind: 'range', dateWeek: 'previous', dateFrom: 'fri', dateTo: 'mon', dateToWeek: 'current' },
];

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfWeek = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return toDateKey(now);
};

const addDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

const getTwoWeeksEnd = (startDateKey: string): string => addDays(startDateKey, TWO_WEEKS_DAYS - 1);

const parseDateKey = (raw: string): Date => {
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const todayDateKey = (): string => toDateKey(new Date());

const isAllowedOrderDate = (dateKey: string): boolean => ALLOWED_ORDER_WEEKDAYS.has(parseDateKey(dateKey).getDay());

const shiftToAllowedOrderDate = (dateKey: string, direction: 1 | -1): string => {
  const nextDate = parseDateKey(dateKey);
  do {
    nextDate.setDate(nextDate.getDate() + direction);
  } while (!ALLOWED_ORDER_WEEKDAYS.has(nextDate.getDay()));
  return toDateKey(nextDate);
};

const nearestAllowedOrderDate = (dateKey: string): string => {
  if (isAllowedOrderDate(dateKey)) {
    return dateKey;
  }
  return shiftToAllowedOrderDate(dateKey, 1);
};

const formatDateLabel = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};

const formatDateShort = (iso: string): string => {
  const [, month, day] = iso.split('-');
  return `${day}.${month}`;
};

const formatWeekdayLabel = (iso: string): string =>
  parseDateKey(iso).toLocaleDateString('ru-RU', { weekday: 'long' });

const formatWeight = (total: number, packWeightKg: number | null): string => {
  if (!total || packWeightKg === null || packWeightKg === undefined) {
    return '';
  }
  return (total * packWeightKg).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const safeFileName = (value: string): string => value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const buildCsv = (rows: string[][]): string => rows.map((row) => row.map(csvEscape).join(';')).join('\n');
const normalizeText = (value: string): string => value.trim().toLowerCase();
const sanitizeOrderValue = (raw: string): string => raw.replace(/[^0-9]/g, '').slice(0, MAX_ORDER_VALUE_LEN);
const isManualOrderKey = (key: DashboardColumnKey): key is DashboardManualOrderKey =>
  key === 'orderPackThu' || key === 'orderPackSat' || key === 'orderPackTue';
const isManualStockKey = (
  key: DashboardColumnKey,
): key is 'currentTue' | 'currentWed' | 'currentThu' | 'currentFri' | 'currentSun' | 'currentMon' =>
  key === 'currentTue' ||
  key === 'currentWed' ||
  key === 'currentThu' ||
  key === 'currentFri' ||
  key === 'currentSun' ||
  key === 'currentMon';

const parseStockNumber = (raw?: string): number | null => {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const diffStocks = (startRaw?: string, endRaw?: string): string => {
  const start = parseStockNumber(startRaw);
  const end = parseStockNumber(endRaw);
  return start === null || end === null ? '' : String(start - end);
};

const computeSold = (startRaw?: string, deliveryRaw?: string, endRaw?: string): string => {
  const start = parseStockNumber(startRaw);
  const end = parseStockNumber(endRaw);
  if (start === null || end === null) {
    return '';
  }
  const delivery = parseStockNumber(deliveryRaw) ?? 0;
  return String(start + delivery - end);
};

const hasValue = (value?: string): value is string => typeof value === 'string' && value.trim() !== '';
const orderUnitsFromPacks = (packsRaw: string, unitsInPack: number | null): string => {
  if (!packsRaw || unitsInPack === null || unitsInPack <= 0) {
    return '';
  }
  const packs = Number.parseInt(packsRaw, 10);
  return Number.isNaN(packs) ? '' : String(packs * unitsInPack);
};

const weekdaySlot = (dateKey: string): keyof WeekDateMap | null => {
  const day = parseDateKey(dateKey).getDay();
  if (day === 1) return 'mon';
  if (day === 2) return 'tue';
  if (day === 3) return 'wed';
  if (day === 4) return 'thu';
  if (day === 5) return 'fri';
  if (day === 0) return 'sun';
  return null;
};

const splitWeeks = (dates: string[]): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += WEEK_DAYS) {
    const chunk = dates.slice(i, i + WEEK_DAYS);
    if (chunk.length === WEEK_DAYS) {
      chunks.push(chunk);
    }
  }
  return chunks;
};

const mapWeekDates = (weekDates: string[]): WeekDateMap => {
  const mapped: WeekDateMap = {};
  for (const date of weekDates) {
    const slot = weekdaySlot(date);
    if (slot) {
      mapped[slot] = date;
    }
  }
  return mapped;
};

const formatOptionalPrice = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)} руб` : '';
};

const applyDashboardOverrides = (base: DashboardRowValues, row: Product, weekStart?: string): DashboardRowValues => {
  if (!weekStart || !row.dashboardOverrides) {
    return base;
  }
  const next = { ...base };
  (Object.keys(base) as DashboardOverrideKey[]).forEach((key) => {
    const override = row.dashboardOverrides?.[`${weekStart}:${key}`];
    if (override !== undefined) {
      next[key] = override;
    }
  });
  return next;
};

type XlsxCell = {
  value: string | number;
  style?: number;
  type?: 'number' | 'string';
};

const crcTable = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const zipHeader = (size: number): Uint8Array => new Uint8Array(size);

const makeZip = (files: Array<{ path: string; content: string }>): Uint8Array => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);

    const localHeader = zipHeader(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(10, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, contentBytes.length, true);
    localView.setUint32(22, contentBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = zipHeader(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(12, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + contentBytes.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const endHeader = zipHeader(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localParts, centralDirectory, endHeader]);
};

const xlsxColumnName = (index: number): string => {
  let name = '';
  let current = index;
  while (current > 0) {
    const mod = (current - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    current = Math.floor((current - mod) / 26);
  }
  return name;
};

const xlsxCellXml = (cell: XlsxCell, rowIndex: number, colIndex: number): string => {
  const ref = `${xlsxColumnName(colIndex)}${rowIndex}`;
  const style = cell.style ? ` s="${cell.style}"` : '';
  if (cell.value === '') {
    return `<c r="${ref}"${style}/>`;
  }
  if (cell.type === 'number' && typeof cell.value === 'number') {
    return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(String(cell.value))}</t></is></c>`;
};

const makeXlsxBlob = (sheetName: string, rows: XlsxCell[][], merges: string[]): Blob => {
  const lastColumn = xlsxColumnName(Math.max(...rows.map((row) => row.length), 1));
  const sheetData = rows
    .map((row, rowIndex) =>
      `<row r="${rowIndex + 1}">${row.map((cell, colIndex) => xlsxCellXml(cell, rowIndex + 1, colIndex + 1)).join('')}</row>`,
    )
    .join('');
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';

  const files = [
    {
      path: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      path: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escapeXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
        '</workbook>',
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'xl/styles.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font/><font><b/></font></fonts>' +
        '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECF1EC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6DFD6"/></patternFill></fill></fills>' +
        '<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="center"/></xf></cellXfs>' +
        '</styleSheet>',
    },
    {
      path: 'xl/worksheets/sheet1.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<dimension ref="A1:${lastColumn}${Math.max(rows.length, 1)}"/>` +
        '<cols><col min="1" max="1" width="42" customWidth="1"/><col min="2" max="200" width="12" customWidth="1"/></cols>' +
        `<sheetData>${sheetData}</sheetData>${mergeXml}` +
        '</worksheet>',
    },
  ];

  const zipBytes = makeZip(files);
  const zipBuffer = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer;
  return new Blob([zipBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Не удалось выполнить запрос.');
const intOrZero = (value: string) => Number.parseInt(value || '0', 10) || 0;
const numberOrZero = (value: string) => Number.parseFloat(value || '0') || 0;
const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ч ${rest} мин`;
};
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU');
const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';
const statusLabel = (status: 'in' | 'out') => (status === 'in' ? 'На смене' : 'Вне смены');
const orderStatusLabel = (status: 'new' | 'processed') => (status === 'new' ? 'Новый' : 'Обработан');

const sanitizeStock = (value: string) => {
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return String(Math.min(50, Math.max(0, parsed)));
};

const productToForm = (product?: Product): ProductPayload => ({
  name: product?.name ?? '',
  category: product?.category ?? PRODUCT_CATEGORIES[0],
  packType: product?.packType ?? '',
  unitsInPack: product?.unitsInPack ?? 1,
  packWeightKg: product?.packWeightKg ?? 1,
  shelfLifeDays: product?.shelfLifeDays ?? 1,
  unitPriceRubVat: product?.unitPriceRubVat ?? 0,
  minStockUnits: product?.minStockUnits ?? 0,
  maxStockUnits: product?.maxStockUnits ?? 0,
});

const Login = ({ onLogin }: { onLogin: (session: Session) => void }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const session = await api.login(username, password);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      onLogin(session);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h2>Вход</h2>
        <label>
          Логин
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Входим...' : 'Войти'}</button>
      </form>
    </main>
  );
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setBooting(false);
      return;
    }
    const parsed = JSON.parse(saved) as Session;
    api.me(parsed.token)
      .then((user) => {
        if (user.username !== 'admin') {
          throw new Error('Доступ к панели разрешен только пользователю admin.');
        }
        setSession({ token: parsed.token, user });
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return <main className="loading">Загрузка панели...</main>;
  }
  if (!session) {
    return <Login onLogin={setSession} />;
  }
  return <Dashboard session={session} onLogout={() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }} />;
};

const Dashboard = ({ session, onLogout }: { session: Session; onLogout: () => void }) => {
  const [section, setSection] = useState<Section>('overview');
  const nav: Array<{ key: Section; label: string }> = [
    { key: 'overview', label: 'Обзор' },
    { key: 'attendance', label: 'Посещаемость' },
    { key: 'users', label: 'Пользователи' },
    { key: 'shops', label: 'Магазины' },
    { key: 'products', label: 'Остатки' },
    { key: 'orders', label: 'Заказ' },
  ];

  return (
    <div className="site-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Analitika Admin</p>
          <h1>Панель управления</h1>
        </div>
        <nav className="top-nav">
          {nav.map((item) => (
            <button key={item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="account-box">
          <span>{session.user.fullName}</span>
          <button className="secondary" onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <main className={section === 'products' ? 'content stock-content' : 'content'}>
        {section === 'overview' && <OverviewPanel session={session} setSection={setSection} />}
        {section === 'attendance' && <AttendancePanel session={session} />}
        {section === 'users' && <UsersPanel session={session} />}
        {section === 'shops' && <ShopsPanel session={session} />}
        {section === 'products' && <ProductsPanel session={session} />}
        {section === 'orders' && <OrdersPanel session={session} />}
      </main>
    </div>
  );
};

const OverviewPanel = ({ session, setSection }: { session: Session; setSection: (section: Section) => void }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [stats, setStats] = useState<CheckInStats | null>(null);

  useEffect(() => {
    void Promise.all([
      api.users.list(session.token),
      api.shops.list(session.token),
      api.orders.list(session.token),
      api.checkin.stats(session.token, startOfWeek(), addDays(startOfWeek(), 6)),
    ]).then(([nextUsers, nextShops, nextOrders, nextStats]) => {
      setUsers(nextUsers);
      setShops(nextShops);
      setOrders(nextOrders);
      setStats(nextStats);
    });
  }, [session.token]);

  return (
    <section className="page-section">
      <PageHeader title="Обзор" subtitle="Ключевые показатели текущей недели и быстрый переход к управлению." />
      <div className="metric-grid">
        <Metric label="Пользователи" value={users.length} hint="Все роли" />
        <Metric label="Магазины" value={shops.length} hint="Активные точки" />
        <Metric label="Новые заказы" value={orders.filter((order) => order.status === 'new').length} hint="Ожидают обработки" />
        <Metric label="Сейчас на смене" value={stats?.currentlyIn ?? 0} hint="По check-in" />
      </div>
      <div className="landing-grid">
        {[
          ['Посещаемость', 'Статусы работников, часы, опоздания и графики.', 'attendance'],
          ['Пользователи', 'Создание, роли, привязка к магазинам и сброс пароля.', 'users'],
          ['Остатки', 'Менеджерская таблица остатков, заказов и продаж.', 'products'],
          ['Заказ', 'Сводная таблица заказов по магазинам, машинам и товарам.', 'orders'],
        ].map(([title, text, target]) => (
          <button key={target} className="landing-card" onClick={() => setSection(target as Section)}>
            <span>{title}</span>
            <small>{text}</small>
          </button>
        ))}
      </div>
    </section>
  );
};

const UsersPanel = ({ session }: { session: Session }) => {
  const emptyForm = { username: '', firstName: '', lastName: '', password: '', role: 'worker' as Role, shopId: '' };
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextUsers, nextShops] = await Promise.all([api.users.list(session.token), api.shops.list(session.token)]);
      setUsers(nextUsers);
      setShops(nextShops);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  const edit = (user: ManagedUser) => {
    setEditingId(user.id);
    setForm({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      password: '',
      role: user.role,
      shopId: user.shopId ?? '',
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const payload = {
        username: form.username.trim().toLowerCase(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        shopId: form.role === 'worker' ? form.shopId || null : null,
      };
      if (editingId) {
        await api.users.update(session.token, editingId, payload);
        setNotice('Пользователь обновлен.');
      } else {
        await api.users.create(session.token, { ...payload, password: form.password });
        setNotice('Пользователь создан.');
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordUser) {
      return;
    }
    try {
      await api.users.resetPassword(session.token, passwordUser.id, newPassword);
      setNotice(`Пароль для ${passwordUser.username} обновлен.`);
      setPasswordUser(null);
      setNewPassword('');
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const remove = async (user: ManagedUser) => {
    if (!window.confirm(`Удалить пользователя ${user.username}?`)) {
      return;
    }
    try {
      await api.users.delete(session.token, user.id);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const shopName = (user: ManagedUser) => shops.find((shop) => shop.id === user.shopId)?.name ?? 'Не назначен';

  return (
    <section className="page-section">
      <PageHeader title="Пользователи" subtitle="Управление доступом, ролями, магазинами и сбросом паролей." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} notice={notice} />
      <form className="form-grid website-form" onSubmit={save}>
        <input placeholder="Логин" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <input placeholder="Имя" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        <input placeholder="Фамилия" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        {!editingId && <input placeholder="Пароль" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />}
        <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
          <option value="worker">Работник</option>
          <option value="manager">Менеджер</option>
        </select>
        <select value={form.shopId} disabled={form.role === 'manager'} onChange={(event) => setForm({ ...form, shopId: event.target.value })}>
          <option value="">Без магазина</option>
          {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select>
        <button>{editingId ? 'Сохранить' : 'Создать'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => {
          setEditingId(null);
          setForm(emptyForm);
        }}>Отмена</button>}
      </form>
      {loading ? <p>Загружаем пользователей...</p> : (
        <Table>
          <thead><tr><th>Логин</th><th>ФИО</th><th>Роль</th><th>Магазин</th><th>Действия</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.fullName}</td>
                <td>{user.role === 'manager' ? 'Менеджер' : 'Работник'}</td>
                <td>{user.role === 'worker' ? shopName(user) : '-'}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => edit(user)}>Редактировать</button>
                  <button className="secondary" onClick={() => {
                    setPasswordUser(user);
                    setNewPassword('');
                  }}>Сбросить пароль</button>
                  <button className="danger" onClick={() => void remove(user)} disabled={user.id === session.user.id}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {passwordUser && (
        <Modal title={`Сброс пароля: ${passwordUser.username}`} onClose={() => setPasswordUser(null)}>
          <form className="modal-form" onSubmit={resetPassword}>
            <label>
              Новый пароль
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoFocus />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setPasswordUser(null)}>Отмена</button>
              <button disabled={newPassword.length < 5}>Обновить пароль</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
};

const ShopsPanel = ({ session }: { session: Session }) => {
  const emptyForm = { name: '', machineNumber: '1' };
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setShops(await api.shops.list(session.token));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = { name: form.name.trim(), machineNumber: intOrZero(form.machineNumber) || 1 };
      if (editingId) {
        await api.shops.update(session.token, editingId, payload);
      } else {
        await api.shops.create(session.token, payload);
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const remove = async (shop: Shop) => {
    if (!window.confirm(`Удалить магазин ${shop.name}?`)) {
      return;
    }
    try {
      await api.shops.delete(session.token, shop.id);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="page-section">
      <PageHeader title="Магазины" subtitle="Список точек и привязка к машинам." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} />
      <form className="form-grid compact website-form" onSubmit={save}>
        <input placeholder="Название магазина" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <select value={form.machineNumber} onChange={(event) => setForm({ ...form, machineNumber: event.target.value })}>
          <option value="1">Машина 1</option>
          <option value="2">Машина 2</option>
          <option value="3">Машина 3</option>
        </select>
        <button>{editingId ? 'Сохранить магазин' : 'Создать магазин'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => {
          setEditingId(null);
          setForm(emptyForm);
        }}>Отмена</button>}
      </form>
      {loading ? <p>Загружаем магазины...</p> : (
        <Table>
          <thead><tr><th>Название</th><th>Машина</th><th>Действия</th></tr></thead>
          <tbody>
            {shops.map((shop) => (
              <tr key={shop.id}>
                <td>{shop.name}</td>
                <td>{shop.machineNumber}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => {
                    setEditingId(shop.id);
                    setForm({ name: shop.name, machineNumber: String(shop.machineNumber) });
                  }}>Редактировать</button>
                  <button className="danger" onClick={() => void remove(shop)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
};

const ProductsPanel = ({ session }: { session: Session }) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [table, setTable] = useState<StockTable | null>(null);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [query, setQuery] = useState('');
  const [windowStart, setWindowStart] = useState(DASHBOARD_WINDOW_START);
  const [stockView, setStockView] = useState<StockView>('dashboard');
  const [orderValues, setOrderValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState(productToForm());
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ productId: string; date: string; productName: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (shopId = selectedShopId, nextView = stockView, nextWindowStart = windowStart) => {
    setLoading(true);
    setError('');
    try {
      const nextShops = await api.shops.list(session.token);
      setShops(nextShops);
      const resolvedShopId = shopId || nextShops[0]?.id || '';
      setSelectedShopId(resolvedShopId);
      if (!resolvedShopId) {
        setTable(null);
        return;
      }

      const dashboardFrom = addDays(nextWindowStart, -WEEK_DAYS);
      const from = nextView === 'dashboard' ? dashboardFrom : nextWindowStart;
      const to = nextView === 'dashboard' ? getTwoWeeksEnd(dashboardFrom) : addDays(nextWindowStart, WEEK_DAYS - 1);
      const nextTable = await api.stock.table(session.token, { shopId: resolvedShopId, from, to });
      setTable(nextTable);

      if (nextView === 'dashboard') {
        try {
          const loaded: Record<string, string> = {};
          const nextOrderValues = await api.stock.listShopOrderValues(session.token, resolvedShopId, from, to);
          for (const entry of nextOrderValues) {
            loaded[`${entry.productId}:${entry.orderDate}`] = String(entry.packs);
          }
          setOrderValues(loaded);
        } catch {
          setOrderValues({});
        }
      } else {
        setOrderValues({});
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token, selectedShopId, windowStart, stockView]);

  const visibleRows = useMemo(() => {
    const normalized = normalizeText(query);
    return (table?.rows ?? []).filter((row) => !normalized || normalizeText(row.name).includes(normalized));
  }, [query, table]);

  const rowsByCategory = useMemo(() => {
    const grouped = PRODUCT_CATEGORIES.reduce((acc, category) => {
      acc[category] = [] as Product[];
      return acc;
    }, {} as Record<ProductCategory, Product[]>);
    for (const row of visibleRows) {
      const category = PRODUCT_CATEGORIES.includes(row.category) ? row.category : PRODUCT_CATEGORIES[0];
      grouped[category].push(row);
    }
    return grouped;
  }, [visibleRows]);

  const orderedRows = useMemo(() => PRODUCT_CATEGORIES.flatMap((category) => rowsByCategory[category]), [rowsByCategory]);

  const dashboardWeeks = useMemo(() => {
    if (!table) {
      return {
        current: {} as WeekDateMap,
        previous: null as WeekDateMap | null,
        currentStart: undefined as string | undefined,
        previousStart: undefined as string | undefined,
      };
    }
    const weeks = splitWeeks(table.dates);
    if (weeks.length === 0) {
      return { current: mapWeekDates(table.dates), previous: null, currentStart: table.dates[0], previousStart: undefined };
    }
    const currentWeek = weeks[weeks.length - 1];
    const previousWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
    return {
      current: mapWeekDates(currentWeek),
      previous: previousWeek ? mapWeekDates(previousWeek) : null,
      currentStart: currentWeek[0],
      previousStart: previousWeek?.[0],
    };
  }, [table]);

  const dashboardDateFor = (week: DashboardWeekRef, slot: WeekSlot): string | undefined =>
    week === 'previous' ? dashboardWeeks.previous?.[slot] : dashboardWeeks.current[slot];

  const dashboardRangeLabel = (week: DashboardWeekRef, from: WeekSlot, to: WeekSlot, toWeek?: DashboardWeekRef): string => {
    const fromDate = dashboardDateFor(week, from);
    const toDate = dashboardDateFor(toWeek ?? week, to);
    return fromDate && toDate ? `${formatDateShort(fromDate)}-${formatDateShort(toDate)}` : '';
  };

  const dashboardHeaderSubtitle = (column: DashboardColumn): string => {
    if (!column.subtitle) {
      return '';
    }
    if (column.dateKind === 'day' && column.dateDay && column.dateWeek) {
      const date = dashboardDateFor(column.dateWeek, column.dateDay);
      return date ? `${column.subtitle}\n${formatDateShort(date)}` : column.subtitle;
    }
    if (column.dateKind === 'range' && column.dateWeek && column.dateFrom && column.dateTo) {
      const range = dashboardRangeLabel(column.dateWeek, column.dateFrom, column.dateTo, column.dateToWeek);
      return range ? `${column.subtitle}\n${range}` : column.subtitle;
    }
    return column.subtitle;
  };

  const productReferenceLabel = (row: Product): string => {
    const parts: string[] = [];
    if (row.packType) parts.push(row.packType);
    if (Number.isFinite(Number(row.unitsInPack))) parts.push(`${row.unitsInPack} шт/уп`);
    if (Number.isFinite(Number(row.packWeightKg))) parts.push(`${row.packWeightKg} кг`);
    if (Number.isFinite(Number(row.shelfLifeDays))) parts.push(`${row.shelfLifeDays} сут`);
    const price = formatOptionalPrice(row.unitPriceRubVat);
    if (price) parts.push(price);
    if (row.minStockUnits !== null || row.maxStockUnits !== null) {
      parts.push(`границы: ${row.minStockUnits ?? '-'}-${row.maxStockUnits ?? '-'}`);
    }
    return parts.join(' · ');
  };

  const currentStockDateForColumn = (key: DashboardColumnKey): string | undefined => {
    if (key === 'currentTue') return dashboardWeeks.current.tue;
    if (key === 'currentWed') return dashboardWeeks.current.wed;
    if (key === 'currentThu') return dashboardWeeks.current.thu;
    if (key === 'currentFri') return dashboardWeeks.current.fri;
    if (key === 'currentSun') return dashboardWeeks.current.sun;
    if (key === 'currentMon') return dashboardWeeks.current.mon;
    return undefined;
  };

  const orderDateForKey = (key: DashboardManualOrderKey): string | undefined => {
    if (key === 'orderPackThu') return dashboardWeeks.current.thu;
    if (key === 'orderPackSat') return dashboardWeeks.current.thu ? addDays(dashboardWeeks.current.thu, 2) : undefined;
    if (key === 'orderPackTue') return dashboardWeeks.current.sun ? addDays(dashboardWeeks.current.sun, 2) : undefined;
    return undefined;
  };

  const orderPacksForDate = (productId: string, date?: string): string => (date ? orderValues[`${productId}:${date}`] ?? '' : '');
  const orderCellValue = (productId: string, key: DashboardManualOrderKey): string => orderPacksForDate(productId, orderDateForKey(key));

  const setOrderCellValue = (productId: string, key: DashboardManualOrderKey, value: string) => {
    const date = orderDateForKey(key);
    if (!date || !selectedShopId) {
      return;
    }
    const nextValue = sanitizeOrderValue(value);
    setOrderValues((current) => ({ ...current, [`${productId}:${date}`]: nextValue }));
    const packs = nextValue ? Number.parseInt(nextValue, 10) : 0;
    void api.stock.updateOrderValue(session.token, {
      shopId: selectedShopId,
      productId,
      orderDate: date,
      packs: Number.isNaN(packs) ? 0 : packs,
    }).catch((err) => setError(messageOf(err)));
  };

  const dashboardRowValues = (row: Product): DashboardRowValues => {
    const current = dashboardWeeks.current;
    const previous = dashboardWeeks.previous;
    const previousStart = dashboardWeeks.previousStart;
    const stock = (date?: string) => (date ? row.values[date] ?? '' : '');
    const previousWeekSoldValue = (key: 'soldMonWed' | 'soldWedFri' | 'soldFriMon'): string => {
      const value = previousStart ? row.dashboardOverrides?.[`${previousStart}:${key}`] : undefined;
      return hasValue(value) ? value : '';
    };

    const prevOrderTueUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, current.tue), row.unitsInPack);
    const soldMonWedCurrent = computeSold(stock(previous?.sun), prevOrderTueUnits, stock(current.wed));
    const curOrderThuUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, current.thu), row.unitsInPack);
    const soldWedFriCurrent = computeSold(stock(current.tue), curOrderThuUnits, stock(current.fri));
    const prevOrderSatUnits = previous?.thu
      ? orderUnitsFromPacks(orderPacksForDate(row.productId, addDays(previous.thu, 2)), row.unitsInPack)
      : '';
    const soldFriMonCurrent = computeSold(stock(previous?.thu), prevOrderSatUnits, stock(current.mon));
    const soldMonWedPrevious = previous ? diffStocks(stock(previous.mon), stock(previous.wed)) : '';
    const prevOrderThuUnits = previous?.thu ? orderUnitsFromPacks(orderPacksForDate(row.productId, previous.thu), row.unitsInPack) : '';
    const soldWedFriPrevious = previous ? computeSold(stock(previous.tue), prevOrderThuUnits, stock(previous.fri)) : '';
    const prevPrevOrderSatUnits = previous?.thu
      ? orderUnitsFromPacks(orderPacksForDate(row.productId, addDays(previous.thu, 2)), row.unitsInPack)
      : '';
    const soldFriMonPrevious = previous ? computeSold(stock(previous.thu), prevPrevOrderSatUnits, stock(previous.mon)) : '';
    const copiedSoldMonWedPrevious = previousWeekSoldValue('soldMonWed');
    const copiedSoldWedFriPrevious = previousWeekSoldValue('soldWedFri');
    const copiedSoldFriMonPrevious = previousWeekSoldValue('soldFriMon');
    const orderPackThu = orderCellValue(row.productId, 'orderPackThu');
    const orderPackSat = orderCellValue(row.productId, 'orderPackSat');
    const orderPackTue = orderCellValue(row.productId, 'orderPackTue');

    const base: DashboardRowValues = {
      currentTue: stock(current.tue),
      orderPackThu,
      orderUnitsThu: orderUnitsFromPacks(orderPackThu, row.unitsInPack),
      prevWed: previous ? stock(previous.wed) : '',
      soldPrevMonWed: copiedSoldMonWedPrevious || soldMonWedPrevious,
      soldMonWed: soldMonWedCurrent,
      currentWed: stock(current.wed),
      currentThu: stock(current.thu),
      orderPackSat,
      orderUnitsSat: orderUnitsFromPacks(orderPackSat, row.unitsInPack),
      prevFri: previous ? stock(previous.fri) : '',
      soldPrevWedFri: copiedSoldWedFriPrevious || soldWedFriPrevious,
      soldWedFri: soldWedFriCurrent,
      currentFri: stock(current.fri),
      currentSun: stock(current.sun),
      orderPackTue,
      orderUnitsTue: orderUnitsFromPacks(orderPackTue, row.unitsInPack),
      prevMon: previous ? stock(previous.mon) : '',
      soldPrevFriMon: copiedSoldFriMonPrevious || soldFriMonPrevious,
      soldFriMon: soldFriMonCurrent,
      currentMon: stock(current.mon),
    };
    const withOverrides = applyDashboardOverrides(base, row, dashboardWeeks.currentStart);
    return {
      ...withOverrides,
      soldPrevMonWed: copiedSoldMonWedPrevious || withOverrides.soldPrevMonWed,
      soldPrevWedFri: copiedSoldWedFriPrevious || withOverrides.soldPrevWedFri,
      soldPrevFriMon: copiedSoldFriMonPrevious || withOverrides.soldPrevFriMon,
    };
  };

  const updateCalendarCell = (productId: string, date: string, value: string) => {
    setTable((current) => current
      ? { ...current, rows: current.rows.map((row) => row.productId === productId ? { ...row, values: { ...row.values, [date]: sanitizeStock(value) } } : row) }
      : current);
  };

  const saveStockCell = async (productId: string, date: string, value: string) => {
    if (!selectedShopId) {
      return;
    }
    try {
      const sanitized = sanitizeStock(value);
      await api.stock.updateValue(session.token, { shopId: selectedShopId, productId, date, value: sanitized });
      updateCalendarCell(productId, date, sanitized);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const openEditCell = (row: Product, date: string) => {
    setEditingCell({ productId: row.productId, date, productName: row.name });
    setEditingValue(row.values[date] ?? '');
  };

  const createProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.stock.createProduct(session.token, { ...form, name: form.name.trim(), packType: form.packType.trim() });
      setForm(productToForm());
      setIsAddProductOpen(false);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const removeProduct = async (product: Product) => {
    if (!window.confirm(`Удалить товар ${product.name}?`)) {
      return;
    }
    try {
      await api.stock.deleteProduct(session.token, product.productId);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const exportDashboard = () => {
    if (!table) {
      return;
    }
    const headers = [
      'Категория',
      'Товар',
      'Упаковка',
      'Количество в упаковке',
      'Вес упаковки, кг',
      'Срок годности, сут',
      'Цена в руб, с НДС',
      ...DASHBOARD_COLUMNS.map((column) => {
        const subtitle = dashboardHeaderSubtitle(column).replace('\n', ' ');
        return subtitle ? `${column.title} (${subtitle})` : column.title;
      }),
    ];
    const rows = orderedRows.map((row) => {
      const values = dashboardRowValues(row);
      return [
        row.category,
        row.name,
        row.packType ?? '',
        row.unitsInPack !== null ? String(row.unitsInPack) : '',
        row.packWeightKg !== null ? String(row.packWeightKg) : '',
        row.shelfLifeDays !== null ? String(row.shelfLifeDays) : '',
        row.unitPriceRubVat !== null && row.unitPriceRubVat !== undefined ? String(row.unitPriceRubVat) : '',
        ...DASHBOARD_COLUMNS.map((column) => values[column.key] ?? ''),
      ];
    });
    const blob = new Blob([`\uFEFF${buildCsv([headers, ...rows])}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(`manager_dashboard_${table.shop.name}_${table.from}_${table.to}`)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const renderDashboardCategory = (category: ProductCategory, rows: Product[]) => (
    <section key={category} className="manager-category-block">
      <div className="manager-category-title">{category}</div>
      <div className="manager-table-scroll">
        <table className="manager-stock-table manager-dashboard-table">
          <colgroup>
            <col className="manager-name-col-width" />
            {DASHBOARD_COLUMNS.map((column) => (
              <col key={column.key} className="dashboard-data-col-width" />
            ))}
            <col className="manager-action-col-width" />
          </colgroup>
          <thead>
            <tr>
              <th className="manager-name-col dashboard-name-header">Товар</th>
              {DASHBOARD_COLUMNS.map((column) => (
                <th key={column.key} className={`dashboard-col-${column.kind} dashboard-tone-${column.tone}`}>
                  <span className={column.kind === 'stock' ? 'dashboard-title-stock' : ''}>{column.title}</span>
                  {dashboardHeaderSubtitle(column) && <small>{dashboardHeaderSubtitle(column)}</small>}
                </th>
              ))}
              <th className="manager-action-col dashboard-name-header">Действие</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={DASHBOARD_COLUMNS.length + 2} className="manager-empty-row">Нет товаров в этой таблице</td></tr>
            ) : rows.map((row) => {
              const values = dashboardRowValues(row);
              return (
                <tr key={row.productId}>
                  <td className="manager-name-col">
                    <strong>{row.name}</strong>
                    <small>{productReferenceLabel(row)}</small>
                  </td>
                  {DASHBOARD_COLUMNS.map((column) => {
                    const value = values[column.key] ?? '';
                    if (column.kind === 'order' && isManualOrderKey(column.key)) {
                      const manualOrderKey = column.key;
                      return (
                        <td key={column.key} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                          <input
                            className="dashboard-order-input"
                            value={value}
                            maxLength={MAX_ORDER_VALUE_LEN}
                            placeholder="-"
                            onChange={(event) => setOrderCellValue(row.productId, manualOrderKey, event.target.value)}
                          />
                        </td>
                      );
                    }
                    if (column.kind === 'stock' && isManualStockKey(column.key)) {
                      const date = currentStockDateForColumn(column.key);
                      return (
                        <td key={column.key} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                          <button className="stock-cell-button" onClick={() => date && openEditCell(row, date)}>
                            {value || '-'}
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={column.key} className={`dashboard-col-${column.kind} dashboard-value-${column.tone}`}>
                        <span className={column.kind === 'stock' ? 'dashboard-stock-value' : column.kind === 'order' ? 'dashboard-order-value' : ''}>
                          {value || '-'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="manager-action-col"><button className="danger compact" onClick={() => void removeProduct(row)}>Удалить</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderCalendarCategory = (category: ProductCategory, rows: Product[]) => (
    <section key={category} className="manager-category-block">
      <div className="manager-category-title">{category}</div>
      <div className="manager-table-scroll">
        <table className="manager-stock-table">
          <thead>
            <tr>
              <th className="manager-name-col">Товар</th>
              {table?.dates.map((date) => (
                <th key={date} className="calendar-date-col">
                  <span>{parseDateKey(date).toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                  <small>{formatDateShort(date)}</small>
                </th>
              ))}
              <th className="manager-action-col">Действие</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={(table?.dates.length ?? 0) + 2} className="manager-empty-row">Нет товаров в этой таблице</td></tr>
            ) : rows.map((row) => (
              <tr key={row.productId}>
                <td className="manager-name-col">
                  <strong>{row.name}</strong>
                  <small>{productReferenceLabel(row)}</small>
                </td>
                {table?.dates.map((date) => (
                  <td key={date} className="calendar-date-col">
                    <input
                      className="cell-input"
                      value={row.values[date] ?? ''}
                      onChange={(event) => updateCalendarCell(row.productId, date, event.target.value)}
                      onBlur={(event) => void saveStockCell(row.productId, date, event.target.value)}
                    />
                  </td>
                ))}
                <td className="manager-action-col"><button className="danger compact" onClick={() => void removeProduct(row)}>Удалить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section className="page-section stock-page-section">
      <PageHeader title="Остатки" subtitle="Менеджерская таблица остатков, заказов и продаж по магазину." action={<RefreshButton onClick={() => load()} />} />
      <Feedback error={error} />

      <div className="manager-controls">
        <input className="manager-search" placeholder="Поиск товара" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="manager-button-row">
          <select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)}>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
          <button className="secondary" onClick={() => setWindowStart((current) => addDays(current, -WEEK_DAYS))}>-1 нед.</button>
          <button className="secondary" onClick={() => setWindowStart(DASHBOARD_WINDOW_START)}>Текущая нед.</button>
          <button className="secondary" onClick={() => setWindowStart((current) => addDays(current, WEEK_DAYS))}>+1 нед.</button>
          <button onClick={() => setIsAddProductOpen(true)}>Добавить товар</button>
          <button className="secondary" onClick={exportDashboard}>Экспорт в Excel</button>
        </div>
      </div>

      <div className="manager-meta-row">
        <strong>Позиций: {visibleRows.length}</strong>
        <strong>{table ? `${windowStart} - ${addDays(windowStart, WEEK_DAYS - 1)}` : ''}</strong>
      </div>

      <div className="manager-view-tabs">
        <button className={stockView === 'dashboard' ? 'active' : ''} onClick={() => setStockView('dashboard')}>Дашборд</button>
        <button className={stockView === 'calendar' ? 'active' : ''} onClick={() => setStockView('calendar')}>Календарь</button>
      </div>

      <div className="manager-table-wrap">
        {loading ? <p className="manager-loading">Загружаем остатки...</p> : PRODUCT_CATEGORIES.map((category) =>
          stockView === 'dashboard'
            ? renderDashboardCategory(category, rowsByCategory[category])
            : renderCalendarCategory(category, rowsByCategory[category]),
        )}
      </div>

      {isAddProductOpen && (
        <Modal title="Добавить товар" onClose={() => setIsAddProductOpen(false)}>
          <form className="modal-form product-modal-form" onSubmit={createProduct}>
            <input placeholder="Название товара" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ProductCategory })}>
              {PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <input placeholder="Тип упаковки" value={form.packType} onChange={(event) => setForm({ ...form, packType: event.target.value })} />
            <NumberInput label="Штук в упаковке" value={form.unitsInPack} onChange={(value) => setForm({ ...form, unitsInPack: intOrZero(value) })} />
            <NumberInput label="Вес упаковки, кг" value={form.packWeightKg} onChange={(value) => setForm({ ...form, packWeightKg: numberOrZero(value) })} />
            <NumberInput label="Срок годности, дней" value={form.shelfLifeDays} onChange={(value) => setForm({ ...form, shelfLifeDays: intOrZero(value) })} />
            <NumberInput label="Цена с НДС, руб" value={form.unitPriceRubVat} onChange={(value) => setForm({ ...form, unitPriceRubVat: numberOrZero(value) })} />
            <NumberInput label="Минимальный остаток" value={form.minStockUnits} onChange={(value) => setForm({ ...form, minStockUnits: intOrZero(value) })} />
            <NumberInput label="Максимальный остаток" value={form.maxStockUnits} onChange={(value) => setForm({ ...form, maxStockUnits: intOrZero(value) })} />
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setIsAddProductOpen(false)}>Отмена</button>
              <button type="submit">Сохранить</button>
            </div>
          </form>
        </Modal>
      )}

      {editingCell && (
        <Modal title="Изменить остаток" onClose={() => setEditingCell(null)}>
          <form className="modal-form" onSubmit={(event) => {
            event.preventDefault();
            void saveStockCell(editingCell.productId, editingCell.date, editingValue).then(() => setEditingCell(null));
          }}>
            <p className="modal-meta">{editingCell.productName} · {formatDateLabel(editingCell.date)}</p>
            <input autoFocus placeholder="0-15" value={editingValue} onChange={(event) => setEditingValue(sanitizeStock(event.target.value))} />
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditingCell(null)}>Отмена</button>
              <button type="submit">Сохранить</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
};

const OrdersPanel = ({ session }: { session: Session }) => {
  const initialDate = nearestAllowedOrderDate(todayDateKey());
  const [date, setDate] = useState(initialDate);
  const [inputDate, setInputDate] = useState(initialDate);
  const [sheet, setSheet] = useState<OrderSheet | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (targetDate = date): Promise<OrderSheet | null> => {
    setLoading(true);
    setError('');
    try {
      const nextSheet = await api.orders.sheet(session.token, targetDate);
      setSheet(nextSheet);
      setDate(targetDate);
      setInputDate(targetDate);
      return nextSheet;
    } catch (err) {
      setError(messageOf(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(initialDate);
  }, [session.token]);

  const handleLoadDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setError('Формат даты: YYYY-MM-DD');
      return;
    }
    if (!isAllowedOrderDate(inputDate)) {
      setError('Лист заказа доступен только во вторник, четверг и субботу.');
      return;
    }
    void load(inputDate);
  };

  const shiftDate = (direction: 1 | -1) => {
    const next = shiftToAllowedOrderDate(date, direction);
    void load(next);
  };

  const groupRowsByCategory = (targetSheet: OrderSheet | null) => {
    const grouped = PRODUCT_CATEGORIES.reduce((acc, category) => {
      acc[category] = [];
      return acc;
    }, {} as Record<ProductCategory, OrderSheetRow[]>);

    if (!targetSheet) {
      return grouped;
    }

    const normalizedQuery = query.trim().toLowerCase();
    for (const row of targetSheet.rows) {
      if (normalizedQuery && !row.productName.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      const category = PRODUCT_CATEGORIES.includes(row.category as ProductCategory)
        ? row.category as ProductCategory
        : PRODUCT_CATEGORIES[0];
      grouped[category].push(row);
    }
    for (const category of PRODUCT_CATEGORIES) {
      grouped[category] = sortProductsLikeImage(
        grouped[category].map((row) => ({ ...row, name: row.productName, category: row.category as ProductCategory })),
      ).map(({ name: _name, ...row }) => row as OrderSheetRow);
    }
    return grouped;
  };

  const groupShopsByMachine = (targetSheet: OrderSheet | null): MachineGroup[] => {
    if (!targetSheet) {
      return [];
    }
    return MACHINE_NUMBERS.map((machineNumber) => ({
      machineNumber,
      shops: targetSheet.shops.filter((shop) => shop.machineNumber === machineNumber),
    })).filter((group) => group.shops.length > 0);
  };

  const rowsByCategory = useMemo(() => {
    return groupRowsByCategory(sheet);
  }, [query, sheet]);

  const machineGroups = useMemo<MachineGroup[]>(() => {
    return groupShopsByMachine(sheet);
  }, [sheet]);

  const rowValue = (row: OrderSheetRow, shopId: string): number => row.shopValues[shopId] ?? 0;
  const machineTotal = (row: OrderSheetRow, shops: Shop[]): number =>
    shops.reduce((sum, shop) => sum + rowValue(row, shop.id), 0);

  const downloadSheet = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setError('Формат даты: YYYY-MM-DD');
      return;
    }
    if (!isAllowedOrderDate(inputDate)) {
      setError('Лист заказа доступен только во вторник, четверг и субботу.');
      return;
    }

    const targetSheet = sheet?.date === inputDate ? sheet : await load(inputDate);
    if (!targetSheet) {
      return;
    }

    const targetGroups = groupShopsByMachine(targetSheet);
    const targetRowsByCategory = groupRowsByCategory(targetSheet);
    const rows: XlsxCell[][] = [
      [
        { value: '', style: 1 },
        ...targetGroups.flatMap((group) => [
          { value: `МАШИНА ${group.machineNumber}`, style: 1 },
          ...Array.from({ length: group.shops.length + 1 }, () => ({ value: '', style: 1 })),
        ]),
      ],
      [
        { value: 'Номенклатура', style: 1 },
        ...targetGroups.flatMap((group) => [
          ...group.shops.map((shop) => ({ value: shop.name, style: 1 })),
          { value: 'ИТОГО', style: 1 },
          { value: 'ВЕС', style: 1 },
        ]),
      ],
    ];
    const merges: string[] = [];
    let currentColumn = 2;
    for (const group of targetGroups) {
      const endColumn = currentColumn + group.shops.length + 1;
      merges.push(`${xlsxColumnName(currentColumn)}1:${xlsxColumnName(endColumn)}1`);
      currentColumn = endColumn + 1;
    }

    for (const category of PRODUCT_CATEGORIES) {
      const categoryRows = targetRowsByCategory[category];
      if (!categoryRows.length) {
        continue;
      }
      rows.push([
        { value: category, style: 2 },
        ...targetGroups.flatMap((group) =>
          Array.from({ length: group.shops.length + 2 }, () => ({ value: '', style: 2 })),
        ),
      ]);
      for (const row of categoryRows) {
        rows.push([
          { value: row.productName },
          ...targetGroups.flatMap((group) => {
            const total = machineTotal(row, group.shops);
            return [
              ...group.shops.map((shop) => {
                const value = rowValue(row, shop.id);
                return { value: value || '', style: 3, type: value ? 'number' as const : 'string' as const };
              }),
              { value: total || '', style: 3, type: total ? 'number' as const : 'string' as const },
              { value: formatWeight(total, row.packWeightKg), style: 3 },
            ];
          }),
        ]);
      }
    }

    const blob = makeXlsxBlob(`Заказ ${targetSheet.date}`, rows, merges);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(`zakaz_${targetSheet.date}`)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="page-section">
      <PageHeader
        title="Заказ"
        subtitle="Сводная таблица заказов по товарам, магазинам и машинам."
        action={<RefreshButton onClick={() => load()} />}
      />
      <Feedback error={error} />
      <div className="toolbar hero-toolbar">
        <button className="secondary date-step" onClick={() => shiftDate(-1)} aria-label="Предыдущая дата заказа">‹</button>
        <input type="date" value={inputDate} onChange={(event) => setInputDate(event.target.value)} />
        <button className="secondary date-step" onClick={() => shiftDate(1)} aria-label="Следующая дата заказа">›</button>
        <button onClick={() => void downloadSheet()}>Скачать</button>
        <input
          className="search-field"
          placeholder="Поиск по названию"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading && !sheet ? <p>Загружаем заказ...</p> : sheet && (
        <div className="order-sheet-wrap">
          <div className="order-sheet-meta">
            <span className="weekday-badge">{formatWeekdayLabel(sheet.date)}</span>
            <strong>Заказ на {formatDateLabel(sheet.date)}</strong>
            <span>Магазинов: {sheet.shops.length}</span>
          </div>
          <div className="order-sheet-scroll">
            <table className="order-sheet-table">
              <thead>
                <tr className="machine-row">
                  <th className="sticky order-name-col" />
                  {machineGroups.map((group) => (
                    <th key={group.machineNumber} colSpan={group.shops.length + 2} className="machine-title">
                      МАШИНА {group.machineNumber}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="sticky order-name-col">Номенклатура</th>
                  {machineGroups.flatMap((group) => [
                    ...group.shops.map((shop) => (
                      <th key={`${group.machineNumber}:${shop.id}`} className="shop-col">{shop.name}</th>
                    )),
                    <th key={`${group.machineNumber}:total`} className="total-col">ИТОГО</th>,
                    <th key={`${group.machineNumber}:weight`} className="weight-col">ВЕС</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {PRODUCT_CATEGORIES.map((category) => {
                  const rows = rowsByCategory[category];
                  if (!rows.length) {
                    return null;
                  }
                  return (
                    <React.Fragment key={category}>
                      <tr className="category-row">
                        <td className="sticky order-name-col">{category}</td>
                        {machineGroups.map((group) => (
                          <td key={group.machineNumber} colSpan={group.shops.length + 2} />
                        ))}
                      </tr>
                      {rows.map((row) => (
                        <tr key={row.productId}>
                          <td className="sticky order-name-col product-name">{row.productName}</td>
                          {machineGroups.flatMap((group) => {
                            const total = machineTotal(row, group.shops);
                            return [
                              ...group.shops.map((shop) => {
                                const value = rowValue(row, shop.id);
                                return <td key={`${row.productId}:${shop.id}`} className="number-cell">{value || ''}</td>;
                              }),
                              <td key={`${row.productId}:${group.machineNumber}:total`} className="number-cell total-cell">{total || ''}</td>,
                              <td key={`${row.productId}:${group.machineNumber}:weight`} className="number-cell weight-cell">
                                {formatWeight(total, row.packWeightKg)}
                              </td>,
                            ];
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

const SellerOrdersPanel = ({ session }: { session: Session }) => {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [table, setTable] = useState<StockTable | null>(null);
  const [status, setStatus] = useState<'all' | 'new' | 'processed'>('all');
  const [form, setForm] = useState({ shopId: '', productId: '', stockOnHand: '', requestedPacks: '1' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const products = table?.rows ?? [];
  const selectedProduct = products.find((product) => product.productId === form.productId) ?? null;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOrders, nextShops] = await Promise.all([api.orders.list(session.token), api.shops.list(session.token)]);
      const shopId = form.shopId || nextShops[0]?.id || '';
      const nextTable = shopId ? await api.stock.table(session.token, { shopId, range: 'week' }) : null;
      setOrders(nextOrders);
      setShops(nextShops);
      setTable(nextTable);
      setForm((current) => ({ ...current, shopId, productId: current.productId || nextTable?.rows[0]?.productId || '' }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProduct) {
      return;
    }
    try {
      const requestedPacks = Math.max(1, intOrZero(form.requestedPacks));
      const unitsInPack = selectedProduct.unitsInPack && selectedProduct.unitsInPack > 0 ? selectedProduct.unitsInPack : 1;
      await api.orders.create(session.token, {
        shopId: form.shopId,
        productId: form.productId,
        stockOnHand: form.stockOnHand ? intOrZero(form.stockOnHand) : null,
        requestedPacks,
        requestedUnits: requestedPacks * unitsInPack,
        autoSuggested: false,
      });
      setForm((current) => ({ ...current, stockOnHand: '', requestedPacks: '1' }));
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const updateStatus = async (order: SellerOrder) => {
    try {
      const nextStatus = order.status === 'new' ? 'processed' : 'new';
      await api.orders.updateStatus(session.token, order.id, nextStatus);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const filtered = useMemo(() => orders.filter((order) => status === 'all' || order.status === status), [orders, status]);

  return (
    <section className="page-section">
      <PageHeader title="Заказы" subtitle="Заявки от продавцов и ручное создание заказов." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} />
      <form className="form-grid compact website-form" onSubmit={createOrder}>
        <select value={form.shopId} onChange={(event) => {
          setForm({ ...form, shopId: event.target.value, productId: '' });
          void api.stock.table(session.token, { shopId: event.target.value, range: 'week' }).then(setTable).catch((err) => setError(messageOf(err)));
        }}>
          {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select>
        <select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>
          {products.map((product) => <option key={product.productId} value={product.productId}>{product.name}</option>)}
        </select>
        <input placeholder="Остаток" value={form.stockOnHand} onChange={(event) => setForm({ ...form, stockOnHand: event.target.value.replace(/[^0-9]/g, '') })} />
        <input placeholder="Упаковок" value={form.requestedPacks} onChange={(event) => setForm({ ...form, requestedPacks: event.target.value.replace(/[^0-9]/g, '') })} />
        <button>Создать заказ</button>
      </form>
      <div className="toolbar hero-toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">Все статусы</option>
          <option value="new">Новые</option>
          <option value="processed">Обработанные</option>
        </select>
      </div>
      {loading ? <p>Загружаем заказы...</p> : (
        <Table>
          <thead><tr><th>Создан</th><th>Магазин</th><th>Товар</th><th>Упаковок</th><th>Штук</th><th>Статус</th><th>Действия</th></tr></thead>
          <tbody>
            {filtered.map((order) => (
              <tr key={order.id}>
                <td>{new Date(order.createdAt).toLocaleString('ru-RU')}</td>
                <td>{order.shopName ?? order.shopId}</td>
                <td>{order.productName}</td>
                <td>{order.requestedPacks}</td>
                <td>{order.requestedUnits}</td>
                <td><span className={`pill ${order.status}`}>{orderStatusLabel(order.status)}</span></td>
                <td><button className="secondary" onClick={() => void updateStatus(order)}>{order.status === 'new' ? 'Обработать' : 'Вернуть в новые'}</button></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
};

const AttendancePanel = ({ session }: { session: Session }) => {
  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(addDays(startOfWeek(), 6));
  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await api.checkin.stats(session.token, from, to));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  return (
    <section className="page-section">
      <PageHeader title="Посещаемость" subtitle="Check-in работников, часы, опоздания и отсутствия." action={<RefreshButton onClick={load} />} />
      <Feedback error={error} />
      <div className="toolbar hero-toolbar">
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <button onClick={() => void load()}>Показать период</button>
      </div>
      {loading ? <p>Считаем посещаемость...</p> : stats && (
        <>
          <div className="metric-grid">
            <Metric label="На смене" value={stats.currentlyIn} hint="Сейчас" />
            <Metric label="Вне смены" value={stats.currentlyOut} hint="Сейчас" />
            <Metric label="Check-in" value={stats.totalCheckIns} hint={`${formatDate(stats.from)} - ${formatDate(stats.to)}`} />
            <Metric label="Часы" value={formatMinutes(stats.workedMinutes)} hint="Оценка по событиям" />
            <Metric label="Опоздания" value={stats.lateCount} hint={`Позже ${stats.expectedStartTime}`} />
            <Metric label="Отсутствия" value={stats.missingCount} hint="Нет check-in за день" />
          </div>
          <div className="chart-grid">
            <BarChart title="Часы по работникам" items={stats.workers.map((worker) => ({ label: worker.workerDisplayName, value: Math.round(worker.workedMinutes / 60) }))} suffix="ч" />
            <BarChart title="Check-in по дням" items={stats.daily.map((day) => ({ label: day.date.slice(5), value: day.checkIns }))} suffix="" />
          </div>
          <div className="status-grid">
            {stats.workers.map((worker) => (
              <article key={worker.workerId} className="status-card">
                <span className={`status-dot ${worker.status}`} />
                <div>
                  <strong>{worker.workerDisplayName}</strong>
                  <p>{statusLabel(worker.status)} · {formatDateTime(worker.lastChangedAt)}</p>
                </div>
              </article>
            ))}
          </div>
          <Table>
            <thead><tr><th>Работник</th><th>Дней на смене</th><th>Часы</th><th>Check-in</th><th>Опоздания</th><th>Отсутствия</th><th>Текущий статус</th></tr></thead>
            <tbody>
              {stats.workers.map((worker) => (
                <tr key={worker.workerId}>
                  <td>{worker.workerDisplayName}</td>
                  <td>{worker.daysPresent}</td>
                  <td>{formatMinutes(worker.workedMinutes)}</td>
                  <td>{worker.totalCheckIns}</td>
                  <td>{worker.lateDays}</td>
                  <td>{worker.missingDays}</td>
                  <td><span className={`pill ${worker.status}`}>{statusLabel(worker.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </Table>
          <EventsTable events={stats.events} />
        </>
      )}
    </section>
  );
};

const EventsTable = ({ events }: { events: WorkerCheckInEvent[] }) => (
  <Table>
    <thead><tr><th>Время</th><th>Работник</th><th>Событие</th></tr></thead>
    <tbody>
      {events.slice(0, 80).map((event) => (
        <tr key={event.id}>
          <td>{formatDateTime(event.eventAt)}</td>
          <td>{event.workerDisplayName}</td>
          <td>{event.status === 'in' ? 'Пришел' : 'Ушел'}</td>
        </tr>
      ))}
    </tbody>
  </Table>
);

const BarChart = ({ title, items, suffix }: { title: string; items: Array<{ label: string; value: number }>; suffix: string }) => {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <article className="chart-card">
      <h3>{title}</h3>
      <div className="bars">
        {items.length === 0 ? <p>Нет данных</p> : items.map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></div>
            <strong>{item.value}{suffix}</strong>
          </div>
        ))}
      </div>
    </article>
  );
};

const PageHeader = ({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) => (
  <header className="page-header">
    <div>
      <p className="eyebrow">Панель администратора</p>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    {action}
  </header>
);

const Metric = ({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) => (
  <article className="metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </article>
);

const Feedback = ({ error, notice }: { error?: string; notice?: string }) => (
  <>
    {error && <p className="error">{error}</p>}
    {notice && <p className="notice">{notice}</p>}
  </>
);

const RefreshButton = ({ onClick }: { onClick: () => void }) => (
  <button className="secondary" onClick={() => void onClick()}>Обновить</button>
);

const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="table-scroll">
    <table>{children}</table>
  </div>
);

const Modal = ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="modal-card">
      <header>
        <h3>{title}</h3>
        <button className="ghost" onClick={onClose}>Закрыть</button>
      </header>
      {children}
    </div>
  </div>
);

const NumberInput = ({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) => (
  <input aria-label={label} placeholder={label} value={String(value)} onChange={(event) => onChange(event.target.value)} />
);

createRoot(document.getElementById('root')!).render(<App />);
