import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { shopsApi } from '../api/shops';
import { CreateProductPayload, stockApi } from '../api/stock';
import { OrdersPanel } from '../components/OrdersPanel';
import { OrderSheetPanel } from '../components/OrderSheetPanel';
import { SupportPanel } from '../components/SupportPanel';
import { TasksPanel } from '../components/TasksPanel';
import { UsersPanel } from '../components/UsersPanel';
import { WorkerCheckInCard } from '../components/WorkerCheckInCard';
import { ProductCategory, Session, Shop, StockTable, StockTableRow } from '../types/models';
import { sortStockTableRowsLikeImage } from '../constants/productOrdering';

type ScreenTab = 'stock' | 'orders' | 'orderSheet' | 'tasks' | 'support' | 'users';

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

type DashboardSheetColumn = {
  id: string;
  weekStart: string;
  key: DashboardOverrideKey;
  title: string;
  subtitle: string;
  kind: 'stock' | 'order' | 'metric';
  tone: DashboardTone;
  dateLabel?: string;
  valueSourceWeekStart?: string;
  valueSourceKey?: DashboardOverrideKey;
};

type WeekDateMap = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sun', string>>;

type DashboardRowValues = Record<DashboardColumnKey, string>;
type DashboardOverrideKey = keyof DashboardRowValues;

type EditingCell = {
  productId: string;
  date: string;
  productName: string;
};

type StockScreenProps = {
  session: Session;
  onLogout: () => Promise<void>;
};

const PRODUCT_CATEGORIES = ['Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'] as unknown as ProductCategory[];
const DEFAULT_PRODUCT_CATEGORY: ProductCategory = PRODUCT_CATEGORIES[0];
const topInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 0;
const WEEK_DAYS = 7;
const TWO_WEEKS_DAYS = 14;
const MAX_ORDER_VALUE_LEN = 5;
// Fixed 2-week window so the rightmost Monday in the dashboard is 11.05.2026.
const DASHBOARD_WINDOW_START = '2026-04-28';

