import { opsDb } from './opsDb';
import { OpsTokenClaims, SellerOrder } from './types';

type SellerOrderRow = {
  id: string;
  shop_id: string;
  shop_name: string | null;
  product_id: string;
  product_name: string;
  stock_on_hand: number | null;
  requested_packs: number;
  requested_units: number;
  auto_suggested: boolean;
  status: 'new' | 'processed';
  created_at: Date | string;
};

const mapOrder = (row: SellerOrderRow): SellerOrder => ({
  id: row.id,
  shopId: row.shop_id,
  shopName: row.shop_name,
  productId: row.product_id,
  productName: row.product_name,
  stockOnHand: row.stock_on_hand,
  requestedPacks: row.requested_packs,
  requestedUnits: row.requested_units,
  autoSuggested: row.auto_suggested,
  status: row.status,
  createdAt: new Date(row.created_at).toISOString(),
});

export const listSellerOrders = async (viewer: OpsTokenClaims): Promise<SellerOrder[]> => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (viewer.role === 'worker' || viewer.shopIds.length > 0) {
    params.push(viewer.shopIds);
    conditions.push(`o.shop_id = ANY($${params.length}::text[])`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await opsDb.query<SellerOrderRow>(
    `
      SELECT
        o.id,
        o.shop_id,
        s.name AS shop_name,
        o.product_id,
        sp.name AS product_name,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.status,
        o.created_at
      FROM seller_orders o
      JOIN stock_products sp ON sp.id = o.product_id
      LEFT JOIN shops s ON s.id = o.shop_id
      ${whereClause}
      ORDER BY o.created_at DESC, o.id DESC;
    `,
    params,
  );
  return result.rows.map(mapOrder);
};

export const createSellerOrder = async (
  viewer: OpsTokenClaims,
  input: {
    shopId: string;
    productId: string;
    stockOnHand?: number | null;
    requestedPacks: number;
    requestedUnits: number;
    autoSuggested: boolean;
  },
): Promise<SellerOrder | null> => {
  if (viewer.role === 'worker' && !viewer.shopIds.includes(input.shopId)) {
    return null;
  }

  const product = await opsDb.query<{ id: string }>(
    `
      SELECT id
      FROM stock_products
      WHERE id = $1
      LIMIT 1;
    `,
    [input.productId],
  );
  if (!product.rows[0]) {
    return null;
  }

  const id = `order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inserted = await opsDb.query<SellerOrderRow>(
    `
      INSERT INTO seller_orders (
        id,
        shop_id,
        product_id,
        stock_on_hand,
        requested_packs,
        requested_units,
        auto_suggested,
        status,
        request_jti,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,NOW())
      RETURNING
        id,
        shop_id,
        NULL::text AS shop_name,
        product_id,
        ''::text AS product_name,
        stock_on_hand,
        requested_packs,
        requested_units,
        auto_suggested,
        status,
        created_at;
    `,
    [
      id,
      input.shopId,
      input.productId,
      input.stockOnHand ?? null,
      input.requestedPacks,
      input.requestedUnits,
      input.autoSuggested,
      viewer.jti,
    ],
  );

  const resolved = await opsDb.query<SellerOrderRow>(
    `
      SELECT
        o.id,
        o.shop_id,
        s.name AS shop_name,
        o.product_id,
        sp.name AS product_name,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.status,
        o.created_at
      FROM seller_orders o
      JOIN stock_products sp ON sp.id = o.product_id
      LEFT JOIN shops s ON s.id = o.shop_id
      WHERE o.id = $1
      LIMIT 1;
    `,
    [inserted.rows[0].id],
  );
  return resolved.rows[0] ? mapOrder(resolved.rows[0]) : null;
};
