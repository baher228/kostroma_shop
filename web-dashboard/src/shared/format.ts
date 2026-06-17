// Small, dependency-free formatting/parsing helpers shared across panels.
// Each helper is pure and side-effect free.

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'Не удалось выполнить запрос.';

export const intOrZero = (value: string): number => Number.parseInt(value || '0', 10) || 0;

export const numberOrZero = (value: string): number => Number.parseFloat(value || '0') || 0;

export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ч ${rest} мин`;
};

export const formatDate = (value: string): string =>
  new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU');

export const formatDateTime = (value: string): string =>
  value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';

export const statusLabel = (status: 'in' | 'out'): string =>
  status === 'in' ? 'На смене' : 'Вне смены';

export const orderStatusLabel = (status: 'new' | 'processed'): string =>
  status === 'new' ? 'Новый' : 'Обработан';

export const normalizeText = (value: string): string => value.trim().toLowerCase();

export const formatOptionalPrice = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)} руб` : '';
};

export const formatWeight = (total: number, packWeightKg: number | null): string => {
  if (!total || packWeightKg === null || packWeightKg === undefined) {
    return '';
  }
  return (total * packWeightKg).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};