const DASHBOARD_COLUMNS: DashboardColumn[] = [
  { key: 'currentTue', title: '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u0412\u0442\u043e\u0440\u043d\u0438\u043a', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'tue' },
  { key: 'orderPackThu', title: '\u0417\u0430\u043a\u0430\u0437 \u0443\u043f\u0430\u043a\u043e\u0432\u043e\u043a \u043d\u0430 \u0447\u0435\u0442\u0432\u0435\u0440\u0433', subtitle: '\u0412\u0442\u043e\u0440\u043d\u0438\u043a', kind: 'order', tone: 'order', dateKind: 'day', dateWeek: 'current', dateDay: 'tue' },
  { key: 'orderUnitsThu', title: '\u0417\u0430\u043a\u0430\u0437 \u0448\u0442\u0443\u043a', subtitle: '', kind: 'order', tone: 'neutral', dateKind: 'none' },
  { key: 'prevWed', title: '\u041f\u0440\u043e\u0448\u043b\u044b\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u0421\u0440\u0435\u0434\u0430', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'previous', dateDay: 'wed' },
  { key: 'soldPrevMonWed', title: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e \u043d\u0430 \u043f\u0440\u043e\u0448\u043b\u043e\u0439 \u043d\u0435\u0434\u0435\u043b\u0435', subtitle: '\u041f\u043d-\u0421\u0440', kind: 'metric', tone: 'yellow', dateKind: 'range', dateWeek: 'previous', dateFrom: 'mon', dateTo: 'wed' },
  { key: 'currentWed', title: '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u0421\u0440\u0435\u0434\u0430', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'wed' },
  { key: 'soldMonWed', title: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e', subtitle: '\u041f\u043d-\u0421\u0440', kind: 'metric', tone: 'yellow', dateKind: 'range', dateWeek: 'current', dateFrom: 'mon', dateTo: 'wed' },
  { key: 'currentThu', title: '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u0427\u0435\u0442\u0432\u0435\u0440\u0433', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'thu' },
  { key: 'orderPackSat', title: '\u0417\u0430\u043a\u0430\u0437 \u0443\u043f\u0430\u043a\u043e\u0432\u043e\u043a \u043d\u0430 \u0441\u0443\u0431\u0431\u043e\u0442\u0443', subtitle: '\u0427\u0435\u0442\u0432\u0435\u0440\u0433', kind: 'order', tone: 'order', dateKind: 'day', dateWeek: 'current', dateDay: 'thu' },
  { key: 'orderUnitsSat', title: '\u0417\u0430\u043a\u0430\u0437 \u0448\u0442\u0443\u043a', subtitle: '', kind: 'order', tone: 'neutral', dateKind: 'none' },
  { key: 'prevFri', title: '\u041f\u0440\u043e\u0448\u043b\u044b\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u041f\u044f\u0442\u043d\u0438\u0446\u0430', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'previous', dateDay: 'fri' },
  { key: 'soldPrevWedFri', title: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e \u043d\u0430 \u043f\u0440\u043e\u0448\u043b\u043e\u0439 \u043d\u0435\u0434\u0435\u043b\u0435', subtitle: '\u0421\u0440-\u041f\u0442', kind: 'metric', tone: 'green', dateKind: 'range', dateWeek: 'previous', dateFrom: 'wed', dateTo: 'fri' },
  { key: 'currentFri', title: '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u041f\u044f\u0442\u043d\u0438\u0446\u0430', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'fri' },
  { key: 'soldWedFri', title: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e', subtitle: '\u0421\u0440-\u041f\u0442', kind: 'metric', tone: 'green', dateKind: 'range', dateWeek: 'current', dateFrom: 'wed', dateTo: 'fri' },
  { key: 'currentSun', title: '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u0412\u043e\u0441\u043a\u0440\u0435\u0441', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'sun' },
  { key: 'orderPackTue', title: '\u0417\u0430\u043a\u0430\u0437 \u0443\u043f\u0430\u043a\u043e\u0432\u043e\u043a \u043d\u0430 \u0432\u0442\u043e\u0440\u043d\u0438\u043a', subtitle: '\u0412\u043e\u0441\u043a\u0440\u0435\u0441', kind: 'order', tone: 'order', dateKind: 'day', dateWeek: 'current', dateDay: 'sun' },
  { key: 'orderUnitsTue', title: '\u0417\u0430\u043a\u0430\u0437 \u0448\u0442\u0443\u043a', subtitle: '', kind: 'order', tone: 'neutral', dateKind: 'none' },
  { key: 'prevMon', title: '\u041f\u0440\u043e\u0448\u043b\u044b\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u041f\u043e\u043d\u0435\u0434\u0435\u043b', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'previous', dateDay: 'mon' },
  { key: 'soldPrevFriMon', title: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e \u043d\u0430 \u043f\u0440\u043e\u0448\u043b\u043e\u0439 \u043d\u0435\u0434\u0435\u043b\u0435', subtitle: '\u041f\u0442-\u041f\u043d', kind: 'metric', tone: 'blue', dateKind: 'range', dateWeek: 'previous', dateFrom: 'fri', dateTo: 'mon', dateToWeek: 'previous' },
  { key: 'currentMon', title: '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a', subtitle: '\u041f\u043e\u043d\u0435\u0434\u0435\u043b', kind: 'stock', tone: 'neutral', dateKind: 'day', dateWeek: 'current', dateDay: 'mon' },
  { key: 'soldFriMon', title: '\u041f\u0440\u043e\u0434\u0430\u043d\u043e', subtitle: '\u041f\u0442-\u041f\u043d', kind: 'metric', tone: 'blue', dateKind: 'range', dateWeek: 'previous', dateFrom: 'fri', dateTo: 'mon', dateToWeek: 'current' },
];

const DASHBOARD_WEEK_STARTS = ['2026-04-28', '2026-05-05'] as const;

const DASHBOARD_SHEET_COLUMNS_BY_WEEK: Record<string, DashboardSheetColumn[]> = {
  '2026-04-28': [
    { id: 'w1-currentTue', weekStart: '2026-04-28', key: 'currentTue', title: 'Текущий остаток', subtitle: 'Вторник', kind: 'stock', tone: 'neutral', dateLabel: '28.04' },
    { id: 'w1-orderPackThu', weekStart: '2026-04-28', key: 'orderPackThu', title: 'Заказ упаковок на четверг', subtitle: 'Вторник', kind: 'order', tone: 'order', dateLabel: '28.04' },
    { id: 'w1-orderUnitsThu', weekStart: '2026-04-28', key: 'orderUnitsThu', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral' },
    { id: 'w1-prevWed', weekStart: '2026-04-28', key: 'prevWed', title: 'Прошлый остаток', subtitle: 'Среда', kind: 'stock', tone: 'neutral', dateLabel: '29.04' },
    { id: 'w1-soldPrevMonWed', weekStart: '2026-04-28', key: 'soldPrevMonWed', title: 'Продано на прошлой неделе', subtitle: 'Пн-Ср', kind: 'metric', tone: 'yellow', dateLabel: '27.04-29.04' },
    { id: 'w1-currentWed', weekStart: '2026-04-28', key: 'currentWed', title: 'Текущий остаток', subtitle: 'Среда', kind: 'stock', tone: 'neutral', dateLabel: '29.04' },
    { id: 'w1-soldMonWed', weekStart: '2026-04-28', key: 'soldMonWed', title: 'Продано', subtitle: 'Пн-Ср', kind: 'metric', tone: 'yellow', dateLabel: '27.04-29.04' },
    { id: 'w1-currentThu', weekStart: '2026-04-28', key: 'currentThu', title: 'Текущий остаток', subtitle: 'Четверг', kind: 'stock', tone: 'neutral', dateLabel: '30.04' },
    { id: 'w1-orderPackSat', weekStart: '2026-04-28', key: 'orderPackSat', title: 'Заказ упаковок на субботу', subtitle: 'Четверг', kind: 'order', tone: 'order', dateLabel: '30.04' },
    { id: 'w1-orderUnitsSat', weekStart: '2026-04-28', key: 'orderUnitsSat', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral' },
    { id: 'w1-prevFri', weekStart: '2026-04-28', key: 'prevFri', title: 'Прошлый остаток', subtitle: 'Пятница', kind: 'stock', tone: 'neutral', dateLabel: '01.05' },
    { id: 'w1-soldPrevWedFri', weekStart: '2026-04-28', key: 'soldPrevWedFri', title: 'Продано на прошлой неделе', subtitle: 'Ср-Пт', kind: 'metric', tone: 'green', dateLabel: '29.04-01.05' },
    { id: 'w1-currentFri', weekStart: '2026-04-28', key: 'currentFri', title: 'Текущий остаток', subtitle: 'Пятница', kind: 'stock', tone: 'neutral', dateLabel: '01.05' },
    { id: 'w1-soldWedFri', weekStart: '2026-04-28', key: 'soldWedFri', title: 'Продано', subtitle: 'Ср-Пт', kind: 'metric', tone: 'green', dateLabel: '29.04-01.05' },
    { id: 'w1-currentSun', weekStart: '2026-04-28', key: 'currentSun', title: 'Текущий остаток', subtitle: 'Воскрес', kind: 'stock', tone: 'neutral', dateLabel: '03.05' },
    { id: 'w1-orderPackTue', weekStart: '2026-04-28', key: 'orderPackTue', title: 'Заказ упаковок на вторник', subtitle: 'Воскрес', kind: 'order', tone: 'order', dateLabel: '03.05' },
    { id: 'w1-orderUnitsTue', weekStart: '2026-04-28', key: 'orderUnitsTue', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral' },
    { id: 'w1-prevMon', weekStart: '2026-04-28', key: 'prevMon', title: 'Прошлый остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateLabel: '04.05' },
    { id: 'w1-soldPrevFriMon', weekStart: '2026-04-28', key: 'soldPrevFriMon', title: 'Продано на прошлой неделе', subtitle: 'Пт-Пн', kind: 'metric', tone: 'blue', dateLabel: '01.05-04.05' },
    { id: 'w1-currentMon', weekStart: '2026-04-28', key: 'currentMon', title: 'Текущий остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateLabel: '04.05' },
  ],
  '2026-05-05': [
    { id: 'w2-currentTue', weekStart: '2026-05-05', key: 'currentTue', title: 'Текущий остаток', subtitle: 'Вторник', kind: 'stock', tone: 'neutral', dateLabel: '05.05', valueSourceWeekStart: '2026-04-28', valueSourceKey: 'currentMon' },
    { id: 'w2-soldPrevMonWed', weekStart: '2026-05-05', key: 'soldPrevMonWed', title: 'Продано на прошлой неделе', subtitle: 'Пн-Ср', kind: 'metric', tone: 'yellow', dateLabel: '04.05-06.05' },
    { id: 'w2-currentWed', weekStart: '2026-05-05', key: 'currentWed', title: 'Текущий остаток', subtitle: 'Среда', kind: 'stock', tone: 'neutral', dateLabel: '06.05' },
    { id: 'w2-soldMonWed', weekStart: '2026-05-05', key: 'soldMonWed', title: 'Продано', subtitle: 'Пн-Ср', kind: 'metric', tone: 'yellow', dateLabel: '04.05-06.05' },
    { id: 'w2-currentThu', weekStart: '2026-05-05', key: 'currentThu', title: 'Текущий остаток', subtitle: 'Четверг', kind: 'stock', tone: 'neutral', dateLabel: '07.05' },
    { id: 'w2-orderPackSat', weekStart: '2026-05-05', key: 'orderPackSat', title: 'Заказ упаковок на субботу', subtitle: 'Четверг', kind: 'order', tone: 'order', dateLabel: '07.05' },
    { id: 'w2-orderUnitsSat', weekStart: '2026-05-05', key: 'orderUnitsSat', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral' },
    { id: 'w2-prevFri', weekStart: '2026-05-05', key: 'prevFri', title: 'Прошлый остаток', subtitle: 'Пятница', kind: 'stock', tone: 'neutral', dateLabel: '08.05' },
    { id: 'w2-soldPrevWedFri', weekStart: '2026-05-05', key: 'soldPrevWedFri', title: 'Продано на прошлой неделе', subtitle: 'Ср-Пт', kind: 'metric', tone: 'green', dateLabel: '06.05-08.05' },
    { id: 'w2-currentFri', weekStart: '2026-05-05', key: 'currentFri', title: 'Текущий остаток', subtitle: 'Пятница', kind: 'stock', tone: 'neutral', dateLabel: '08.05' },
    { id: 'w2-soldWedFri', weekStart: '2026-05-05', key: 'soldWedFri', title: 'Продано', subtitle: 'Ср-Пт', kind: 'metric', tone: 'green', dateLabel: '06.05-08.05' },
    { id: 'w2-currentSun', weekStart: '2026-05-05', key: 'currentSun', title: 'Текущий остаток', subtitle: 'Воскрес', kind: 'stock', tone: 'neutral', dateLabel: '10.05' },
    { id: 'w2-orderPackTue', weekStart: '2026-05-05', key: 'orderPackTue', title: 'Заказ упаковок на вторник', subtitle: 'Воскрес', kind: 'order', tone: 'order', dateLabel: '10.05' },
    { id: 'w2-orderUnitsTue', weekStart: '2026-05-05', key: 'orderUnitsTue', title: 'Заказ штук', subtitle: '', kind: 'order', tone: 'neutral' },
    { id: 'w2-prevMon', weekStart: '2026-05-05', key: 'prevMon', title: 'Прошлый остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateLabel: '11.05' },
    { id: 'w2-soldPrevFriMon', weekStart: '2026-05-05', key: 'soldPrevFriMon', title: 'Продано на прошлой неделе', subtitle: 'Пт-Пн', kind: 'metric', tone: 'blue', dateLabel: '08.05-11.05' },
    { id: 'w2-currentMon', weekStart: '2026-05-05', key: 'currentMon', title: 'Текущий остаток', subtitle: 'Понедел', kind: 'stock', tone: 'neutral', dateLabel: '11.05' },
    { id: 'w2-soldFriMon', weekStart: '2026-05-05', key: 'soldFriMon', title: 'Продано', subtitle: 'Пт-Пн', kind: 'metric', tone: 'blue', dateLabel: '08.05-11.05' },
  ],
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Server error.');

const sanitizeStockValue = (raw: string): string => {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) {
    return '';
  }
  const parsed = Number.parseInt(digits, 10);
  if (Number.isNaN(parsed)) {
    return '';
  }
  return String(Math.min(50, Math.max(0, parsed)));
};

const sanitizeIntegerInput = (raw: string, maxLength = 6): string => raw.replace(/[^0-9]/g, '').slice(0, maxLength);

const sanitizeDecimalInput = (raw: string, decimalPlaces: number): string => {
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...fractionParts] = normalized.split('.');
  if (!fractionParts.length) {
    return whole.slice(0, 6);
  }
  return `${whole.slice(0, 6)}.${fractionParts.join('').slice(0, decimalPlaces)}`;
};

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

const formatDate = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const formatWeekday = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString('ru-RU', { weekday: 'short' });
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const startOfWeekMonday = (date: Date): Date => {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  return current;
};

const currentWeekStart = (): string => toDateKey(startOfWeekMonday(new Date()));

const shiftDateKey = (dateKey: string, deltaDays: number): string => {
  const shifted = parseDateKey(dateKey);
  shifted.setDate(shifted.getDate() + deltaDays);
  return toDateKey(shifted);
};

const getTwoWeeksEnd = (startDateKey: string): string => shiftDateKey(startDateKey, TWO_WEEKS_DAYS - 1);

const sanitizeOrderValue = (raw: string): string => raw.replace(/[^0-9]/g, '').slice(0, MAX_ORDER_VALUE_LEN);
const orderUnitsFromPacks = (packsRaw: string, unitsInPack: number | null): string => {
  if (!packsRaw) {
    return '';
  }
  if (unitsInPack === null || unitsInPack <= 0) {
    return '';
  }
  const packs = Number.parseInt(packsRaw, 10);
  return Number.isNaN(packs) ? '' : String(packs * unitsInPack);
};
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
  if (start === null || end === null) {
    return '';
  }
  return String(start - end);
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

const formatOptionalPrice = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return `${parsed.toFixed(2)} руб`;
};

const weekdaySlot = (dateKey: string): keyof WeekDateMap | null => {
  const day = parseDateKey(dateKey).getDay();
  if (day === 1) {
    return 'mon';
  }
  if (day === 2) {
    return 'tue';
  }
  if (day === 3) {
    return 'wed';
  }
  if (day === 4) {
    return 'thu';
  }
  if (day === 5) {
    return 'fri';
  }
  if (day === 0) {
    return 'sun';
  }
  return null;
};

const splitWeeks = (dates: string[]): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) {
    const chunk = dates.slice(i, i + 7);
    if (chunk.length === 7) {
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

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const buildCsv = (rows: string[][]): string => rows.map((row) => row.map((item) => csvEscape(item)).join(';')).join('\n');

const safeFileName = (raw: string): string => raw.replace(/[\\/:*?"<>|]/g, '_');

const applyDashboardOverrides = (
  base: DashboardRowValues,
  row: StockTableRow,
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

const dashboardSheetValue = (row: StockTableRow, column: DashboardSheetColumn): string => {
  const sourceWeekStart = column.valueSourceWeekStart ?? column.weekStart;
  const sourceKey = column.valueSourceKey ?? column.key;
  return row.dashboardOverrides?.[`${sourceWeekStart}:${sourceKey}`] ?? '';
};

const createCategoryMap = (): Record<ProductCategory, StockTableRow[]> =>
  PRODUCT_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = [];
      return acc;
    },
    {} as Record<ProductCategory, StockTableRow[]>,
  );

export const StockScreen = ({ session, onLogout }: StockScreenProps) => {
  const canManage = session.user.role === 'manager';

  const [activeTab, setActiveTab] = useState<ScreenTab>('stock');
  const [table, setTable] = useState<StockTable | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(session.user.shopId ?? null);
  const [managerWindowStart, setManagerWindowStart] = useState<string>(DASHBOARD_WINDOW_START);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dashboardOrderValues, setDashboardOrderValues] = useState<Record<string, string>>({});
  const [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({});
  const [isShopPickerOpen, setIsShopPickerOpen] = useState(false);

  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<ProductCategory | null>(null);
  const [newProductPackType, setNewProductPackType] = useState('');
  const [newProductUnitsInPack, setNewProductUnitsInPack] = useState('');
  const [newProductPackWeightKg, setNewProductPackWeightKg] = useState('');
  const [newProductShelfLifeDays, setNewProductShelfLifeDays] = useState('');
  const [newProductUnitPriceRubVat, setNewProductUnitPriceRubVat] = useState('');
  const [newProductMinStockUnits, setNewProductMinStockUnits] = useState('');
  const [newProductMaxStockUnits, setNewProductMaxStockUnits] = useState('');
  const [addingProduct, setAddingProduct] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!canManage && activeTab === 'users') {
      setActiveTab('stock');
    }
  }, [activeTab, canManage]);

  useEffect(() => {
    if (canManage && activeTab === 'orders') {
      setActiveTab('orderSheet');
    }
  }, [activeTab, canManage]);

  const setPending = (key: string, value: boolean) => {
    setPendingKeys((current) => ({ ...current, [key]: value }));
  };

  const checkForAppUpdate = async () => {
    if (Platform.OS === 'web' || !Updates.isEnabled) {
      Alert.alert('Обновления приложения', 'OTA-обновления доступны только в установленном приложении.');
      return;
    }

    try {
      setCheckingUpdate(true);
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        Alert.alert('Обновления приложения', 'Установлена последняя версия.');
        return;
      }

      await Updates.fetchUpdateAsync();
      Alert.alert('Обновление готово', 'Перезапустить приложение, чтобы применить обновление?', [
        { text: 'Позже', style: 'cancel' },
        { text: 'Перезапустить', onPress: () => void Updates.reloadAsync() },
      ]);
    } catch (updateError) {
      Alert.alert('Не удалось проверить обновление', errorMessage(updateError));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const loadShops = async () => {
    try {
      const nextShops = await shopsApi.list(session.token);
      setShops(nextShops);
      if (canManage && nextShops.length > 0 && !selectedShopId) {
        setSelectedShopId(nextShops[0].id);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

  const loadTable = async () => {
    try {
      setLoading(true);
      setError('');
      const dashboardFrom = shiftDateKey(managerWindowStart, -WEEK_DAYS);
      const dashboardTo = getTwoWeeksEnd(dashboardFrom);
      const from = canManage ? dashboardFrom : undefined;
      const to = canManage ? dashboardTo : undefined;
      const nextTable = await stockApi.list(session.token, {
        shopId: canManage ? selectedShopId ?? undefined : undefined,
        from,
        to,
        range: canManage ? undefined : 'week',
      });
      setTable(nextTable);
      if (!selectedShopId) {
        setSelectedShopId(nextTable.shop.id);
      }
      if (canManage && from && to) {
        const targetShopId = selectedShopId ?? nextTable.shop.id;
        if (targetShopId) {
          try {
            const orderValues = await stockApi.listShopOrderValues(session.token, targetShopId, from, to);
            const loaded: Record<string, string> = {};
            for (const entry of orderValues) {
              loaded[`${entry.productId}:${entry.orderDate}`] = String(entry.packs);
            }
            setDashboardOrderValues(loaded);
          } catch {
            setDashboardOrderValues({});
          }
        }
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShops();
  }, [session.token]);

  useEffect(() => {
    if (canManage && !selectedShopId && shops.length > 0) {
      return;
    }
    void loadTable();
  }, [session.token, canManage, selectedShopId, managerWindowStart]);

  const visibleRows = useMemo(() => {
    if (!table) {
      return [];
    }
    const normalizedQuery = normalizeText(query);
    let nextRows = table.rows;

    if (normalizedQuery) {
      nextRows = nextRows.filter((row) => normalizeText(row.name).includes(normalizedQuery));
    }
    return nextRows;
  }, [table, query]);

  const rowsByCategory = useMemo(() => {
    const grouped = createCategoryMap();
    for (const row of visibleRows) {
      const category = PRODUCT_CATEGORIES.includes(row.category) ? row.category : DEFAULT_PRODUCT_CATEGORY;
      grouped[category].push(row);
    }
    for (const category of PRODUCT_CATEGORIES) {
      grouped[category] = sortStockTableRowsLikeImage(grouped[category]);
    }
    return grouped;
  }, [visibleRows]);

  const orderedRows = useMemo(
    () => PRODUCT_CATEGORIES.flatMap((category) => rowsByCategory[category]),
    [rowsByCategory],
  );

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
      return {
        current: mapWeekDates(table.dates),
        previous: null,
        currentStart: table.dates[0],
        previousStart: undefined,
      };
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

  const dashboardDateFor = (week: DashboardWeekRef, slot: WeekSlot): string | undefined => {
    if (week === 'previous') {
      return dashboardWeeks.previous?.[slot];
    }
    return dashboardWeeks.current[slot];
  };

  const dashboardRangeLabel = (
    week: DashboardWeekRef,
    from: WeekSlot,
    to: WeekSlot,
    toWeek?: DashboardWeekRef,
  ): string => {
    const fromDate = dashboardDateFor(week, from);
    const toDate = dashboardDateFor(toWeek ?? week, to);
    if (!fromDate || !toDate) {
      return '';
    }
    return `${formatDate(fromDate)}-${formatDate(toDate)}`;
  };

  const dashboardHeaderSubtitle = (column: DashboardColumn): string => {
    if (!column.subtitle) {
      return '';
    }

    if (column.dateKind === 'day' && column.dateDay && column.dateWeek) {
      const date = dashboardDateFor(column.dateWeek, column.dateDay);
      return date ? `${column.subtitle}\n${formatDate(date)}` : column.subtitle;
    }

    if (column.dateKind === 'range' && column.dateWeek && column.dateFrom && column.dateTo) {
      const range = dashboardRangeLabel(column.dateWeek, column.dateFrom, column.dateTo, column.dateToWeek);
      return range ? `${column.subtitle}\n${range}` : column.subtitle;
    }

    return column.subtitle;
  };

  const productReferenceLabel = (row: StockTableRow): string => {
    const parts: string[] = [];
    if (row.packType) {
      parts.push(row.packType);
    }
    const units = typeof row.unitsInPack === 'number' ? row.unitsInPack : Number(row.unitsInPack);
    if (Number.isFinite(units)) {
      parts.push(`${units} шт/уп`);
    }
    const packWeight = Number(row.packWeightKg);
    if (Number.isFinite(packWeight)) {
      parts.push(`${packWeight} кг`);
    }
    const shelfLife = typeof row.shelfLifeDays === 'number' ? row.shelfLifeDays : Number(row.shelfLifeDays);
    if (Number.isFinite(shelfLife)) {
      parts.push(`${shelfLife} сут`);
    }
    const priceLabel = formatOptionalPrice(row.unitPriceRubVat);
    if (priceLabel) {
      parts.push(priceLabel);
    }
    if (row.minStockUnits !== null || row.maxStockUnits !== null) {
      parts.push(`границы: ${row.minStockUnits ?? '-'}-${row.maxStockUnits ?? '-'}`);
    }
    return parts.join(' · ');
  };

  const currentStockDateForColumn = (key: DashboardColumnKey): string | undefined => {
    if (key === 'currentTue') {
      return dashboardWeeks.current.tue;
    }
    if (key === 'currentWed') {
      return dashboardWeeks.current.wed;
    }
    if (key === 'currentThu') {
      return dashboardWeeks.current.thu;
    }
    if (key === 'currentFri') {
      return dashboardWeeks.current.fri;
    }
    if (key === 'currentSun') {
      return dashboardWeeks.current.sun;
    }
    if (key === 'currentMon') {
      return dashboardWeeks.current.mon;
    }
    return undefined;
  };

  const orderDateForKey = (key: DashboardManualOrderKey): string | undefined => {
    if (key === 'orderPackThu') return dashboardWeeks.current.thu;
    if (key === 'orderPackSat') {
      return dashboardWeeks.current.thu ? shiftDateKey(dashboardWeeks.current.thu, 2) : undefined;
    }
    if (key === 'orderPackTue') {
      return dashboardWeeks.current.sun ? shiftDateKey(dashboardWeeks.current.sun, 2) : undefined;
    }
    return undefined;
  };

  const orderCellValue = (productId: string, key: DashboardManualOrderKey): string => {
    const date = orderDateForKey(key);
    if (!date) return '';
    return dashboardOrderValues[`${productId}:${date}`] ?? '';
  };

  const setOrderCellValue = (productId: string, key: DashboardManualOrderKey, value: string) => {
    const date = orderDateForKey(key);
    const shopId = selectedShopId;
    if (!date || !shopId) return;
    const nextValue = sanitizeOrderValue(value);
    const fieldKey = `${productId}:${date}`;
    setDashboardOrderValues((current) => ({
      ...current,
      [fieldKey]: nextValue,
    }));
    const packs = nextValue ? Number.parseInt(nextValue, 10) : 0;
    void stockApi.updateOrderValue(session.token, {
      shopId,
      productId,
      orderDate: date,
      packs: Number.isNaN(packs) ? 0 : packs,
    });
  };

  const orderPacksForDate = (productId: string, date?: string): string => {
    if (!date) return '';
    return dashboardOrderValues[`${productId}:${date}`] ?? '';
  };

  const dashboardRowValues = (row: StockTableRow): DashboardRowValues => {
    const current = dashboardWeeks.current;
    const previous = dashboardWeeks.previous;
    const previousStart = dashboardWeeks.previousStart;
    const stock = (date?: string) => (date ? row.values[date] ?? '' : '');
    const units = row.unitsInPack;
    const previousWeekSoldValue = (key: 'soldMonWed' | 'soldWedFri' | 'soldFriMon'): string => {
      const value = previousStart ? row.dashboardOverrides?.[`${previousStart}:${key}`] : undefined;
      return hasValue(value) ? value : '';
    };

    // Excel formula: ÐŸÑ€Ð¾Ð´Ð°Ð½Ð¾ = start_stock + delivery_units - end_stock
    // soldMonWed: period Monâ†’Wed, start=Sun, delivery=orderTue (placed prev Sun)
    const prevOrderTueUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, current.tue), units);
    const soldMonWedCurrent = computeSold(stock(previous?.sun), prevOrderTueUnits, stock(current.wed));
    // soldWedFri: period Wedâ†’Fri, start=Tue, delivery=orderThu (placed current Tue)
    const curOrderThuUnits = orderUnitsFromPacks(orderPacksForDate(row.productId, current.thu), units);
    const soldWedFriCurrent = computeSold(stock(current.tue), curOrderThuUnits, stock(current.fri));
    // soldFriMon: period Friâ†’Mon, start=Thu, delivery=orderSat (placed prev Thu)
    const prevOrderSatUnits = previous?.thu
      ? orderUnitsFromPacks(orderPacksForDate(row.productId, shiftDateKey(previous.thu, 2)), units)
      : '';
    const soldFriMonCurrent = computeSold(stock(previous?.thu), prevOrderSatUnits, stock(current.mon));

    // Previous week sold: same formula structure but some start dates unavailable (before 14-day window)
    // soldPrevMonWed: start=Sun before prev.mon (unavailable), fallback to simple diff
    const soldMonWedPrevious = previous ? diffStocks(stock(previous.mon), stock(previous.wed)) : '';
    // soldPrevWedFri: start=prev.tue, delivery=orderThu placed on prev.tue
    const prevOrderThuUnits = previous?.thu
      ? orderUnitsFromPacks(orderPacksForDate(row.productId, previous.thu), units)
      : '';
    const soldWedFriPrevious = previous ? computeSold(stock(previous.tue), prevOrderThuUnits, stock(previous.fri)) : '';
    // soldPrevFriMon: period prev.friâ†’current.mon, start=prev.thu, delivery=orderSat placed prev.thu
    const prevPrevOrderSatUnits = previous?.thu
      ? orderUnitsFromPacks(orderPacksForDate(row.productId, shiftDateKey(previous.thu, 2)), units)
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
      orderUnitsThu: orderUnitsFromPacks(orderPackThu, units),
      prevWed: previous ? stock(previous.wed) : '',
      soldPrevMonWed: copiedSoldMonWedPrevious || soldMonWedPrevious,
      soldMonWed: soldMonWedCurrent,
      currentWed: stock(current.wed),
      currentThu: stock(current.thu),
      orderPackSat,
      orderUnitsSat: orderUnitsFromPacks(orderPackSat, units),
      prevFri: previous ? stock(previous.fri) : '',
      soldPrevWedFri: copiedSoldWedFriPrevious || soldWedFriPrevious,
      soldWedFri: soldWedFriCurrent,
      currentFri: stock(current.fri),
      currentSun: stock(current.sun),
      orderPackTue,
      orderUnitsTue: orderUnitsFromPacks(orderPackTue, units),
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

  const exportDashboard = async () => {
    if (!table) {
      return;
    }

    const headerRow = [
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
    const dataRows = orderedRows.map((row) => {
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

    const csv = `\uFEFF${buildCsv([headerRow, ...dataRows])}`;
    const fileName = safeFileName(`manager_dashboard_${table.shop.name}_${table.from}_${table.to}.csv`);

    if (Platform.OS === 'web') {
      const browser = globalThis as typeof globalThis & {
        Blob?: new (parts?: BlobPart[], options?: BlobPropertyBag) => Blob;
        URL?: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
        document?: {
          createElement: (tag: string) => { href: string; download: string; click: () => void };
          body?: { appendChild: (node: unknown) => void; removeChild: (node: unknown) => void };
        };
      };

      if (browser.Blob && browser.URL && browser.document?.createElement) {
        const blob = new browser.Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const objectUrl = browser.URL.createObjectURL(blob);
        const link = browser.document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        browser.document.body?.appendChild(link);
        link.click();
        browser.document.body?.removeChild(link);
        browser.URL.revokeObjectURL(objectUrl);
        return;
      }
    }

    await Share.share({
      title: fileName,
      message: csv,
    });
  };

  const columnToneHeader = (date: string) => {
    if (!table) {
      return styles.headerToneA;
    }
    return table.dates.indexOf(date) % 2 === 0 ? styles.headerToneA : styles.headerToneB;
  };

  const columnToneValue = (date: string) => {
    if (!table) {
      return styles.valueToneA;
    }
    return table.dates.indexOf(date) % 2 === 0 ? styles.valueToneA : styles.valueToneB;
  };

  const secondWeekBoundaryStyle = (date: string) =>
    table && table.dates.indexOf(date) === 7 ? styles.secondWeekBoundary : null;

  const openEditCell = (row: StockTableRow, date: string) => {
    setEditingCell({
      productId: row.productId,
      date,
      productName: row.name,
    });
    setEditingValue(row.values[date] ?? '');
  };

  const getNextRow = (productId: string): StockTableRow | null => {
    const currentIndex = orderedRows.findIndex((row) => row.productId === productId);
    if (currentIndex < 0 || currentIndex + 1 >= orderedRows.length) {
      return null;
    }
    return orderedRows[currentIndex + 1];
  };

  const saveCell = async (continueToNext: boolean) => {
    if (!editingCell || !table) {
      return;
    }

    const currentCell = editingCell;
    const key = `${currentCell.productId}:${currentCell.date}`;
    const nextValue = sanitizeStockValue(editingValue);
    const nextRow = continueToNext ? getNextRow(currentCell.productId) : null;

    try {
      setSavingEdit(true);
      setPending(key, true);
      await stockApi.updateValue(session.token, {
        shopId: canManage ? selectedShopId ?? table.shop.id : undefined,
        productId: currentCell.productId,
        date: currentCell.date,
        value: nextValue,
      });

      setTable((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          rows: current.rows.map((row) =>
            row.productId === currentCell.productId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    [currentCell.date]: nextValue,
                  },
                }
              : row,
          ),
        };
      });

      if (continueToNext && nextRow) {
        setEditingCell({
          productId: nextRow.productId,
          date: currentCell.date,
          productName: nextRow.name,
        });
        setEditingValue(nextRow.values[currentCell.date] ?? '');
      } else {
        setEditingCell(null);
      }
      setError('');
    } catch (saveError) {
      setError(errorMessage(saveError));
      await loadTable();
    } finally {
      setPending(key, false);
      setSavingEdit(false);
    }
  };

  const resetProductForm = () => {
    setNewProductName('');
    setNewProductCategory(null);
    setNewProductPackType('');
    setNewProductUnitsInPack('');
    setNewProductPackWeightKg('');
    setNewProductShelfLifeDays('');
    setNewProductUnitPriceRubVat('');
    setNewProductMinStockUnits('');
    setNewProductMaxStockUnits('');
  };

  const parseRequiredInteger = (label: string, raw: string, allowZero = false): number => {
    const parsed = Number.parseInt(raw.trim(), 10);
    const valid = Number.isInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
    if (!valid) {
      throw new Error(`${label}: введите ${allowZero ? '0 или больше' : 'число больше 0'}.`);
    }
    return parsed;
  };

  const parseRequiredDecimal = (label: string, raw: string, allowZero = false): number => {
    const parsed = Number.parseFloat(raw.trim().replace(',', '.'));
    const valid = Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
    if (!valid) {
      throw new Error(`${label}: введите ${allowZero ? '0 или больше' : 'число больше 0'}.`);
    }
    return parsed;
  };

  const buildNewProductPayload = (): CreateProductPayload => {
    const normalizedName = newProductName.trim();
    const packType = newProductPackType.trim();
    if (!normalizedName) {
      throw new Error('Введите название товара.');
    }
    if (!newProductCategory) {
      throw new Error('Выберите категорию товара.');
    }
    if (!packType) {
      throw new Error('Введите тип упаковки.');
    }

    const minStockUnits = parseRequiredInteger('Минимальный остаток', newProductMinStockUnits, true);
    const maxStockUnits = parseRequiredInteger('Максимальный остаток', newProductMaxStockUnits, true);
    if (minStockUnits > maxStockUnits) {
      throw new Error('Минимальный остаток не может быть больше максимального.');
    }

    return {
      name: normalizedName,
      category: newProductCategory,
      packType,
      unitsInPack: parseRequiredInteger('Штук в упаковке', newProductUnitsInPack),
      packWeightKg: parseRequiredDecimal('Вес упаковки, кг', newProductPackWeightKg),
      shelfLifeDays: parseRequiredInteger('Срок годности, дней', newProductShelfLifeDays),
      unitPriceRubVat: parseRequiredDecimal('Цена с НДС, руб', newProductUnitPriceRubVat, true),
      minStockUnits,
      maxStockUnits,
    };
  };

  const addProduct = async () => {
    if (!canManage) {
      return;
    }
    let payload: CreateProductPayload;
    try {
      payload = buildNewProductPayload();
    } catch (validationError) {
      Alert.alert('Новый товар', errorMessage(validationError));
      return;
    }
    try {
      setAddingProduct(true);
      await stockApi.createProduct(session.token, payload);
      resetProductForm();
      setIsAddProductModalOpen(false);
      await loadTable();
      setError('');
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setAddingProduct(false);
    }
  };

  const removeProduct = (productId: string) => {
    if (!canManage) {
      return;
    }
    Alert.alert('Удалить товар?', 'Эта строка товара будет удалена.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await stockApi.deleteProduct(session.token, productId);
            setTable((current) =>
              current
                ? {
                    ...current,
                    rows: current.rows.filter((row) => row.productId !== productId),
                  }
                : current,
            );
            setError('');
          } catch (removeError) {
            setError(errorMessage(removeError));
          }
        },
      },
    ]);
  };

  const renderCategoryTable = (category: ProductCategory, rows: StockTableRow[]) => (
    <View key={category} style={styles.categoryBlock}>
      <View style={styles.categoryTitleRow}>
        <Text style={styles.categoryTitle}>{category}</Text>
      </View>
      <View style={styles.categoryTable}>
        <View style={styles.stickyColumn}>
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.nameColumn]}>
              <Text style={styles.headerText}>Товар</Text>
            </View>
          </View>
          {rows.map((row) => (
            <View key={row.productId} style={styles.row}>
              <View style={[styles.cell, styles.nameColumn, styles.nameCell]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nameScroll}>
                  <Text numberOfLines={1} style={styles.nameText}>
                    {row.name}
                  </Text>
                </ScrollView>
              </View>
            </View>
          ))}
        </View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.scrollableColumns}>
          <View>
            <View style={styles.headerRow}>
              {table?.dates.map((date) => (
                <View
                  key={date}
                  style={[
                    styles.headerCell,
                    styles.dateColumn,
                    columnToneHeader(date),
                    secondWeekBoundaryStyle(date),
                  ]}
                >
                  <Text style={styles.dateWeekdayText}>{formatWeekday(date)}</Text>
                  <Text style={styles.dateDayText}>{formatDate(date)}</Text>
                </View>
              ))}
            </View>

            {rows.length === 0 ? (
              <View style={[styles.emptyRow, styles.emptyScrollableRow]}>
                <Text style={styles.emptyRowText}>Нет товаров в этой таблице</Text>
              </View>
            ) : (
              rows.map((row) => (
              <View key={row.productId} style={styles.row}>
                {table?.dates.map((date) => {
                  const key = `${row.productId}:${date}`;
                  const pending = pendingKeys[key];
                  const value = row.values[date] ?? '';

                  return (
                    <Pressable
                      key={date}
                      style={[
                        styles.cell,
                        styles.dateColumn,
                        styles.valueCell,
                        columnToneValue(date),
                        secondWeekBoundaryStyle(date),
                        pending && styles.pendingCell,
                      ]}
                      onPress={() => openEditCell(row, date)}
                    >
                      <Text style={styles.valueText}>{value || '-'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );

  const dashboardHeaderToneStyle = (tone: DashboardTone) => {
    if (tone === 'order') {
      return styles.dashboardHeaderOrder;
    }
    if (tone === 'yellow') {
      return styles.dashboardHeaderYellow;
    }
    if (tone === 'green') {
      return styles.dashboardHeaderGreen;
    }
    if (tone === 'blue') {
      return styles.dashboardHeaderBlue;
    }
    return styles.dashboardHeaderNeutral;
  };

  const dashboardValueToneStyle = (tone: DashboardTone) => {
    if (tone === 'order') {
      return styles.dashboardValueOrder;
    }
    if (tone === 'yellow') {
      return styles.dashboardValueYellow;
    }
    if (tone === 'green') {
      return styles.dashboardValueGreen;
    }
    if (tone === 'blue') {
      return styles.dashboardValueBlue;
    }
    return styles.dashboardValueNeutral;
  };

  const dashboardColumnStyle = (column: DashboardColumn) => {
    if (column.kind === 'order') {
      return styles.dashboardOrderColumn;
    }
    if (column.kind === 'metric') {
      return styles.dashboardMetricColumn;
    }
    return styles.dashboardStockColumn;
  };

  const dashboardHeaderTitleStyle = (column: DashboardColumn) => [
    styles.dashboardHeaderTitle,
    column.kind === 'stock' && styles.dashboardHeaderTitleStock,
    column.kind === 'order' && !dashboardHeaderSubtitle(column) && styles.dashboardHeaderTitleExpanded,
  ];

  const dashboardHeaderSubtitleStyle = (column: DashboardColumn) => [
    styles.dashboardHeaderSubtitle,
    column.kind === 'stock' && styles.dashboardHeaderSubtitleStock,
    !dashboardHeaderSubtitle(column) && styles.dashboardHeaderSubtitleHidden,
  ];

  const dashboardValueTextStyle = (column: DashboardColumn) => [
    styles.valueText,
    column.kind === 'stock' && styles.valueTextStock,
    column.kind === 'order' && styles.valueTextOrder,
  ];

  const renderDashboardCategoryTable = (category: ProductCategory, rows: StockTableRow[]) => (
    <View key={category} style={styles.categoryBlock}>
      <View style={styles.categoryTitleRow}>
        <Text style={styles.categoryTitle}>{category}</Text>
      </View>
      <View style={styles.categoryTable}>
        <View style={styles.stickyColumn}>
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.nameColumn, styles.dashboardNameHeader]}>
              <Text style={styles.headerText}>Товар</Text>
            </View>
          </View>
          {rows.map((row) => {
            const reference = productReferenceLabel(row);
            return (
              <View key={row.productId} style={[styles.row, styles.dashboardDataRow]}>
                <View style={[styles.cell, styles.nameColumn, styles.nameCell, styles.dashboardNameCell]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nameScroll}>
                    <Text numberOfLines={1} style={styles.nameText}>
                      {row.name}
                    </Text>
                  </ScrollView>
                  {!!reference && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nameScroll}>
                      <Text numberOfLines={1} style={styles.referenceText}>
                        {reference}
                      </Text>
                    </ScrollView>
                  )}
                </View>
              </View>
            );
          })}
        </View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.scrollableColumns}>
          <View>
            <View style={styles.headerRow}>
              {DASHBOARD_COLUMNS.map((column) => (
                <View
                  key={column.key}
                  style={[
                    styles.headerCell,
                    styles.dashboardHeaderCell,
                    dashboardColumnStyle(column),
                    dashboardHeaderToneStyle(column.tone),
                  ]}
                >
                  <Text style={dashboardHeaderTitleStyle(column)}>{column.title}</Text>
                  <Text style={dashboardHeaderSubtitleStyle(column)}>{dashboardHeaderSubtitle(column)}</Text>
                </View>
              ))}
            </View>

            {rows.length === 0 ? (
              <View style={[styles.emptyRow, styles.emptyScrollableRow]}>
                <Text style={styles.emptyRowText}>Нет товаров в этой таблице</Text>
              </View>
            ) : (
              rows.map((row) => {
              const values = dashboardRowValues(row);
              return (
                <View key={row.productId} style={[styles.row, styles.dashboardDataRow]}>
                  {DASHBOARD_COLUMNS.map((column) => {
                    const value = values[column.key] ?? '';
                    if (column.kind === 'order' && isManualOrderKey(column.key)) {
                      const manualOrderKey = column.key;
                      return (
                        <View
                          key={column.key}
                          style={[
                            styles.cell,
                            styles.dashboardValueCell,
                            dashboardColumnStyle(column),
                            dashboardValueToneStyle(column.tone),
                          ]}
                        >
                          <TextInput
                            value={value}
                            onChangeText={(nextValue) => setOrderCellValue(row.productId, manualOrderKey, nextValue)}
                            keyboardType="number-pad"
                            style={[styles.dashboardOrderInput, styles.dashboardOrderInputExpanded]}
                            maxLength={MAX_ORDER_VALUE_LEN}
                            placeholder="-"
                            placeholderTextColor="#6d7d72"
                          />
                        </View>
                      );
                    }

                    if (column.kind === 'stock' && isManualStockKey(column.key)) {
                      const date = currentStockDateForColumn(column.key);
                      const pending = date ? pendingKeys[`${row.productId}:${date}`] : false;

                      return (
                        <Pressable
                          key={column.key}
                          style={[
                            styles.cell,
                            styles.dashboardValueCell,
                            dashboardColumnStyle(column),
                            dashboardValueToneStyle(column.tone),
                            pending && styles.pendingCell,
                          ]}
                          onPress={() => {
                            if (date) {
                              openEditCell(row, date);
                            }
                          }}
                        >
                          <Text style={dashboardValueTextStyle(column)}>{value || '-'}</Text>
                        </Pressable>
                      );
                    }

                    return (
                      <View
                        key={column.key}
                        style={[
                          styles.cell,
                          styles.dashboardValueCell,
                          dashboardColumnStyle(column),
                          dashboardValueToneStyle(column.tone),
                        ]}
                      >
                        <Text style={dashboardValueTextStyle(column)}>{value || '-'}</Text>
                      </View>
                    );
                  })}
                </View>
              );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );

  const renderStockTab = () => (
    <>
      {!canManage && <WorkerCheckInCard token={session.token} />}
      <View style={styles.controls}>
        <View style={styles.controlButtons}>
          {canManage && (
            <>
              <View style={styles.rangeButtons}>
                <Pressable
                  style={styles.calendarNavButton}
                  onPress={() => setManagerWindowStart((current) => shiftDateKey(current, -WEEK_DAYS))}
                >
                  <Text style={styles.calendarNavButtonText}>-1 нед.</Text>
                </Pressable>
                <Pressable style={styles.calendarNavButton} onPress={() => setManagerWindowStart(DASHBOARD_WINDOW_START)}>
                  <Text style={styles.calendarNavButtonText}>Текущая нед.</Text>
                </Pressable>
                <Pressable
                  style={styles.calendarNavButton}
                  onPress={() => setManagerWindowStart((current) => shiftDateKey(current, WEEK_DAYS))}
                >
                  <Text style={styles.calendarNavButtonText}>+1 нед.</Text>
                </Pressable>
              </View>
              <Pressable style={styles.primaryButton} onPress={() => setIsAddProductModalOpen(true)}>
                <Text style={styles.primaryButtonText}>Добавить товар</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void exportDashboard()}>
                <Text style={styles.secondaryButtonText}>Экспорт в Excel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.tableWrap}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tableVerticalContent}>
          {PRODUCT_CATEGORIES.map((category) =>
            canManage
              ? renderDashboardCategoryTable(category, rowsByCategory[category])
              : renderCategoryTable(category, rowsByCategory[category]),
          )}
        </ScrollView>
      </View>
    </>
  );

  const renderContent = () => {
    if (activeTab === 'tasks') {
      return (
        <View style={styles.tabContentWrap}>
          <TasksPanel session={session} fullHeight />
        </View>
      );
    }
    if (activeTab === 'orders') {
      return (
        <View style={styles.tabContentWrap}>
          <OrdersPanel session={session} />
        </View>
      );
    }
    if (activeTab === 'orderSheet') {
      return (
        <View style={styles.tabContentWrap}>
          <OrderSheetPanel session={session} />
        </View>
      );
    }
    if (activeTab === 'support') {
      return (
        <View style={styles.tabContentWrap}>
          <SupportPanel session={session} />
        </View>
      );
    }
    if (activeTab === 'users') {
      return (
        <View style={styles.tabContentWrap}>
          <UsersPanel session={session} />
        </View>
      );
    }
    return renderStockTab();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2f6f4f" />
        <Text style={styles.loadingText}>Загрузка данных склада...</Text>
      </SafeAreaView>
    );
  }

  const tabs: Array<{ key: ScreenTab; label: string }> = canManage
    ? [
        { key: 'stock', label: 'Остатки' },
        { key: 'orderSheet', label: 'Заказ' },
        { key: 'tasks', label: 'Задачи' },
        { key: 'support', label: 'Поддержка' },
        { key: 'users', label: 'Пользователи' },
      ]
    : [
        { key: 'stock', label: 'Остатки' },
        { key: 'orders', label: 'Заказы' },
        { key: 'tasks', label: 'Задачи' },
        { key: 'support', label: 'Поддержка' },
      ];

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Учет остатков</Text>
          <Text style={styles.subtitle}>
            {session.user.fullName} · {canManage ? 'Менеджер' : 'Сотрудник'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.updateButton, checkingUpdate && styles.buttonDisabled]}
            onPress={() => void checkForAppUpdate()}
            disabled={checkingUpdate}
          >
            <Text style={styles.updateButtonText}>{checkingUpdate ? 'Проверка...' : 'Обновить'}</Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>Выйти</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.contentWrap}>{renderContent()}</View>

      <View style={styles.bottomTabs}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.bottomTabButton, active && styles.bottomTabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.bottomTabButtonText, active && styles.bottomTabButtonTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={isAddProductModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddProductModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Новый товар</Text>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>Название</Text>
              <TextInput
                value={newProductName}
                onChangeText={setNewProductName}
                style={styles.modalInput}
                placeholder="Введите название товара"
                placeholderTextColor="#7a8b7f"
                autoFocus
                maxLength={140}
              />
              <Text style={styles.formLabel}>Категория *</Text>
              <View style={styles.categoryPicker}>
                {PRODUCT_CATEGORIES.map((category) => {
                  const active = newProductCategory === category;
                  return (
                    <Pressable
                      key={category}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                      onPress={() => setNewProductCategory(category)}
                    >
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{category}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.formLabel}>Тип упаковки</Text>
              <TextInput
                value={newProductPackType}
                onChangeText={setNewProductPackType}
                style={styles.modalInput}
                placeholder="ПЭТ, стакан, коробка..."
                placeholderTextColor="#7a8b7f"
                maxLength={40}
              />
              <View style={styles.productFieldsGrid}>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Штук в упаковке</Text>
                  <TextInput
                    value={newProductUnitsInPack}
                    onChangeText={(value) => setNewProductUnitsInPack(sanitizeIntegerInput(value, 4))}
                    style={styles.modalInput}
                    placeholder="6"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Вес упаковки, кг</Text>
                  <TextInput
                    value={newProductPackWeightKg}
                    onChangeText={(value) => setNewProductPackWeightKg(sanitizeDecimalInput(value, 3))}
                    style={styles.modalInput}
                    placeholder="2.88"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Срок годности, дней</Text>
                  <TextInput
                    value={newProductShelfLifeDays}
                    onChangeText={(value) => setNewProductShelfLifeDays(sanitizeIntegerInput(value, 4))}
                    style={styles.modalInput}
                    placeholder="14"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Цена с НДС, руб</Text>
                  <TextInput
                    value={newProductUnitPriceRubVat}
                    onChangeText={(value) => setNewProductUnitPriceRubVat(sanitizeDecimalInput(value, 2))}
                    style={styles.modalInput}
                    placeholder="68.61"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Минимальный остаток</Text>
                  <TextInput
                    value={newProductMinStockUnits}
                    onChangeText={(value) => setNewProductMinStockUnits(sanitizeIntegerInput(value))}
                    style={styles.modalInput}
                    placeholder="0"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.productField}>
                  <Text style={styles.formLabel}>Максимальный остаток</Text>
                  <TextInput
                    value={newProductMaxStockUnits}
                    onChangeText={(value) => setNewProductMaxStockUnits(sanitizeIntegerInput(value))}
                    style={styles.modalInput}
                    placeholder="15"
                    placeholderTextColor="#7a8b7f"
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setIsAddProductModalOpen(false)}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveButton, addingProduct && styles.modalSaveButtonDisabled]}
                onPress={addProduct}
                disabled={addingProduct}
              >
                <Text style={styles.modalSaveText}>{addingProduct ? 'Сохранение...' : 'Сохранить'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingCell !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCell(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Изменить остаток</Text>
            <Text style={styles.modalMeta}>
              {editingCell?.productName} · {editingCell ? `${formatWeekday(editingCell.date)}, ${formatDate(editingCell.date)}` : ''}
            </Text>
            <TextInput
              value={editingValue}
              onChangeText={(value) => setEditingValue(sanitizeStockValue(value))}
              style={styles.modalInput}
              placeholder="0-15"
              placeholderTextColor="#7a8b7f"
              keyboardType="number-pad"
              maxLength={2}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setEditingCell(null)} disabled={savingEdit}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveButton, savingEdit && styles.modalSaveButtonDisabled]}
                onPress={() => void saveCell(false)}
                disabled={savingEdit}
              >
                <Text style={styles.modalSaveText}>Сохранить</Text>
              </Pressable>
              <Pressable
                style={[styles.modalContinueButton, savingEdit && styles.modalSaveButtonDisabled]}
                onPress={() => void saveCell(true)}
                disabled={savingEdit}
              >
                <Text style={styles.modalContinueText}>Сохранить и продолжить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isShopPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsShopPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Выберите магазин</Text>
            <ScrollView style={styles.modalShopList}>
              {shops.map((shop) => (
                <Pressable
                  key={shop.id}
                  style={[styles.modalShopItem, selectedShopId === shop.id && styles.modalShopItemActive]}
                  onPress={() => {
                    setSelectedShopId(shop.id);
                    setIsShopPickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalShopItemText, selectedShopId === shop.id && styles.modalShopItemTextActive]}>
                    {shop.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCancelButton} onPress={() => setIsShopPickerOpen(false)}>
              <Text style={styles.modalCancelText}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eef3ee',
    paddingTop: topInset,
    gap: 10,
  },
  loadingText: {
    fontSize: 16,
    color: '#2d4034',
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    backgroundColor: '#eef3ee',
    paddingHorizontal: 16,
    paddingTop: topInset + 8,
    paddingBottom: 8,
  },
  header: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1f2f26',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 14,
    color: '#4f6155',
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateButton: {
    borderRadius: 11,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  updateButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  logoutButton: {
    borderRadius: 11,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  logoutButtonText: {
    color: '#223529',
    fontWeight: '800',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  contentWrap: {
    flex: 1,
  },
  tabContentWrap: {
    flex: 1,
    paddingBottom: 8,
  },
  controls: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c6d3c8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2f26',
  },
  controlButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#2f6f4f',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#d5ddd5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#213125',
    fontSize: 13,
    fontWeight: '700',
  },
  rangeButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  calendarNavButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b8c7bb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  calendarNavButtonDisabled: {
    opacity: 0.7,
  },
  calendarNavButtonText: {
    color: '#2d4034',
    fontWeight: '700',
    fontSize: 12,
  },
  sortRow: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  metaText: {
    color: '#35473b',
    fontWeight: '700',
    fontSize: 13,
  },
  viewModeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  viewModeButton: {
    borderWidth: 1,
    borderColor: '#bccabf',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f3f6f4',
  },
  viewModeButtonActive: {
    backgroundColor: '#1f4f37',
    borderColor: '#1f4f37',
  },
  viewModeButtonText: {
    color: '#2f4437',
    fontWeight: '700',
    fontSize: 12,
  },
  viewModeButtonTextActive: {
    color: '#ffffff',
  },
  error: {
    marginBottom: 8,
    color: '#b04434',
    fontSize: 14,
    fontWeight: '700',
  },
  tableWrap: {
    flex: 1,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b7c5b8',
    backgroundColor: '#dce4dc',
    overflow: 'hidden',
    marginBottom: 8,
  },
  tableVerticalContent: {
    minHeight: '100%',
    paddingBottom: 10,
  },
  categoryBlock: {
    borderTopWidth: 1,
    borderTopColor: '#b7c5b8',
  },
  categoryTitleRow: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#d6dfd6',
    borderBottomWidth: 1,
    borderBottomColor: '#9eb09f',
  },
  categoryTitle: {
    color: '#24382d',
    fontWeight: '800',
    fontSize: 16,
  },
  categoryTable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stickyColumn: {
    zIndex: 2,
    borderRightWidth: 2,
    borderRightColor: '#657667',
    backgroundColor: '#f7f7f7',
  },
  scrollableColumns: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#ecf1ec',
  },
  headerCell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    minHeight: 54,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  headerText: {
    fontSize: 14,
    color: '#2e312f',
    fontWeight: '800',
    textAlign: 'center',
  },
  dateWeekdayText: {
    fontSize: 12,
    color: '#2e312f',
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  dateDayText: {
    marginTop: 1,
    fontSize: 11,
    color: '#3a4b3e',
    fontWeight: '700',
  },
  headerToneA: {
    backgroundColor: '#ffffff',
  },
  headerToneB: {
    backgroundColor: '#eef6ef',
  },
  secondWeekBoundary: {
    borderLeftWidth: 3,
    borderLeftColor: '#6f8fb4',
  },
  row: {
    flexDirection: 'row',
  },
  emptyRow: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#a7b5a8',
    backgroundColor: '#f6f8f6',
  },
  emptyScrollableRow: {
    minWidth: 240,
  },
  emptyRowText: {
    color: '#5a6d5e',
    fontSize: 13,
    fontWeight: '700',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#7f8d81',
    minHeight: 46,
    paddingHorizontal: 4,
  },
  nameColumn: {
    width: 156,
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    backgroundColor: '#f7f7f7',
  },
  dateColumn: {
    width: 62,
  },
  dashboardStockColumn: {
    width: 124,
  },
  dashboardOrderColumn: {
    width: 128,
  },
  dashboardMetricColumn: {
    width: 76,
  },
  actionColumn: {
    width: 74,
    backgroundColor: '#ecf0ec',
  },
  nameCell: {
    justifyContent: 'center',
  },
  nameScroll: {
    width: '100%',
  },
  nameText: {
    fontSize: 15,
    color: '#222222',
    fontWeight: '600',
  },
  referenceText: {
    marginTop: 2,
    fontSize: 12,
    color: '#4e5d53',
    fontWeight: '500',
  },
  valueCell: {
    backgroundColor: '#f9fbf8',
  },
  valueToneA: {
    backgroundColor: '#ffffff',
  },
  valueToneB: {
    backgroundColor: '#f1f8f1',
  },
  dashboardHeaderCell: {
    minHeight: 86,
    gap: 2,
  },
  dashboardNameHeader: {
    minHeight: 86,
  },
  dashboardHeaderTitle: {
    fontSize: 12,
    color: '#1f2a21',
    fontWeight: '600',
    textAlign: 'center',
  },
  dashboardHeaderTitleStock: {
    fontSize: 12,
    fontWeight: '600',
  },
  dashboardHeaderTitleExpanded: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlignVertical: 'center',
  },
  dashboardHeaderSubtitle: {
    fontSize: 11,
    color: '#1f2a21',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 12,
  },
  dashboardHeaderSubtitleStock: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 12,
  },
  dashboardHeaderSubtitleHidden: {
    display: 'none',
  },
  dashboardHeaderNeutral: {
    backgroundColor: '#d9d9d9',
  },
  dashboardHeaderOrder: {
    backgroundColor: '#e4cccc',
  },
  dashboardHeaderYellow: {
    backgroundColor: '#ecec9c',
  },
  dashboardHeaderGreen: {
    backgroundColor: '#bdd196',
  },
  dashboardHeaderBlue: {
    backgroundColor: '#90c7da',
  },
  dashboardDataRow: {
    height: 56,
  },
  dashboardNameCell: {
    height: 56,
  },
  dashboardValueCell: {
    height: 56,
    backgroundColor: '#f4f6f4',
  },
  dashboardValueNeutral: {
    backgroundColor: '#f2f2f2',
  },
  dashboardValueOrder: {
    backgroundColor: '#efe0e0',
  },
  dashboardValueYellow: {
    backgroundColor: '#f4f3bf',
  },
  dashboardValueGreen: {
    backgroundColor: '#dbe7bf',
  },
  dashboardValueBlue: {
    backgroundColor: '#c7e4ef',
  },
  dashboardOrderInput: {
    width: '100%',
    textAlign: 'center',
    color: '#223528',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 0,
  },
  dashboardOrderInputExpanded: {
    fontSize: 18,
    fontWeight: '600',
  },
  pendingCell: {
    opacity: 0.6,
  },
  valueText: {
    color: '#223528',
    fontSize: 16,
    fontWeight: '600',
  },
  valueTextStock: {
    fontSize: 18,
    fontWeight: '600',
  },
  valueTextOrder: {
    fontSize: 18,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#9f4038',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 10,
  },
  workerActionText: {
    color: '#55685b',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomTabs: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: '#c8d4cb',
    borderRadius: 14,
    backgroundColor: '#f3f7f3',
    padding: 6,
  },
  bottomTabButton: {
    minHeight: 56,
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 6,
  },
  bottomTabButtonActive: {
    backgroundColor: '#1f4f37',
  },
  bottomTabButtonText: {
    color: '#2f4437',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  bottomTabButtonTextActive: {
    color: '#ffffff',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 32, 26, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c5d1c7',
    backgroundColor: '#f7faf7',
    padding: 14,
    gap: 12,
    maxHeight: '75%',
  },
  modalTitle: {
    color: '#1f2f26',
    fontSize: 19,
    fontWeight: '800',
  },
  modalMeta: {
    color: '#4d6052',
    fontSize: 18,
    fontWeight: '900',
  },
  modalBody: {
    maxHeight: 460,
  },
  modalBodyContent: {
    gap: 9,
    paddingBottom: 2,
  },
  formLabel: {
    color: '#344b3d',
    fontSize: 14,
    fontWeight: '800',
  },
  modalInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c6d3c8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 20,
    color: '#1f2f26',
    fontWeight: '500',
  },
  productFieldsGrid: {
    gap: 10,
  },
  productField: {
    gap: 6,
  },
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8d3ca',
    backgroundColor: '#edf3ee',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  categoryChipActive: {
    backgroundColor: '#2f6f4f',
    borderColor: '#2f6f4f',
  },
  categoryChipText: {
    color: '#334b3d',
    fontWeight: '700',
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    borderRadius: 11,
    backgroundColor: '#dbe4dc',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#2b3d31',
    fontWeight: '700',
    fontSize: 13,
  },
  modalSaveButton: {
    borderRadius: 11,
    backgroundColor: '#2f6f4f',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalContinueButton: {
    borderRadius: 11,
    backgroundColor: '#215c40',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSaveButtonDisabled: {
    opacity: 0.7,
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalContinueText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalShopList: {
    maxHeight: 320,
  },
  modalShopItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1dbd2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  modalShopItemActive: {
    borderColor: '#2f6f4f',
    backgroundColor: '#e8f2eb',
  },
  modalShopItemText: {
    color: '#2a3f33',
    fontSize: 14,
    fontWeight: '700',
  },
  modalShopItemTextActive: {
    color: '#1f4f37',
  },
});




