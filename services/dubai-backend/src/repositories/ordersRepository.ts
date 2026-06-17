import { opsDb } from '../db/opsDb';
import { OpsTokenClaims, SellerOrder } from '../domain/types';

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

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const nearestOrderSheetDate = (from = new Date()): string => {
  const allowedDays = new Set([2, 4, 6]);
  const target = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (!allowedDays.has(target.getDay())) {
    target.setDate(target.getDate() + 1);
  }
  return toDateKey(target);
};

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
  const result = await opsDb.query<SellerOrderRow>(
    `
      WITH inserted AS (
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
          product_id,
          stock_on_hand,
          requested_packs,
          requested_units,
          auto_suggested,
          status,
          created_at
      ),
      sheet_upsert AS (
        INSERT INTO order_sheet_values (shop_id, product_id, order_date, packs, updated_at)
        SELECT shop_id, product_id, $9::date, requested_packs, NOW()
        FROM inserted
        ON CONFLICT (shop_id, product_id, order_date)
        DO UPDATE SET packs = order_sheet_values.packs + EXCLUDED.packs, updated_at = NOW()
        RETURNING 1
      )
      SELECT
        i.id,
        i.shop_id,
        s.name AS shop_name,
        i.product_id,
        sp.name AS product_name,
        i.stock_on_hand,
        i.requested_packs,
        i.requested_units,
        i.auto_suggested,
        i.status,
        i.created_at
      FROM inserted i
      JOIN stock_products sp ON sp.id = i.product_id
      LEFT JOIN shops s ON s.id = i.shop_id
      CROSS JOIN (SELECT count(*) FROM sheet_upsert) sheet_write;
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
      nearestOrderSheetDate(),
    ],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
};

export const updateSellerOrderStatus = async (
  viewer: OpsTokenClaims,
  orderId: string,
  status: 'new' | 'processed',
): Promise<SellerOrder | null> => {
  const params: unknown[] = [status, orderId];
  const conditions = ['o.id = $2'];

  if (viewer.role === 'worker' || viewer.shopIds.length > 0) {
    params.push(viewer.shopIds);
    conditions.push(`o.shop_id = ANY($${params.length}::text[])`);
  }

  const result = await opsDb.query<SellerOrderRow>(
    `
      UPDATE seller_orders o
      SET status = $1
      WHERE ${conditions.join(' AND ')}
      RETURNING
        o.id,
        o.shop_id,
        NULL::text AS shop_name,
        o.product_id,
        ''::text AS product_name,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.status,
        o.created_at;
    `,
    params,
  );
  if (!result.rows[0]) {
    return null;
  }

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
    [result.rows[0].id],
  );
  return resolved.rows[0] ? mapOrder(resolved.rows[0]) : null;
};
