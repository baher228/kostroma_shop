// Pure stock/order dashboard calculations.
// Everything here is side-effect free and independent of React state.
// Week-relative assembly (dashboardRowValues) lives here too, because it is
// a deterministic function of (product, weeks, orderValues) — it does not own state.

import {
  PRODUCT_CATEGORIES,
  DEFAULT_BUSINESS_CATEGORY,
} from '../../dashboardConfig';
import type { Product, ProductPayload } from '../../types';
import { formatOptionalPrice } from '../../shared/format';
export {
  buildDashboardRowValues,
  computeDashboardSold,
  computeSold,
  computeStockWithOrder,
  dashboardDateFor,
  dashboardHeaderSubtitle,
  dashboardRangeLabel,
  deriveDashboardWeeks,
  diffStocks,
  isManualOrderKey,
  isManualStockKey,
  mapWeekDates,
  orderUnitsFromPacks,
  parseStockNumber,
  sanitizeOrderValue,
  splitWeeks,
  type DashboardWeeks,
} from '../../../../shared/dashboard-calculations';

export const sanitizeStock = (value: string): string => {
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return String(Math.min(50, Math.max(0, parsed)));
};

export const productToForm = (product?: Product): ProductPayload => ({
  name: product?.name ?? '',
  businessCategory: product?.businessCategory ?? DEFAULT_BUSINESS_CATEGORY,
  category: product?.category ?? PRODUCT_CATEGORIES[0],
  packType: product?.packType ?? '',
  unitsInPack: product?.unitsInPack ?? 1,
  packWeightKg: product?.packWeightKg ?? 1,
  shelfLifeDays: product?.shelfLifeDays ?? 1,
  unitPriceRubVat: product?.unitPriceRubVat ?? 0,
  minStockUnits: product?.minStockUnits ?? 0,
  maxStockUnits: product?.maxStockUnits ?? 0,
});

const hasNumber = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(Number(value));

export const productReferenceLabel = (row: Product): string => {
  const parts: string[] = [];
  if (row.packType) parts.push(row.packType);
  if (hasNumber(row.unitsInPack)) parts.push(`${row.unitsInPack} шт/уп`);
  if (hasNumber(row.packWeightKg)) parts.push(`${row.packWeightKg} кг`);
  if (hasNumber(row.shelfLifeDays)) parts.push(`${row.shelfLifeDays} сут`);
  const price = formatOptionalPrice(row.unitPriceRubVat);
  if (price) parts.push(price);
  if (row.minStockUnits !== null || row.maxStockUnits !== null) {
    parts.push(`границы: ${row.minStockUnits ?? '-'}-${row.maxStockUnits ?? '-'}`);
  }
  return parts.join(' · ');
};
