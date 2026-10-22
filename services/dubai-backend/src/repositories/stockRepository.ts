import { opsDb } from '../db/opsDb';
import { DEFAULT_BUSINESS_CATEGORY, DEFAULT_PRODUCT_CATEGORY, BUSINESS_CATEGORIES } from '../domain/types';
import type { BusinessCategory, OpsTokenClaims, ProductCategory, Shop, StockProduct, StockTable, StockTableRow } from '../domain/types';

type ShopDbRow = {
  id: string;
  name: string;
  machine_number: number;
};

type ProductDbRow = {
  id: string;
  name: string;
  business_category: BusinessCategory | null;
  category: ProductCategory | null;
  pack_type: string | null;
  units_in_pack: number | null;
  pack_weight_kg: number | string | null;
  shelf_life_days: number | null;
  unit_price_rub_vat: number | string | null;
  min_stock_units: number | null;
  max_stock_units: number | null;
  inventory_price_rub?: number | string | null;
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

type SubcategoryDbRow = {
  name: string;
};

type DateRange = {
  from: string;
  to: string;
};

type CreateProductInput = {
  name: string;
  businessCategory?: BusinessCategory;
  category?: ProductCategory;
  packType: string;
  unitsInPack: number;
  packWeightKg: number;
  shelfLifeDays: number;
  unitPriceRubVat: number;
  minStockUnits: number;
  maxStockUnits: number;
};

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

const toNullableNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

const mapProduct = (row: ProductDbRow): StockProduct => ({
  id: row.id,
  name: row.name,
  businessCategory: row.business_category && BUSINESS_CATEGORIES.includes(row.business_category) ? row.business_category : DEFAULT_BUSINESS_CATEGORY,
  category: row.category?.trim() || DEFAULT_PRODUCT_CATEGORY,
  packType: row.pack_type,
  unitsInPack: row.units_in_pack,
  packWeightKg: toNullableNumber(row.pack_weight_kg),
  shelfLifeDays: row.shelf_life_days,
  unitPriceRubVat: toNullableNumber(row.unit_price_rub_vat),
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

export const updateShop = async (
  shopId: string,
  patch: { name?: string; machineNumber?: number },
): Promise<Shop | null> => {
  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    updates.push(`name = $${index++}`);
    params.push(patch.name?.trim());
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'machineNumber')) {
    updates.push(`machine_number = $${index++}`);
    params.push(patch.machineNumber);
  }

  if (!updates.length) {
    return getShopById(shopId);
  }

  params.push(shopId);
  const result = await opsDb.query<ShopDbRow>(
    `
      UPDATE shops
      SET ${updates.join(', ')}
      WHERE id = $${index}
      RETURNING id, name, machine_number;
    `,
    params,
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

const ensureSubcategory = async (businessCategory: BusinessCategory, name: string): Promise<void> => {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }
  await opsDb.query(
    `
      INSERT INTO stock_product_subcategories (business_category, name)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING;
    `,
    [businessCategory, trimmed],
  );
};

export const listProductSubcategories = async (): Promise<Record<BusinessCategory, ProductCategory[]>> => {
  const result = await opsDb.query<{ business_category: BusinessCategory; name: string }>(
    `
      SELECT business_category, name
      FROM stock_product_subcategories
      ORDER BY business_category ASC, created_at ASC, name ASC;
    `,
  );
  return BUSINESS_CATEGORIES.reduce(
    (acc, businessCategory: BusinessCategory) => {
      acc[businessCategory] = result.rows
        .filter((row: { business_category: BusinessCategory; name: string }) => row.business_category === businessCategory)
        .map((row: { business_category: BusinessCategory; name: string }) => row.name);
      return acc;
    },
    {} as Record<BusinessCategory, ProductCategory[]>,
  );
};

export const createProductSubcategory = async (
  businessCategory: BusinessCategory,
  name: string,
): Promise<Record<BusinessCategory, ProductCategory[]>> => {
  await ensureSubcategory(businessCategory, name);
  return listProductSubcategories();
};

export const deleteProductSubcategory = async (businessCategory: BusinessCategory, name: string): Promise<boolean> => {
  const result = await opsDb.query(
    `
      DELETE FROM stock_product_subcategories
      WHERE business_category = $1
        AND name = $2
        AND NOT EXISTS (
          SELECT 1
          FROM stock_products
          WHERE business_category = $1
            AND category = $2
          LIMIT 1
        );
    `,
    [businessCategory, name],
  );
  return (result.rowCount ?? 0) > 0;
};

export const listProducts = async (): Promise<StockProduct[]> => {
  const result = await opsDb.query<ProductDbRow>(
    `
      SELECT id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units
      FROM stock_products
      ORDER BY created_at ASC, name ASC;
    `,
  );
  return result.rows.map(mapProduct);
};

export const createProduct = async (input: CreateProductInput): Promise<StockProduct> => {
  const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const resolvedBusinessCategory =
    input.businessCategory && BUSINESS_CATEGORIES.includes(input.businessCategory) ? input.businessCategory : DEFAULT_BUSINESS_CATEGORY;
  const resolvedCategory = input.category?.trim() || DEFAULT_PRODUCT_CATEGORY;
  await ensureSubcategory(resolvedBusinessCategory, resolvedCategory);
  const result = await opsDb.query<ProductDbRow>(
    `
      INSERT INTO stock_products (
        id,
        name,
        business_category,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units;
    `,
    [
      id,
      input.name.trim(),
      resolvedBusinessCategory,
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
  patch: { unitsInPack?: number | null; minStockUnits?: number | null; maxStockUnits?: number | null; inventoryPrice?: number | null },
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
  if (Object.prototype.hasOwnProperty.call(patch, 'inventoryPrice')) {
    updates.push(`inventory_price_rub = $${index++}`);
    params.push(patch.inventoryPrice ?? null);
  }

  if (!updates.length) {
    const current = await opsDb.query<ProductDbRow>(
      `
        SELECT id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units
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
      RETURNING id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units;
    `,
    params,
  );

  return result.rows[0] ? mapProduct(result.rows[0]) : null;
};

export const updateProduct = async (
  productId: string,
  patch: Partial<CreateProductInput>,
): Promise<StockProduct | null> => {
  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  const addUpdate = (column: string, value: unknown) => {
    updates.push(`${column} = $${index++}`);
    params.push(value);
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    addUpdate('name', patch.name?.trim());
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'businessCategory')) {
    addUpdate('business_category', patch.businessCategory);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
    addUpdate('category', patch.category?.trim());
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'packType')) {
    addUpdate('pack_type', patch.packType?.trim());
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'unitsInPack')) {
    addUpdate('units_in_pack', patch.unitsInPack);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'packWeightKg')) {
    addUpdate('pack_weight_kg', patch.packWeightKg);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'shelfLifeDays')) {
    addUpdate('shelf_life_days', patch.shelfLifeDays);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'unitPriceRubVat')) {
    addUpdate('unit_price_rub_vat', patch.unitPriceRubVat);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'minStockUnits')) {
    addUpdate('min_stock_units', patch.minStockUnits);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxStockUnits')) {
    addUpdate('max_stock_units', patch.maxStockUnits);
  }

  if (!updates.length) {
    const current = await opsDb.query<ProductDbRow>(
      `
        SELECT id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units
        FROM stock_products
        WHERE id = $1
        LIMIT 1;
      `,
      [productId],
    );
    return current.rows[0] ? mapProduct(current.rows[0]) : null;
  }

  const nextBusinessCategory = patch.businessCategory ?? null;
  const nextCategory = patch.category?.trim() ?? null;
  if (nextBusinessCategory && nextCategory) {
    await ensureSubcategory(nextBusinessCategory, nextCategory);
  }

  params.push(productId);
  const result = await opsDb.query<ProductDbRow>(
    `
      UPDATE stock_products
      SET ${updates.join(', ')}
      WHERE id = $${index}
      RETURNING id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, min_stock_units, max_stock_units;
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
  params: { from?: string; to?: string; range?: 'week' | 'year'; kind?: StockValueKind },
): DateRange => {
  if (viewer.role === 'worker' && !(params.kind === 'inventory' && params.from && params.to)) {
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

export type StockValueKind = 'stock' | 'inventory';

const valuesTableFor = (kind: StockValueKind | undefined): string =>
  kind === 'inventory' ? 'inventory_values' : 'stock_values';

export const getStockTable = async (
  viewer: OpsTokenClaims,
  params: { shopId?: string; businessCategory?: BusinessCategory; from?: string; to?: string; range?: 'week' | 'year'; kind?: StockValueKind },
): Promise<StockTable | null> => {
  const valuesTable = valuesTableFor(params.kind);
  const range = resolveRequestedRange(viewer, params);
  const businessCategory =
    params.businessCategory && BUSINESS_CATEGORIES.includes(params.businessCategory) ? params.businessCategory : DEFAULT_BUSINESS_CATEGORY;
  const shop = await resolveRequestedShop(viewer, params.shopId);
  if (!shop) {
    return null;
  }

  const [productsResult, valuesResult, dashboardOverridesResult, subcategoriesResult] = await Promise.all([
    opsDb.query<ProductDbRow>(
      `
        SELECT id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat
               , min_stock_units, max_stock_units, inventory_price_rub
        FROM stock_products
        WHERE business_category = $1
        ORDER BY created_at ASC, name ASC;
      `,
      [businessCategory],
    ),
    opsDb.query<ValueDbRow>(
      `
        SELECT product_id, day_date::text AS day_date, value
        FROM ${valuesTable}
        WHERE shop_id = $1
          AND day_date >= $2::date
          AND day_date <= $3::date
        ORDER BY day_date ASC;
      `,
      [shop.id, range.from, range.to],
    ),
    params.kind === 'inventory' ? Promise.resolve({ rows: [] as DashboardOverrideDbRow[] }) : opsDb.query<DashboardOverrideDbRow>(
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
    opsDb.query<SubcategoryDbRow>(
      `
        SELECT name
        FROM stock_product_subcategories
        WHERE business_category = $1
        ORDER BY created_at ASC, name ASC;
      `,
      [businessCategory],
    ),
  ]);

  const isInventory = params.kind === 'inventory';
  const productIds = new Set(productsResult.rows.map((product: ProductDbRow) => product.id));
  const inventoryCounts: Record<string, string> = {};
  if (isInventory) {
    const countsResult = await opsDb.query<{ day_date: string; counted_at: Date }>(
      `
        SELECT day_date::text AS day_date, counted_at
        FROM inventory_counts
        WHERE shop_id = $1
          AND business_category = $2
          AND day_date >= $3::date
          AND day_date <= $4::date;
      `,
      [shop.id, businessCategory, range.from, range.to],
    );
    for (const item of countsResult.rows) {
      inventoryCounts[item.day_date] = new Date(item.counted_at).toISOString();
    }
  }
  const dates = isInventory && viewer.role === 'manager' && !(params.from && params.to && params.from === params.to)
    ? [...new Set([
        ...Object.keys(inventoryCounts),
        ...valuesResult.rows.filter((item: ValueDbRow) => productIds.has(item.product_id)).map((item: ValueDbRow) => item.day_date),
      ])].sort()
    : buildDateRange(range.from, range.to);
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

  const rows: StockTableRow[] = productsResult.rows.map((product: ProductDbRow) => {
    const values: Record<string, string> = {};
    for (const date of dates) {
      values[date] = byProductAndDate.get(`${product.id}:${date}`) ?? '';
    }
    return {
      productId: product.id,
      name: product.name,
      businessCategory: product.business_category && BUSINESS_CATEGORIES.includes(product.business_category) ? product.business_category : businessCategory,
      category: product.category?.trim() || DEFAULT_PRODUCT_CATEGORY,
      packType: product.pack_type,
      unitsInPack: product.units_in_pack,
      packWeightKg: toNullableNumber(product.pack_weight_kg),
      shelfLifeDays: product.shelf_life_days,
      unitPriceRubVat: toNullableNumber(product.unit_price_rub_vat),
      minStockUnits: product.min_stock_units,
      maxStockUnits: product.max_stock_units,
      ...(isInventory ? { inventoryPrice: toNullableNumber(product.inventory_price_rub ?? null) } : {}),
      values,
      dashboardOverrides: dashboardOverridesByProduct.get(product.id),
    };
  });

  return {
    shop,
    businessCategory,
    subcategories: subcategoriesResult.rows.map((row: SubcategoryDbRow) => row.name),
    from: range.from,
    to: range.to,
    dates,
    rows,
    ...(isInventory ? { inventoryCounts } : {}),
  };
};

const MAX_STOCK_VALUE = 50;
const MAX_INVENTORY_VALUE = 9999;

const sanitizeStockValue = (raw: string, max = MAX_STOCK_VALUE): string => {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) {
    return '';
  }
  const parsed = Number.parseInt(digits, 10);
  if (Number.isNaN(parsed)) {
    return '';
  }
  return String(Math.min(max, Math.max(0, parsed)));
};

export const upsertStockValue = async (
  viewer: OpsTokenClaims,
  params: { shopId?: string; productId: string; date: string; value: string; kind?: StockValueKind; countedAt?: string },
): Promise<boolean> => {
  const isInventory = params.kind === 'inventory';
  const valuesTable = valuesTableFor(params.kind);
  if (viewer.role === 'worker' && params.shopId && !viewer.shopIds.includes(params.shopId)) {
    return false;
  }

  const targetShop = await resolveRequestedShop(viewer, params.shopId);
  if (!targetShop) {
    return false;
  }

  if (viewer.role === 'worker' && !viewer.shopIds.includes(targetShop.id)) {
    return false;
  }

  if (viewer.role === 'worker' && !isInventory) {
    const workerWeek = currentWeekRange();
    if (params.date < workerWeek.from || params.date > workerWeek.to) {
      return false;
    }
  }

  const productResult = await opsDb.query<{ id: string; business_category: BusinessCategory | null }>(
    `
      SELECT id, business_category
      FROM stock_products
      WHERE id = $1
      LIMIT 1;
    `,
    [params.productId],
  );
  const product = productResult.rows[0];
  if (!product) {
    return false;
  }

  if (isInventory) {
    await opsDb.query(
      `
        INSERT INTO inventory_counts (shop_id, business_category, day_date, counted_at, updated_at)
        VALUES ($1, $2, $3::date, $4::timestamptz, NOW())
        ON CONFLICT (shop_id, business_category, day_date)
        DO UPDATE SET counted_at = EXCLUDED.counted_at, updated_at = NOW();
      `,
      [targetShop.id, product.business_category ?? DEFAULT_BUSINESS_CATEGORY, params.date, params.countedAt ?? new Date().toISOString()],
    );
  }

  const sanitized = sanitizeStockValue(params.value, isInventory ? MAX_INVENTORY_VALUE : MAX_STOCK_VALUE);
  if (!sanitized) {
    await opsDb.query(
      `
        DELETE FROM ${valuesTable}
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
      INSERT INTO ${valuesTable} (shop_id, product_id, day_date, value, updated_at)
      VALUES ($1, $2, $3::date, $4::integer, NOW())
      ON CONFLICT (shop_id, product_id, day_date)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `,
    [targetShop.id, params.productId, params.date, Number.parseInt(sanitized, 10)],
  );
  return true;
};
