import { opsDb } from '../db/opsDb';
import { DEFAULT_BUSINESS_CATEGORY } from '../domain/types';
import type { BusinessCategory, Shop } from '../domain/types';

export type OrderSheetRow = {
  productId: string;
  productName: string;
  category: string;
  businessCategory: BusinessCategory;
  packType: string | null;
  unitsInPack: number | null;
  packWeightKg: number | null;
  shelfLifeDays: number | null;
  unitPriceRubVat: number | null;
  shopValues: Record<string, number>;
  total: number;
};

export type OrderSheet = {
  date: string;
  shops: Shop[];
  rows: OrderSheetRow[];
};

type AggRow = {
  product_id: string;
  shop_id: string;
  packs: number;
};

export type OrderSheetValueEntry = {
  shopId: string;
  productId: string;
  orderDate: string;
  packs: number;
};

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  business_category: BusinessCategory | null;
  pack_type: string | null;
  units_in_pack: number | null;
  pack_weight_kg: number | string | null;
  shelf_life_days: number | null;
  unit_price_rub_vat: number | string | null;
};

const toNullableNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

export const getOrderSheet = async (date: string, businessCategory: BusinessCategory = DEFAULT_BUSINESS_CATEGORY): Promise<OrderSheet> => {
  const [shopsResult, productsResult, ordersResult] = await Promise.all([
    opsDb.query<{ id: string; name: string; machine_number: number }>(
      `SELECT id, name, machine_number FROM shops ORDER BY machine_number ASC, created_at ASC, name ASC;`,
    ),
    opsDb.query<ProductRow>(
      `SELECT id, name, business_category, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat
       FROM stock_products
       WHERE business_category = $1
       ORDER BY created_at ASC, name ASC;`,
      [businessCategory],
    ),
    opsDb.query<AggRow>(
      `SELECT product_id, shop_id, packs
       FROM order_sheet_values
       WHERE order_date = $1::date;`,
      [date],
    ),
  ]);

  const shops: Shop[] = shopsResult.rows.map((r: { id: string; name: string; machine_number: number }) => ({
    id: r.id,
    name: r.name,
    machineNumber: r.machine_number,
  }));

  const orderMap = new Map<string, number>();
  for (const row of ordersResult.rows) {
    orderMap.set(`${row.product_id}:${row.shop_id}`, row.packs);
  }

  const rows: OrderSheetRow[] = productsResult.rows.map((product: ProductRow) => {
    const shopValues: Record<string, number> = {};
    let total = 0;
    for (const shop of shops) {
      const val = orderMap.get(`${product.id}:${shop.id}`) ?? 0;
      if (val > 0) {
        shopValues[shop.id] = val;
        total += val;
      }
    }
    return {
      productId: product.id,
      productName: product.name,
      category: product.category ?? 'Йогурты',
      businessCategory: product.business_category ?? businessCategory,
      packType: product.pack_type,
      unitsInPack: product.units_in_pack,
      packWeightKg: toNullableNumber(product.pack_weight_kg),
      shelfLifeDays: product.shelf_life_days,
      unitPriceRubVat: toNullableNumber(product.unit_price_rub_vat),
      shopValues,
      total,
    };
  });

  return { date, shops, rows };
};

export const listOrderSheetValues = async (
  shopId: string,
  from: string,
  to: string,
  businessCategory?: BusinessCategory,
): Promise<OrderSheetValueEntry[]> => {
  const params: unknown[] = [shopId, from, to];
  const businessFilter = businessCategory
    ? `AND EXISTS (
        SELECT 1 FROM stock_products sp
        WHERE sp.id = order_sheet_values.product_id
          AND sp.business_category = $4
      )`
    : '';
  if (businessCategory) {
    params.push(businessCategory);
  }
  const result = await opsDb.query<{ shop_id: string; product_id: string; order_date: string; packs: number }>(
    `
      SELECT shop_id, product_id, order_date::text AS order_date, packs
      FROM order_sheet_values
      WHERE shop_id = $1
        AND order_date >= $2::date
        AND order_date <= $3::date
        ${businessFilter}
      ORDER BY order_date ASC;
    `,
    params,
  );

  return result.rows.map((row: { shop_id: string; product_id: string; order_date: string; packs: number }) => ({
    shopId: row.shop_id,
    productId: row.product_id,
    orderDate: row.order_date,
    packs: row.packs,
  }));
};

export const upsertOrderSheetValue = async (
  params: { shopId: string; productId: string; date: string; value: string },
): Promise<boolean> => {
  const shopResult = await opsDb.query<{ id: string }>(
    `SELECT id FROM shops WHERE id = $1 LIMIT 1;`,
    [params.shopId],
  );
  if (!shopResult.rows[0]) {
    return false;
  }

  const productResult = await opsDb.query<{ id: string }>(
    `SELECT id FROM stock_products WHERE id = $1 LIMIT 1;`,
    [params.productId],
  );
  if (!productResult.rows[0]) {
    return false;
  }

  const packs = Number.parseInt(params.value, 10);
  if (!params.value || Number.isNaN(packs) || packs <= 0) {
    await opsDb.query(
      `
        DELETE FROM order_sheet_values
        WHERE shop_id = $1
          AND product_id = $2
          AND order_date = $3::date;
      `,
      [params.shopId, params.productId, params.date],
    );
    return true;
  }

  await opsDb.query(
    `
      INSERT INTO order_sheet_values (shop_id, product_id, order_date, packs, updated_at)
      VALUES ($1, $2, $3::date, $4, NOW())
      ON CONFLICT (shop_id, product_id, order_date)
      DO UPDATE SET packs = EXCLUDED.packs, updated_at = NOW();
    `,
    [params.shopId, params.productId, params.date, packs],
  );
  return true;
};
