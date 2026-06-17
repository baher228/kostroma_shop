// Pure stock/order dashboard calculations.
// Everything here is side-effect free and independent of React state.
// Week-relative assembly (dashboardRowValues) lives here too, because it is
// a deterministic function of (product, weeks, orderValues) — it does not own state.

import {
  MAX_ORDER_VALUE_LEN,
  WEEK_DAYS,
  type DashboardColumn,
  type DashboardColumnKey,
  type DashboardManualOrderKey,
  type DashboardOverrideKey,
  type DashboardRowValues,
  type DashboardWeekRef,
  type WeekDateMap,
  type WeekSlot,
} from '../../dashboardConfig';
import { PRODUCT_CATEGORIES } from '../../dashboardConfig';
import type { Product, ProductPayload } from '../../types';
import { addDays, formatDateShort, parseDateKey } from '../../dateUtils';
import { formatOptionalPrice } from '../../shared/format';

const hasValue = (value?: string): value is string => typeof value === 'string' && value.trim() !== '';

export const sanitizeOrderValue = (raw: string): string =>
  raw.replace(/[^0-9]/g, '').slice(0, MAX_ORDER_VALUE_LEN);

export const isManualOrderKey = (key: DashboardColumnKey): key is DashboardManualOrderKey =>
  key === 'orderPackThu' || key === 'orderPackSat' || key === 'orderPackTue';

export const isManualStockKey = (
  key: DashboardColumnKey,
): key is 'currentTue' | 'currentWed' | 'currentThu' | 'currentFri' | 'currentSun' | 'currentMon' =>
  key === 'currentTue' ||
  key === 'currentWed' ||
  key === 'currentThu' ||
  key === 'currentFri' ||
  key === 'currentSun' ||
  key === 'currentMon';

