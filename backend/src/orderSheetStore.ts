import { db } from './db';
import { Shop } from './types';

export type OrderSheetRow = {
  productId: string;
  productName: string;
  category: string;
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
  total_packs: string;
};

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  pack_type: string | null;
  units_in_pack: number | null;
  pack_weight_kg: number | null;
  shelf_life_days: number | null;
  unit_price_rub_vat: number | null;
};

export const getOrderSheet = async (date: string): Promise<OrderSheet> => {
  const [shopsResult, productsResult, ordersResult] = await Promise.all([
    db.query<{ id: string; name: string }>(
      `SELECT id, name FROM shops ORDER BY created_at ASC, name ASC;`,
    ),
    db.query<ProductRow>(
      `SELECT id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat
       FROM stock_products
       ORDER BY created_at ASC, name ASC;`,
    ),
    db.query<AggRow>(
      `SELECT product_id, shop_id, SUM(requested_packs)::text AS total_packs
       FROM seller_orders
       WHERE created_at::date = $1::date
       GROUP BY product_id, shop_id;`,
      [date],
    ),
  ]);

  const shops: Shop[] = shopsResult.rows.map((r) => ({ id: r.id, name: r.name }));

  const orderMap = new Map<string, number>();
  for (const row of ordersResult.rows) {
    orderMap.set(`${row.product_id}:${row.shop_id}`, Number(row.total_packs));
  }

  const rows: OrderSheetRow[] = productsResult.rows.map((product) => {
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
      packType: product.pack_type,
      unitsInPack: product.units_in_pack,
      packWeightKg: product.pack_weight_kg,
      shelfLifeDays: product.shelf_life_days,
      unitPriceRubVat: product.unit_price_rub_vat,
      shopValues,
      total,
    };
  });

  return { date, shops, rows };
};
