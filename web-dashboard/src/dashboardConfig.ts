import type { Shop } from './types';
import type { MachineNumber } from '../../shared/dashboard-config';

export {
  ALLOWED_ORDER_WEEKDAYS,
  BUSINESS_CATEGORIES,
  DASHBOARD_COLUMNS,
  DEFAULT_BUSINESS_CATEGORY,
  DEFAULT_PRODUCT_CATEGORY,
  DEFAULT_SUBCATEGORIES_BY_BUSINESS_CATEGORY,
  MACHINE_NUMBERS,
  MAX_ORDER_VALUE_LEN,
  PRODUCT_CATEGORIES,
  TWO_WEEKS_DAYS,
  WEEK_DAYS,
} from '../../shared/dashboard-config';

export type {
  DashboardColumn,
  DashboardColumnKey,
  DashboardManualOrderKey,
  DashboardOverrideKey,
  DashboardRowValues,
  DashboardTone,
  DashboardWeekRef,
  BusinessCategory,
  MachineNumber,
  ProductCategory,
  WeekDateMap,
  WeekSlot,
} from '../../shared/dashboard-config';

export type MachineGroup = {
  machineNumber: MachineNumber;
  shops: Shop[];
};

export const DASHBOARD_WINDOW_START = '2026-04-28';
