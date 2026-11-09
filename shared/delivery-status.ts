export type DeliveryStatus = 'on_time' | 'late' | 'no_photo' | 'missed' | 'expected';

export type DeliverySchedule = {
  windowStartMinutes: number;
  windowEndMinutes: number;
  weekdays: number[];
};

export type DeliveryReceiptMark = {
  receivedAt: string;
  hasInvoicePhoto: boolean;
};

export type DeliveryCounts = Record<DeliveryStatus, number>;

/** Shops work on Moscow time (UTC+3, no DST). */
export const MOSCOW_UTC_OFFSET_MINUTES = 180;

const pad = (value: number) => String(value).padStart(2, '0');

const toMoscow = (date: Date) => new Date(date.getTime() + MOSCOW_UTC_OFFSET_MINUTES * 60_000);

export const moscowDateKey = (date: Date = new Date()): string => toMoscow(date).toISOString().slice(0, 10);

export const moscowMinutes = (date: Date = new Date()): number => {
  const shifted = toMoscow(date);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

export const moscowDateTimeToIso = (dateKey: string, minutes: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes - MOSCOW_UTC_OFFSET_MINUTES)).toISOString();
};

export const weekdayOfDateKey = (dateKey: string): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

export const addDaysToDateKey = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export const isDeliveryDay = (schedule: DeliverySchedule, dateKey: string): boolean =>
  schedule.weekdays.includes(weekdayOfDateKey(dateKey));

/** 390 → "6:30" */
export const formatClockMinutes = (minutes: number): string => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;

/** "6:30" / "06:30" → 390 */
export const parseClockMinutes = (raw: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
};

export const deliveryStatus = (
  schedule: DeliverySchedule,
  dateKey: string,
  receipt: DeliveryReceiptMark | null | undefined,
  now: Date = new Date(),
): DeliveryStatus => {
  if (receipt) {
    const receivedAt = new Date(receipt.receivedAt);
    const receivedDay = moscowDateKey(receivedAt);
    const late = receivedDay > dateKey || (receivedDay === dateKey && moscowMinutes(receivedAt) > schedule.windowEndMinutes);
    if (late) return 'late';
    return receipt.hasInvoicePhoto ? 'on_time' : 'no_photo';
  }
  const today = moscowDateKey(now);
  if (dateKey < today || (dateKey === today && moscowMinutes(now) > schedule.windowEndMinutes)) return 'missed';
  return 'expected';
};

export const emptyDeliveryCounts = (): DeliveryCounts => ({ on_time: 0, late: 0, no_photo: 0, missed: 0, expected: 0 });

export const countDeliveryStatuses = (statuses: DeliveryStatus[]): DeliveryCounts =>
  statuses.reduce((counts, status) => {
    counts[status] += 1;
    return counts;
  }, emptyDeliveryCounts());

export const deliveryProblemCount = (counts: DeliveryCounts): number => counts.late + counts.no_photo + counts.missed;

export const deliveryAcceptedCount = (counts: DeliveryCounts): number => counts.on_time + counts.late + counts.no_photo;
