import { ALLOWED_ORDER_WEEKDAYS, TWO_WEEKS_DAYS } from './dashboardConfig';

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const startOfWeek = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return toDateKey(now);
};

export const addDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

export const getTwoWeeksEnd = (startDateKey: string): string => addDays(startDateKey, TWO_WEEKS_DAYS - 1);

export const parseDateKey = (raw: string): Date => {
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

export const todayDateKey = (): string => toDateKey(new Date());

export const isAllowedOrderDate = (dateKey: string): boolean =>
  ALLOWED_ORDER_WEEKDAYS.has(parseDateKey(dateKey).getDay());

export const shiftToAllowedOrderDate = (dateKey: string, direction: 1 | -1): string => {
  const nextDate = parseDateKey(dateKey);
  do {
    nextDate.setDate(nextDate.getDate() + direction);
  } while (!ALLOWED_ORDER_WEEKDAYS.has(nextDate.getDay()));
  return toDateKey(nextDate);
};

export const nearestAllowedOrderDate = (dateKey: string): string => {
  if (isAllowedOrderDate(dateKey)) {
    return dateKey;
  }
  return shiftToAllowedOrderDate(dateKey, 1);
};

export const formatDateLabel = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};

export const formatDateShort = (iso: string): string => {
  const [, month, day] = iso.split('-');
  return `${day}.${month}`;
};

export const formatWeekdayLabel = (iso: string): string =>
  parseDateKey(iso).toLocaleDateString('ru-RU', { weekday: 'long' });
