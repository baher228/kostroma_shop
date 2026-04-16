import { ColumnKey, TableColumn } from '../types/models';

export const STOCK_KEYS: ColumnKey[] = ['stockTue', 'stockWed', 'stockThu', 'stockFri', 'stockSun', 'stockMon'];

export const COLUMNS: TableColumn[] = [
  { key: 'packCount', label: 'Кол-во\nупаковок', type: 'base' },
  { key: 'stockTue', label: 'Остаток\nвторник', type: 'stock' },
  { key: 'orderThu', label: 'Заказ\nна четверг', type: 'order' },
  { key: 'stockWed', label: 'Остаток\nсреда', type: 'stock' },
  { key: 'stockThu', label: 'Остаток\nчетверг', type: 'stock' },
  { key: 'orderSat', label: 'Заказ\nна субботу', type: 'order' },
  { key: 'stockFri', label: 'Остаток\nпятница', type: 'stock' },
  { key: 'stockSun', label: 'Остаток\nвоскресенье', type: 'stock' },
  { key: 'orderTue', label: 'Заказ\nна вторник', type: 'order' },
  { key: 'stockMon', label: 'Остаток\nпонедельник', type: 'stock' },
];
