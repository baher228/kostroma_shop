import { opsDb } from './opsDb';
import { OpsTokenClaims, ProductCategory, Shop, StockProduct, StockTable, StockTableRow } from './types';

type ShopDbRow = {
  id: string;
  name: string;
  machine_number: number;
};

type ProductDbRow = {
  id: string;
  name: string;
  category: ProductCategory | null;
  pack_type: string | null;
  units_in_pack: number | null;
  pack_weight_kg: number | null;
  shelf_life_days: number | null;
  unit_price_rub_vat: number | null;
  min_stock_units: number | null;
  max_stock_units: number | null;
};

type ValueDbRow = {
  product_id: string;
  day_date: string;
  value: number;
};

type DashboardOverrideDbRow = {
  product_id: string;
  week_start: string;
  cell_key: string;
  value: string;
};

type DateRange = {
  from: string;
  to: string;
};

type CreateProductInput = {
  name: string;
  category?: ProductCategory;
  packType: string;
  unitsInPack: number;
  packWeightKg: number;
  shelfLifeDays: number;
  unitPriceRubVat: number;
  minStockUnits: number;
  maxStockUnits: number;
};

const PRODUCT_CATEGORIES: ProductCategory[] = ['Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'];
const DEFAULT_PRODUCT_CATEGORY: ProductCategory = 'Йогурты';

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (raw: string): Date => {
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const buildDateRange = (from: string, to: string): string[] => {
  const start = parseDateKey(from);
  const finish = parseDateKey(to);
  const dates: string[] = [];
  for (let current = new Date(start); current <= finish; current.setDate(current.getDate() + 1)) {
    dates.push(toDateKey(current));
  }
  return dates;
};

const startOfWeekMonday = (date: Date): Date => {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  return current;
};

const currentWeekRange = (): DateRange => {
  const start = startOfWeekMonday(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: toDateKey(start), to: toDateKey(end) };
};

const currentYearRange = (): DateRange => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return { from: toDateKey(start), to: toDateKey(end) };
};

const normalizeImportedDashboardRange = (from: string, to: string): DateRange | null => {
  if (from === '2026-05-04' && to === '2026-05-17') {
    return { from: '2026-04-28', to: '2026-05-11' };
  }
  return null;
};

const clampRangeSpan = (from: string, to: string): DateRange => {
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start > end) {
    return currentWeekRange();
  }
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (diffDays > 370) {
    const maxEnd = new Date(start);
    maxEnd.setDate(maxEnd.getDate() + 369);
    return { from: toDateKey(start), to: toDateKey(maxEnd) };
  }
  return { from: toDateKey(start), to: toDateKey(end) };
};

const mapShop = (row: ShopDbRow): Shop => ({
  id: row.id,
  name: row.name,
  machineNumber: row.machine_number,
});

const mapProduct = (row: ProductDbRow): StockProduct => ({
  id: row.id,
  name: row.name,
  category: row.category && PRODUCT_CATEGORIES.includes(row.category) ? row.category : DEFAULT_PRODUCT_CATEGORY,
  packType: row.pack_type,
  unitsInPack: row.units_in_pack,
  packWeightKg: row.pack_weight_kg,
  shelfLifeDays: row.shelf_life_days,
  unitPriceRubVat: row.unit_price_rub_vat,
  minStockUnits: row.min_stock_units,
  maxStockUnits: row.max_stock_units,
});

export const listShops = async (): Promise<Shop[]> => {
  const result = await opsDb.query<ShopDbRow>(
    `
      SELECT id, name, machine_number
      FROM shops
      ORDER BY machine_number ASC, created_at ASC, name ASC;
    `,
  );
  return result.rows.map(mapShop);
};

export const getShopById = async (shopId: string): Promise<Shop | null> => {
  const result = await opsDb.query<ShopDbRow>(
    `
      SELECT id, name, machine_number
      FROM shops
      WHERE id = $1
      LIMIT 1;
    `,
    [shopId],
  );
  return result.rows[0] ? mapShop(result.rows[0]) : null;
};

