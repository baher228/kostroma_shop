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
} from './dashboard-config';

type DashboardProductLike = {
  productId: string;
  unitsInPack: number | null;
  values: Record<string, string>;
  dashboardOverrides?: Record<string, string>;
};

const hasValue = (value?: string): value is string => typeof value === 'string' && value.trim() !== '';

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (raw: string): Date => {
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const addDays = (dateKey: string, days: number): string => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

const formatDateShort = (iso: string): string => {
  const [, month, day] = iso.split('-');
  return `${day}.${month}`;
};

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
  return String(Math.max(0, start + delivery - end));
};

export const computeDashboardSold = (startRaw?: string, deliveryRaw?: string, endRaw?: string): string => {
  if (!hasValue(startRaw) && !hasValue(deliveryRaw) && !hasValue(endRaw)) {
    return '';
  }
  const start = parseStockNumber(startRaw) ?? 0;
  const delivery = parseStockNumber(deliveryRaw) ?? 0;
  const end = parseStockNumber(endRaw) ?? 0;
  return String(Math.max(0, start + delivery - end));
};

export const orderUnitsFromPacks = (packsRaw: string, unitsInPack: number | null): string => {
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

const applyDashboardOverrides = <T extends DashboardProductLike>(
  base: DashboardRowValues,
  row: T,
  weekStart?: string,
): DashboardRowValues => {
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

const stockAt = <T extends DashboardProductLike>(row: T, date?: string): string =>
  date ? row.values[date] ?? '' : '';

const soldMonWedForWeek = <T extends DashboardProductLike>(
  row: T,
  week: WeekDateMap,
  previousSunday: string | undefined,
  orderPacks: (productId: string, date?: string) => string,
): string => {
  const orderTueUnits = orderUnitsFromPacks(orderPacks(row.productId, week.tue), row.unitsInPack);
  return computeDashboardSold(stockAt(row, previousSunday), orderTueUnits, stockAt(row, week.wed));
};

const soldWedFriForWeek = <T extends DashboardProductLike>(
  row: T,
  week: WeekDateMap,
  orderPacks: (productId: string, date?: string) => string,
): string => {
  const orderThuUnits = orderUnitsFromPacks(orderPacks(row.productId, week.thu), row.unitsInPack);
  return computeDashboardSold(stockAt(row, week.tue), orderThuUnits, stockAt(row, week.fri));
};

const soldFriMonForWeek = <T extends DashboardProductLike>(
  row: T,
  week: WeekDateMap,
  orderPacks: (productId: string, date?: string) => string,
): string => {
  const orderSat = week.thu ? orderPacks(row.productId, addDays(week.thu, 2)) : '';
  const orderSatUnits = orderUnitsFromPacks(orderSat, row.unitsInPack);
  return computeDashboardSold(stockAt(row, week.thu), orderSatUnits, stockAt(row, week.mon));
};

const soldValuesForWeek = <T extends DashboardProductLike>(
  row: T,
  week: WeekDateMap,
  previousSunday: string | undefined,
  orderPacks: (productId: string, date?: string) => string,
): Pick<DashboardRowValues, 'soldMonWed' | 'soldWedFri' | 'soldFriMon'> => ({
  soldMonWed: soldMonWedForWeek(row, week, previousSunday, orderPacks),
  soldWedFri: soldWedFriForWeek(row, week, orderPacks),
  soldFriMon: soldFriMonForWeek(row, week, orderPacks),
});

export type DashboardRowInput<T extends DashboardProductLike> = {
  row: T;
  weeks: DashboardWeeks;
  orderPacks: (productId: string, date?: string) => string;
};

export const buildDashboardRowValues = <T extends DashboardProductLike>({
  row,
  weeks,
  orderPacks,
}: DashboardRowInput<T>): DashboardRowValues => {
  const current = weeks.current;
  const previous = weeks.previous;
  const previousStart = weeks.previousStart;

  const previousWeekSoldValue = (key: 'soldMonWed' | 'soldWedFri' | 'soldFriMon'): string => {
    const value = previousStart ? row.dashboardOverrides?.[`${previousStart}:${key}`] : undefined;
    return hasValue(value) ? value : '';
  };

  const orderPackThu = orderPacks(row.productId, current.thu);
  const orderPackSat = current.thu ? orderPacks(row.productId, addDays(current.thu, 2)) : '';
  const orderPackTue = current.sun ? orderPacks(row.productId, addDays(current.sun, 2)) : '';

  const currentSold = soldValuesForWeek(row, current, previous?.sun, orderPacks);
  const previousWeekSunday = previous?.mon ? addDays(previous.mon, -1) : undefined;
  const previousSold = previous ? soldValuesForWeek(row, previous, previousWeekSunday, orderPacks) : null;
  const copiedSoldMonWedPrevious = previousWeekSoldValue('soldMonWed');
  const copiedSoldWedFriPrevious = previousWeekSoldValue('soldWedFri');
  const copiedSoldFriMonPrevious = previousWeekSoldValue('soldFriMon');

  const base: DashboardRowValues = {
    currentTue: stockAt(row, current.tue),
    orderPackThu,
    orderUnitsThu: orderUnitsFromPacks(orderPackThu, row.unitsInPack),
    prevWed: previous ? stockAt(row, previous.wed) : '',
    soldPrevMonWed: copiedSoldMonWedPrevious || previousSold?.soldMonWed || '',
    soldMonWed: currentSold.soldMonWed,
    currentWed: stockAt(row, current.wed),
    currentThu: stockAt(row, current.thu),
    orderPackSat,
    orderUnitsSat: orderUnitsFromPacks(orderPackSat, row.unitsInPack),
    prevFri: previous ? stockAt(row, previous.fri) : '',
    soldPrevWedFri: copiedSoldWedFriPrevious || previousSold?.soldWedFri || '',
    soldWedFri: currentSold.soldWedFri,
    currentFri: stockAt(row, current.fri),
    currentSun: stockAt(row, current.sun),
    orderPackTue,
    orderUnitsTue: orderUnitsFromPacks(orderPackTue, row.unitsInPack),
    prevMon: previous ? stockAt(row, previous.mon) : '',
    soldPrevFriMon: copiedSoldFriMonPrevious || previousSold?.soldFriMon || '',
    soldFriMon: currentSold.soldFriMon,
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