export const parseStockNumber = (raw?: string): number | null => {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const diffStocks = (startRaw?: string, endRaw?: string): string => {
  const start = parseStockNumber(startRaw);
  const end = parseStockNumber(endRaw);
  return start === null || end === null ? '' : String(start - end);
};

export const computeSold = (startRaw?: string, deliveryRaw?: string, endRaw?: string): string => {
  const start = parseStockNumber(startRaw);
  const end = parseStockNumber(endRaw);
  if (start === null || end === null) {
    return '';
  }
  const delivery = parseStockNumber(deliveryRaw) ?? 0;
  return String(start + delivery - end);
};

export const orderUnitsFromPacks = (packsRaw: string, unitsInPack: number | null): string => {
  if (!packsRaw || unitsInPack === null || unitsInPack <= 0) {
    return '';
  }
  const packs = Number.parseInt(packsRaw, 10);
  return Number.isNaN(packs) ? '' : String(packs * unitsInPack);
};

export const sanitizeStock = (value: string): string => {
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return String(Math.min(50, Math.max(0, parsed)));
};

export const productToForm = (product?: Product): ProductPayload => ({
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

export const productReferenceLabel = (row: Product): string => {
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

// --- Week mapping -----------------------------------------------------------

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

export const splitWeeks = (dates: string[]): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += WEEK_DAYS) {
    const chunk = dates.slice(i, i + WEEK_DAYS);
    if (chunk.length === WEEK_DAYS) {
      chunks.push(chunk);
    }
  }
  return chunks;
};

export const mapWeekDates = (weekDates: string[]): WeekDateMap => {
  const mapped: WeekDateMap = {};
  for (const date of weekDates) {
    const slot = weekdaySlot(date);
    if (slot) {
      mapped[slot] = date;
    }
  }
  return mapped;
};

export type DashboardWeeks = {
  current: WeekDateMap;
  previous: WeekDateMap | null;
  currentStart: string | undefined;
  previousStart: string | undefined;
};

export const deriveDashboardWeeks = (dates: string[]): DashboardWeeks => {
  const weeks = splitWeeks(dates);
  if (weeks.length === 0) {
    return { current: mapWeekDates(dates), previous: null, currentStart: dates[0], previousStart: undefined };
  }
  const currentWeek = weeks[weeks.length - 1];
  const previousWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  return {
    current: mapWeekDates(currentWeek),
    previous: previousWeek ? mapWeekDates(previousWeek) : null,
    currentStart: currentWeek[0],
    previousStart: previousWeek?.[0],
  };
};

export const dashboardDateFor = (weeks: DashboardWeeks, week: DashboardWeekRef, slot: WeekSlot): string | undefined =>
  week === 'previous' ? weeks.previous?.[slot] : weeks.current[slot];

export const dashboardRangeLabel = (
  weeks: DashboardWeeks,
  week: DashboardWeekRef,
  from: WeekSlot,
  to: WeekSlot,
  toWeek?: DashboardWeekRef,
): string => {
  const fromDate = dashboardDateFor(weeks, week, from);
  const toDate = dashboardDateFor(weeks, toWeek ?? week, to);
  return fromDate && toDate ? `${formatDateShort(fromDate)}-${formatDateShort(toDate)}` : '';
};

export const dashboardHeaderSubtitle = (weeks: DashboardWeeks, column: DashboardColumn): string => {
  if (!column.subtitle) {
    return '';
  }
  if (column.dateKind === 'day' && column.dateDay && column.dateWeek) {
    const date = dashboardDateFor(weeks, column.dateWeek, column.dateDay);
    return date ? `${column.subtitle}\n${formatDateShort(date)}` : column.subtitle;
  }
  if (column.dateKind === 'range' && column.dateWeek && column.dateFrom && column.dateTo) {
    const range = dashboardRangeLabel(weeks, column.dateWeek, column.dateFrom, column.dateTo, column.dateToWeek);
    return range ? `${column.subtitle}\n${range}` : column.subtitle;
  }
  return column.subtitle;
};

// --- Row value assembly -----------------------------------------------------

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

const stockAt = (row: Product, date?: string): string => (date ? row.values[date] ?? '' : '');

export type DashboardRowInput = {
  row: Product;
  weeks: DashboardWeeks;
  orderPacks: (productId: string, date?: string) => string;
};

export const buildDashboardRowValues = ({ row, weeks, orderPacks }: DashboardRowInput): DashboardRowValues => {
  const current = weeks.current;
  const previous = weeks.previous;
  const previousStart = weeks.previousStart;

  const previousWeekSoldValue = (key: 'soldMonWed' | 'soldWedFri' | 'soldFriMon'): string => {
    const value = previousStart ? row.dashboardOverrides?.[`${previousStart}:${key}`] : undefined;
    return hasValue(value) ? value : '';
  };

  // Order pack values mirror ProductsPanel.orderDateForKey: the Sat/Tue slots
  // are offset two days from the current week's thu/sun respectively.
  const orderPackThu = orderPacks(row.productId, current.thu);
  const orderPackSat = current.thu ? orderPacks(row.productId, addDays(current.thu, 2)) : '';
  const orderPackTue = current.sun ? orderPacks(row.productId, addDays(current.sun, 2)) : '';

  const prevOrderTueUnits = orderUnitsFromPacks(orderPacks(row.productId, current.tue), row.unitsInPack);
  const soldMonWedCurrent = computeSold(stockAt(row, previous?.sun), prevOrderTueUnits, stockAt(row, current.wed));
  const curOrderThuUnits = orderUnitsFromPacks(orderPacks(row.productId, current.thu), row.unitsInPack);
  const soldWedFriCurrent = computeSold(stockAt(row, current.tue), curOrderThuUnits, stockAt(row, current.fri));
  const prevOrderSatUnits = previous?.thu
    ? orderUnitsFromPacks(orderPacks(row.productId, addDays(previous.thu, 2)), row.unitsInPack)
    : '';
  const soldFriMonCurrent = computeSold(stockAt(row, previous?.thu), prevOrderSatUnits, stockAt(row, current.mon));
  const soldMonWedPrevious = previous ? diffStocks(stockAt(row, previous.mon), stockAt(row, previous.wed)) : '';
  const prevOrderThuUnits = previous?.thu ? orderUnitsFromPacks(orderPacks(row.productId, previous.thu), row.unitsInPack) : '';
  const soldWedFriPrevious = previous ? computeSold(stockAt(row, previous.tue), prevOrderThuUnits, stockAt(row, previous.fri)) : '';
  const prevPrevOrderSatUnits = previous?.thu
    ? orderUnitsFromPacks(orderPacks(row.productId, addDays(previous.thu, 2)), row.unitsInPack)
    : '';
  const soldFriMonPrevious = previous ? computeSold(stockAt(row, previous.thu), prevPrevOrderSatUnits, stockAt(row, previous.mon)) : '';
  const copiedSoldMonWedPrevious = previousWeekSoldValue('soldMonWed');
  const copiedSoldWedFriPrevious = previousWeekSoldValue('soldWedFri');
  const copiedSoldFriMonPrevious = previousWeekSoldValue('soldFriMon');

  const base: DashboardRowValues = {
    currentTue: stockAt(row, current.tue),
    orderPackThu,
    orderUnitsThu: orderUnitsFromPacks(orderPackThu, row.unitsInPack),
    prevWed: previous ? stockAt(row, previous.wed) : '',
    soldPrevMonWed: copiedSoldMonWedPrevious || soldMonWedPrevious,
    soldMonWed: soldMonWedCurrent,
    currentWed: stockAt(row, current.wed),
    currentThu: stockAt(row, current.thu),
    orderPackSat,
    orderUnitsSat: orderUnitsFromPacks(orderPackSat, row.unitsInPack),
    prevFri: previous ? stockAt(row, previous.fri) : '',
    soldPrevWedFri: copiedSoldWedFriPrevious || soldWedFriPrevious,
    soldWedFri: soldWedFriCurrent,
    currentFri: stockAt(row, current.fri),
    currentSun: stockAt(row, current.sun),
    orderPackTue,
    orderUnitsTue: orderUnitsFromPacks(orderPackTue, row.unitsInPack),
    prevMon: previous ? stockAt(row, previous.mon) : '',
    soldPrevFriMon: copiedSoldFriMonPrevious || soldFriMonPrevious,
    soldFriMon: soldFriMonCurrent,
    currentMon: stockAt(row, current.mon),
  };
  const withOverrides = applyDashboardOverrides(base, row, weeks.currentStart);
  return {
    ...withOverrides,
    soldPrevMonWed: copiedSoldMonWedPrevious || withOverrides.soldPrevMonWed,
    soldPrevWedFri: copiedSoldWedFriPrevious || withOverrides.soldPrevWedFri,
    soldPrevFriMon: copiedSoldFriMonPrevious || withOverrides.soldPrevFriMon,
  };
};
