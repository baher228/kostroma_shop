export const BUSINESS_CATEGORIES = ['Хлеб', 'Молоко', 'Деликатесы', 'Сыр', 'Мороженое', 'Курица'] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];
export const DEFAULT_BUSINESS_CATEGORY: BusinessCategory = 'Молоко';

export const PRODUCT_CATEGORIES = ['Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'] as const;
export type ProductCategory = string;
export const DEFAULT_PRODUCT_CATEGORY: ProductCategory = PRODUCT_CATEGORIES[0];

export const DEFAULT_SUBCATEGORIES_BY_BUSINESS_CATEGORY: Record<BusinessCategory, readonly string[]> = {
  Хлеб: ['Хлеб', 'Выпечка', 'Лаваш'],
  Молоко: PRODUCT_CATEGORIES,
  Деликатесы: ['Колбасы', 'Мясо', 'Готовая продукция'],
  Сыр: ['Твердый сыр', 'Мягкий сыр', 'Творожный сыр'],
  Мороженое: ['Мороженое'],
  Курица: ['Курица'],
};

export type MachineNumber = 1 | 2 | 3;
export const MACHINE_NUMBERS: MachineNumber[] = [1, 2, 3];
export const ALLOWED_ORDER_WEEKDAYS = new Set([2, 4, 6]);

export type DashboardManualOrderKey = 'orderPackThu' | 'orderPackSat' | 'orderPackTue';
export type DashboardColumnKey =
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

export type DashboardTone = 'neutral' | 'order' | 'yellow' | 'green' | 'blue';
export type DashboardWeekRef = 'current' | 'previous';
export type WeekDateMap = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sun', string>>;
export type WeekSlot = keyof WeekDateMap;
export type DashboardRowValues = Record<DashboardColumnKey, string>;
export type DashboardOverrideKey = keyof DashboardRowValues;

export type DashboardColumn = {
  key: DashboardColumnKey;
  title: string;
  subtitle: string;
  kind: 'stock' | 'order' | 'metric';
  tone: DashboardTone;
  dateKind?: 'none' | 'day' | 'range';
  dateWeek?: DashboardWeekRef;
  dateDay?: WeekSlot;
  // Monday columns close the week, so they show (and read) the Monday after it.
  dateOffsetDays?: number;
  dateFrom?: WeekSlot;
  dateTo?: WeekSlot;
  dateToWeek?: DashboardWeekRef;
};

export const WEEK_DAYS = 7;
export const TWO_WEEKS_DAYS = 14;
export const MAX_ORDER_VALUE_LEN = 5;

export const DASHBOARD_COLUMNS: DashboardColumn[] = [
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
  { key: 'prevMon', title: 'Прошлый остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'previous', dateDay: 'mon', dateOffsetDays: WEEK_DAYS },
  { key: 'soldPrevFriMon', title: 'Продано на прошлой неделе', subtitle: 'Пт-Пн', kind: 'metric', tone: 'blue', dateKind: 'range', dateWeek: 'previous', dateFrom: 'fri', dateTo: 'mon', dateToWeek: 'previous' },
  { key: 'currentMon', title: 'Текущий остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'mon', dateOffsetDays: WEEK_DAYS },
  { key: 'soldFriMon', title: 'Продано', subtitle: 'Пт-Пн', kind: 'metric', tone: 'blue', dateKind: 'range', dateWeek: 'current', dateFrom: 'fri', dateTo: 'mon', dateToWeek: 'current' },
];
