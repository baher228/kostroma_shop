import { ColumnKey, TableColumn } from '../types/models';

export const STOCK_KEYS: ColumnKey[] = ['stockTue', 'stockWed', 'stockThu', 'stockFri', 'stockSun', 'stockMon'];

export const COLUMNS: TableColumn[] = [
  { key: 'packCount', label: 'Кол-во\nупаковок', type: 'base' },
  { key: 'stockTue', label: 'Остаток\nвторник', type: 'stock' },
  { key: 'stockWed', label: 'Остаток\nсреда', type: 'stock' },
  { key: 'stockThu', label: 'Остаток\nчетверг', type: 'stock' },
  { key: 'stockFri', label: 'Остаток\nпятница', type: 'stock' },
  { key: 'stockSun', label: 'Остаток\nвоскресенье', type: 'stock' },
  { key: 'stockMon', label: 'Остаток\nпонедельник', type: 'stock' },
];
