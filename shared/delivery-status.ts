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

export type MonthDay = { date: string; day: number; weekend: boolean };

export type MonthCell = {
  date: string;
  /** null — no deliveries were due that day (not scheduled, before the supplier existed, or in the future). */
  problems: number | null;
  details: string[];
};

export type ShopMonthRow = {
  shopId: string;
  name: string;
  cells: MonthCell[];
  due: number;
  withPhoto: number;
  missed: number;
  noPhoto: number;
  avgMarkDelayMinutes: number | null;
};

export type SupplierMonthRow = {
  name: string;
  due: number;
  late: number;
  onTimeShare: number | null;
  avgLateMinutes: number | null;
};

export type DeliveryMonthReport = {
  days: MonthDay[];
  shops: ShopMonthRow[];
  suppliers: SupplierMonthRow[];
  counts: DeliveryCounts;
};

const MINUTE = 60_000;

export type DeliveryReportShop = { id: string; name: string };
export type DeliveryReportSupplier = DeliverySchedule & { id: string; shopId: string; name: string; createdAt: string };
export type DeliveryReportReceipt = DeliveryReceiptMark & { supplierId: string; date: string; markedAt: string };

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

export const monthDays = (todayKey: string): MonthDay[] => {
  const [year, month] = todayKey.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return Array.from({ length: last }, (_, index) => {
    const date = addDaysToDateKey(first, index);
    const weekday = weekdayOfDateKey(date);
    return { date, day: index + 1, weekend: weekday === 0 || weekday === 6 };
  });
};

export const buildDeliveryMonthReport = ({
  shops,
  suppliers,
  receipts,
  today,
  now = new Date(),
}: {
  shops: DeliveryReportShop[];
  suppliers: DeliveryReportSupplier[];
  receipts: DeliveryReportReceipt[];
  today: string;
  now?: Date;
}): DeliveryMonthReport => {
  const days = monthDays(today);
  const receiptsByKey = new Map(receipts.map((receipt) => [`${receipt.supplierId}|${receipt.date}`, receipt]));
  const counts = emptyDeliveryCounts();
  const supplierStats = new Map<string, { due: number; late: number; lateMinutes: number[] }>();

  const shopRows = shops.map((shop): ShopMonthRow => {
    const shopSuppliers = suppliers.filter((supplier) => supplier.shopId === shop.id);
    const row: ShopMonthRow = { shopId: shop.id, name: shop.name, cells: [], due: 0, withPhoto: 0, missed: 0, noPhoto: 0, avgMarkDelayMinutes: null };
    const markDelays: number[] = [];

    for (const { date } of days) {
      const cell: MonthCell = { date, problems: null, details: [] };
      for (const supplier of shopSuppliers) {
        const firstDay = moscowDateKey(new Date(supplier.createdAt));
        if (date > today || date < firstDay || !isDeliveryDay(supplier, date)) continue;
        const receipt = receiptsByKey.get(`${supplier.id}|${date}`);
        const status = deliveryStatus(supplier, date, receipt, now);
        counts[status] += 1;
        if (status === 'expected') continue;

        const stats = supplierStats.get(supplier.name) ?? { due: 0, late: 0, lateMinutes: [] };
        supplierStats.set(supplier.name, stats);
        stats.due += 1;
        row.due += 1;
        cell.problems ??= 0;

        if (!receipt) {
          row.missed += 1;
          cell.problems += 1;
          cell.details.push(`${supplier.name} — не отмечено`);
          continue;
        }
        const windowEnd = new Date(moscowDateTimeToIso(date, supplier.windowEndMinutes)).getTime();
        const receivedAt = new Date(receipt.receivedAt).getTime();
        if (receivedAt > windowEnd) {
          stats.late += 1;
          const lateBy = Math.round((receivedAt - windowEnd) / MINUTE);
          stats.lateMinutes.push(lateBy);
          cell.details.push(`${supplier.name} — опоздал на ${lateBy} мин`);
        }
        if (receipt.hasInvoicePhoto) {
          row.withPhoto += 1;
        } else {
          row.noPhoto += 1;
          cell.problems += 1;
          cell.details.push(`${supplier.name} — без фото накладной`);
        }
        markDelays.push(Math.max(0, (new Date(receipt.markedAt).getTime() - receivedAt) / MINUTE));
      }
      row.cells.push(cell);
    }
    row.avgMarkDelayMinutes = average(markDelays);
    return row;
  });

  const supplierRows = Array.from(supplierStats, ([name, stats]): SupplierMonthRow => ({
    name,
    due: stats.due,
    late: stats.late,
    onTimeShare: stats.due ? (stats.due - stats.late) / stats.due : null,
    avgLateMinutes: average(stats.lateMinutes),
  })).sort((a, b) => b.late - a.late || b.due - a.due || a.name.localeCompare(b.name, 'ru'));

  return { days, shops: shopRows, suppliers: supplierRows, counts };
};
