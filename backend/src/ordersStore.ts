import { db } from './db';
import { SellerOrder, SessionUser } from './types';

type SellerOrderRow = {
  id: string;
  worker_id: string;
  worker_display_name: string;
  shop_id: string;
  shop_name: string | null;
  product_id: string;
  product_name: string;
  stock_on_hand: number | null;
  requested_packs: number;
  requested_units: number;
  auto_suggested: boolean;
  note: string | null;
  status: 'new' | 'processed';
  created_at: Date | string;
};

const mapOrder = (row: SellerOrderRow): SellerOrder => ({
  id: row.id,
  workerId: row.worker_id,
  workerDisplayName: row.worker_display_name,
  shopId: row.shop_id,
  shopName: row.shop_name,
  productId: row.product_id,
  productName: row.product_name,
  stockOnHand: row.stock_on_hand,
  requestedPacks: row.requested_packs,
  requestedUnits: row.requested_units,
  autoSuggested: row.auto_suggested,
  note: row.note,
  status: row.status,
  createdAt: new Date(row.created_at).toISOString(),
});

export const listSellerOrders = async (viewer: SessionUser): Promise<SellerOrder[]> => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (viewer.role === 'worker') {
    params.push(viewer.id);
    conditions.push(`o.worker_id = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.query<SellerOrderRow>(
    `
      SELECT
        o.id,
        o.worker_id,
        o.worker_display_name,
        o.shop_id,
        s.name AS shop_name,
        o.product_id,
        sp.name AS product_name,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.note,
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
  viewer: SessionUser,
  input: {
    shopId: string;
    productId: string;
    stockOnHand?: number | null;
    requestedPacks: number;
    requestedUnits: number;
    autoSuggested: boolean;
    note?: string | null;
  },
): Promise<SellerOrder | null> => {
  const product = await db.query<{ id: string }>(
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

  const workerShopId = viewer.shopId;
  if (viewer.role === 'worker' && workerShopId && workerShopId !== input.shopId) {
    return null;
  }
  if (viewer.role === 'worker' && !workerShopId) {
    return null;
  }

  const id = `order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inserted = await db.query<SellerOrderRow>(
    `
      INSERT INTO seller_orders (
        id,
        worker_id,
        worker_display_name,
        shop_id,
        product_id,
        stock_on_hand,
        requested_packs,
        requested_units,
        auto_suggested,
        note,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',NOW())
      RETURNING
        id,
        worker_id,
        worker_display_name,
        shop_id,
        NULL::text AS shop_name,
        product_id,
        ''::text AS product_name,
        stock_on_hand,
        requested_packs,
        requested_units,
        auto_suggested,
        note,
        status,
        created_at;
    `,
    [
      id,
      viewer.id,
      viewer.fullName,
      input.shopId,
      input.productId,
      input.stockOnHand ?? null,
      input.requestedPacks,
      input.requestedUnits,
      input.autoSuggested,
      input.note?.trim() || null,
    ],
  );

  const resolved = await db.query<SellerOrderRow>(
    `
      SELECT
        o.id,
        o.worker_id,
        o.worker_display_name,
        o.shop_id,
        s.name AS shop_name,
        o.product_id,
        sp.name AS product_name,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.note,
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