export const createShop = async (name: string, machineNumber: number): Promise<Shop> => {
  const id = `shop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const result = await opsDb.query<ShopDbRow>(
    `
      INSERT INTO shops (id, name, machine_number, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, name, machine_number;
    `,
    [id, name.trim(), machineNumber],
  );
  return mapShop(result.rows[0]);
};

export const updateShopMachine = async (shopId: string, machineNumber: number): Promise<Shop | null> => {
  const result = await opsDb.query<ShopDbRow>(
    `
      UPDATE shops
      SET machine_number = $2
      WHERE id = $1
      RETURNING id, name, machine_number;
    `,
    [shopId, machineNumber],
  );
  return result.rows[0] ? mapShop(result.rows[0]) : null;
};

export const deleteShop = async (shopId: string): Promise<boolean> => {
  const result = await opsDb.query(
    `
      DELETE FROM shops
      WHERE id = $1;
    `,
    [shopId],
  );
  return (result.rowCount ?? 0) > 0;
};

export const listProducts = async (): Promise<StockProduct[]> => {
  const result = await opsDb.query<ProductDbRow>(
    `
      SELECT id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units
      FROM stock_products
      ORDER BY created_at ASC, name ASC;
    `,
  );
  return result.rows.map(mapProduct);
};

export const createProduct = async (input: CreateProductInput): Promise<StockProduct> => {
  const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const resolvedCategory =
    input.category && PRODUCT_CATEGORIES.includes(input.category) ? input.category : DEFAULT_PRODUCT_CATEGORY;
  const result = await opsDb.query<ProductDbRow>(
    `
      INSERT INTO stock_products (
        id,
        name,
        category,
        pack_type,
        units_in_pack,
        pack_weight_kg,
        shelf_life_days,
        unit_price_rub_vat,
        min_stock_units,
        max_stock_units,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units;
    `,
    [
      id,
      input.name.trim(),
      resolvedCategory,
      input.packType.trim(),
      input.unitsInPack,
      input.packWeightKg,
      input.shelfLifeDays,
      input.unitPriceRubVat,
      input.minStockUnits,
      input.maxStockUnits,
    ],
  );
  return mapProduct(result.rows[0]);
};

export const updateProductMeta = async (
  productId: string,
  patch: { unitsInPack?: number | null; minStockUnits?: number | null; maxStockUnits?: number | null },
): Promise<StockProduct | null> => {
  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (Object.prototype.hasOwnProperty.call(patch, 'unitsInPack')) {
    updates.push(`units_in_pack = $${index++}`);
    params.push(patch.unitsInPack ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'minStockUnits')) {
    updates.push(`min_stock_units = $${index++}`);
    params.push(patch.minStockUnits ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxStockUnits')) {
    updates.push(`max_stock_units = $${index++}`);
    params.push(patch.maxStockUnits ?? null);
  }

  if (!updates.length) {
    const current = await opsDb.query<ProductDbRow>(
      `
        SELECT id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units
        FROM stock_products
        WHERE id = $1
        LIMIT 1;
      `,
      [productId],
    );
    return current.rows[0] ? mapProduct(current.rows[0]) : null;
  }

  params.push(productId);
  const result = await opsDb.query<ProductDbRow>(
    `
      UPDATE stock_products
      SET ${updates.join(', ')}
      WHERE id = $${index}
      RETURNING id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units;
    `,
    params,
  );

  return result.rows[0] ? mapProduct(result.rows[0]) : null;
};

export const deleteProduct = async (productId: string): Promise<boolean> => {
  const result = await opsDb.query(
    `
      DELETE FROM stock_products
      WHERE id = $1;
    `,
    [productId],
  );
  return (result.rowCount ?? 0) > 0;
};

const resolveRequestedRange = (
  viewer: OpsTokenClaims,
  params: { from?: string; to?: string; range?: 'week' | 'year' },
): DateRange => {
  if (viewer.role === 'worker') {
    return currentWeekRange();
  }
  if (params.from && params.to) {
    const normalizedImportRange = normalizeImportedDashboardRange(params.from, params.to);
    if (normalizedImportRange) {
      return normalizedImportRange;
    }
    return clampRangeSpan(params.from, params.to);
  }
  if (params.range === 'week') {
    return currentWeekRange();
  }
  return currentYearRange();
};

const resolveRequestedShop = async (viewer: OpsTokenClaims, requestedShopId?: string): Promise<Shop | null> => {
  if (viewer.role === 'worker') {
    const allowedShopId = viewer.shopIds[0];
    if (!allowedShopId) {
      return null;
    }
    return getShopById(allowedShopId);
  }

  if (requestedShopId) {
    const requested = await getShopById(requestedShopId);
    if (requested) {
      return requested;
    }
  }

  const shops = await listShops();
  return shops[0] ?? null;
};

export const getStockTable = async (
  viewer: OpsTokenClaims,
  params: { shopId?: string; from?: string; to?: string; range?: 'week' | 'year' },
): Promise<StockTable | null> => {
  const range = resolveRequestedRange(viewer, params);
  const shop = await resolveRequestedShop(viewer, params.shopId);
  if (!shop) {
    return null;
  }

  const [productsResult, valuesResult, dashboardOverridesResult] = await Promise.all([
    opsDb.query<ProductDbRow>(
      `
        SELECT id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat
               , min_stock_units, max_stock_units
        FROM stock_products
        ORDER BY created_at ASC, name ASC;
      `,
    ),
    opsDb.query<ValueDbRow>(
      `
        SELECT product_id, day_date::text AS day_date, value
        FROM stock_values
        WHERE shop_id = $1
          AND day_date >= $2::date
          AND day_date <= $3::date
        ORDER BY day_date ASC;
      `,
      [shop.id, range.from, range.to],
    ),
    opsDb.query<DashboardOverrideDbRow>(
      `
        SELECT product_id, week_start::text AS week_start, cell_key, value
        FROM dashboard_overrides
        WHERE shop_id = $1
          AND week_start >= $2::date
          AND week_start <= $3::date
        ORDER BY week_start ASC, cell_key ASC;
      `,
      [shop.id, range.from, range.to],
    ),
  ]);

  const dates = buildDateRange(range.from, range.to);
  const byProductAndDate = new Map<string, string>();
  for (const item of valuesResult.rows) {
    byProductAndDate.set(`${item.product_id}:${item.day_date}`, String(item.value));
  }
  const dashboardOverridesByProduct = new Map<string, Record<string, string>>();
  for (const item of dashboardOverridesResult.rows) {
    const current = dashboardOverridesByProduct.get(item.product_id) ?? {};
    current[`${item.week_start}:${item.cell_key}`] = item.value;
    dashboardOverridesByProduct.set(item.product_id, current);
  }

  const rows: StockTableRow[] = productsResult.rows.map((product) => {
    const values: Record<string, string> = {};
    for (const date of dates) {
      values[date] = byProductAndDate.get(`${product.id}:${date}`) ?? '';
    }
    return {
      productId: product.id,
      name: product.name,
      category: product.category && PRODUCT_CATEGORIES.includes(product.category) ? product.category : DEFAULT_PRODUCT_CATEGORY,
      packType: product.pack_type,
      unitsInPack: product.units_in_pack,
      packWeightKg: product.pack_weight_kg,
      shelfLifeDays: product.shelf_life_days,
      unitPriceRubVat: product.unit_price_rub_vat,
      minStockUnits: product.min_stock_units,
      maxStockUnits: product.max_stock_units,
      values,
      dashboardOverrides: dashboardOverridesByProduct.get(product.id),
    };
  });

  return {
    shop,
    from: range.from,
    to: range.to,
    dates,
    rows,
  };
};

const MAX_STOCK_VALUE = 50;

const sanitizeStockValue = (raw: string): string => {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) {
    return '';
  }
  const parsed = Number.parseInt(digits, 10);
  if (Number.isNaN(parsed)) {
    return '';
  }
  return String(Math.min(MAX_STOCK_VALUE, Math.max(0, parsed)));
};

export const upsertStockValue = async (
  viewer: OpsTokenClaims,
  params: { shopId?: string; productId: string; date: string; value: string },
): Promise<boolean> => {
  const targetShop = await resolveRequestedShop(viewer, params.shopId);
  if (!targetShop) {
    return false;
  }

  if (viewer.role === 'worker' && !viewer.shopIds.includes(targetShop.id)) {
    return false;
  }

  if (viewer.role === 'worker') {
    const workerWeek = currentWeekRange();
    if (params.date < workerWeek.from || params.date > workerWeek.to) {
      return false;
    }
  }

  const productResult = await opsDb.query<{ id: string }>(
    `
      SELECT id
      FROM stock_products
      WHERE id = $1
      LIMIT 1;
    `,
    [params.productId],
  );
  if (!productResult.rows[0]) {
    return false;
  }

  const sanitized = sanitizeStockValue(params.value);
  if (!sanitized) {
    await opsDb.query(
      `
        DELETE FROM stock_values
        WHERE shop_id = $1
          AND product_id = $2
          AND day_date = $3::date;
      `,
      [targetShop.id, params.productId, params.date],
    );
    return true;
  }

  await opsDb.query(
    `
      INSERT INTO stock_values (shop_id, product_id, day_date, value, updated_at)
      VALUES ($1, $2, $3::date, $4::smallint, NOW())
      ON CONFLICT (shop_id, product_id, day_date)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `,
    [targetShop.id, params.productId, params.date, Number.parseInt(sanitized, 10)],
  );
  return true;
};

type OrderValueDbRow = {
  product_id: string;
  order_date: string;
  packs: number;
};

export type OrderValueEntry = {
  productId: string;
  orderDate: string;
  packs: number;
};

export const listOrderValues = async (from: string, to: string): Promise<OrderValueEntry[]> => {
  const result = await opsDb.query<OrderValueDbRow>(
    `
      SELECT product_id, order_date::text AS order_date, packs
      FROM order_values
      WHERE order_date >= $1::date
        AND order_date <= $2::date
      ORDER BY order_date ASC;
    `,
    [from, to],
  );
  return result.rows.map((row) => ({
    productId: row.product_id,
    orderDate: row.order_date,
    packs: row.packs,
  }));
};

export const upsertOrderValue = async (
  params: { productId: string; orderDate: string; packs: number },
): Promise<boolean> => {
  const productResult = await opsDb.query<{ id: string }>(
    `SELECT id FROM stock_products WHERE id = $1 LIMIT 1;`,
    [params.productId],
  );
  if (!productResult.rows[0]) {
    return false;
  }

  if (params.packs <= 0) {
    await opsDb.query(
      `DELETE FROM order_values WHERE product_id = $1 AND order_date = $2::date;`,
      [params.productId, params.orderDate],
    );
    return true;
  }

  await opsDb.query(
    `
      INSERT INTO order_values (product_id, order_date, packs, updated_at)
      VALUES ($1, $2::date, $3::smallint, NOW())
      ON CONFLICT (product_id, order_date)
      DO UPDATE SET packs = EXCLUDED.packs, updated_at = NOW();
    `,
    [params.productId, params.orderDate, params.packs],
  );
  return true;
};
