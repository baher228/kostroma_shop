import type { PromotionTableRow } from '../../types';

const compareNullableDates = (left: string | null, right: string | null) => {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
};

export const comparePromotionRowsByDate = (left: PromotionTableRow, right: PromotionTableRow) =>
  compareNullableDates(left.startDate, right.startDate) ||
  compareNullableDates(left.endDate, right.endDate) ||
  left.productName.localeCompare(right.productName, 'ru', { sensitivity: 'base' }) ||
  left.rowNumber - right.rowNumber;
