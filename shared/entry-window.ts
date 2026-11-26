export const TABLET_ENTRY_OPEN_HOUR = 18;

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Data for a day opens at 18:00 local time on that same day; earlier days stay open.
export const isTabletEntryOpenForDate = (dateKey: string, now: Date = new Date()): boolean => {
  const opensAt = parseDateKey(dateKey);
  opensAt.setHours(TABLET_ENTRY_OPEN_HOUR, 0, 0, 0);
  return now.getTime() >= opensAt.getTime();
};

export const isTabletEntryOpenToday = (now: Date = new Date()): boolean =>
  isTabletEntryOpenForDate(toDateKey(now), now);
