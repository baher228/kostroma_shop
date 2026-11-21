import type { BusinessCategory } from '../types';

const ORDER_FILE_PREFIX: Record<BusinessCategory, string> = {
  'Деликатесы': 'МГ',
  'Молоко': 'СМЗ',
  'Хлеб': 'Галич хлеб',
  'Сыр': 'Молпром',
  'Курица': 'Галич кур',
  'Мороженое': 'Караваево',
};

export const prefixOrderFileName = (category: BusinessCategory, fileName: string): string =>
  `${ORDER_FILE_PREFIX[category]} ${fileName}`;
