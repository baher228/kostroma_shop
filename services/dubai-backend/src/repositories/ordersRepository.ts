import { opsDb } from '../db/opsDb';
import { DEFAULT_BUSINESS_CATEGORY } from '../domain/types';
import type { BusinessCategory, OpsTokenClaims, SellerOrder } from '../domain/types';
import type { PoolClient } from 'pg';

type SellerOrderRow = {
  id: string;
  shop_id: string;
  shop_name: string | null;
  product_id: string;
  product_name: string;
  business_category: BusinessCategory | null;
  stock_on_hand: number | null;
  requested_packs: number;
  requested_units: number;
  auto_suggested: boolean;
  order_date: string | null;
  status: 'new' | 'processed';
  created_at: Date | string;
};

const mapOrder = (row: SellerOrderRow): SellerOrder => ({
  id: row.id,
  shopId: row.shop_id,
  shopName: row.shop_name,
  productId: row.product_id,
  productName: row.product_name,
  businessCategory: row.business_category ?? DEFAULT_BUSINESS_CATEGORY,
  stockOnHand: row.stock_on_hand,
  requestedPacks: row.requested_packs,
  requestedUnits: row.requested_units,
  autoSuggested: row.auto_suggested,
  orderDate: row.order_date,
  status: row.status,
  createdAt: new Date(row.created_at).toISOString(),
});

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const nearestOrderSheetDate = (from = new Date(), businessCategory: BusinessCategory = DEFAULT_BUSINESS_CATEGORY): string => {
  if (businessCategory !== 'Молоко') {
    const tomorrow = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toDateKey(tomorrow);
  }
  const allowedDays = new Set([2, 4, 6]);
  const target = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  target.setDate(target.getDate() + 1);
  while (!allowedDays.has(target.getDay())) {
    target.setDate(target.getDate() + 1);
  }
  return toDateKey(target);
};

export const listSellerOrders = async (
  viewer: OpsTokenClaims,
  businessCategory: BusinessCategory = DEFAULT_BUSINESS_CATEGORY,
): Promise<SellerOrder[]> => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (viewer.role === 'worker' || viewer.shopIds.length > 0) {
    params.push(viewer.shopIds);
    conditions.push(`o.shop_id = ANY($${params.length}::text[])`);
  }

  params.push(businessCategory);
  conditions.push(`sp.business_category = $${params.length}`);

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await opsDb.query<SellerOrderRow>(
    `
      SELECT
        o.id,
        o.shop_id,
        s.name AS shop_name,
        o.product_id,
        sp.name AS product_name,
        sp.business_category,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.order_date::text AS order_date,
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
    businessCategory?: BusinessCategory;
    productId: string;
    stockOnHand?: number | null;
    requestedPacks: number;
    requestedUnits: number;
    autoSuggested: boolean;
    orderDate?: string;
  },
): Promise<SellerOrder | null> => {
  if (viewer.role === 'worker' && !viewer.shopIds.includes(input.shopId)) {
    return null;
  }

  const businessCategory = input.businessCategory ?? DEFAULT_BUSINESS_CATEGORY;
  const targetOrderDate = input.orderDate ?? nearestOrderSheetDate(new Date(), businessCategory);

  const shop = await opsDb.query<{ id: string }>(
    `
      SELECT id
      FROM shops
      WHERE id = $1
      LIMIT 1;
    `,
    [input.shopId],
  );
  if (!shop.rows[0]) {
    return null;
  }

  const product = await opsDb.query<{ id: string }>(
    `
      SELECT id
      FROM stock_products
      WHERE id = $1
        AND business_category = $2
      LIMIT 1;
    `,
    [input.productId, businessCategory],
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
          order_date,
          status,
          request_jti,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,'new',$9,NOW())
        RETURNING
          id,
          shop_id,
          product_id,
          stock_on_hand,
          requested_packs,
          requested_units,
          auto_suggested,
          order_date::text AS order_date,
          status,
          created_at
      ),
      sheet_upsert AS (
        INSERT INTO order_sheet_values (shop_id, product_id, order_date, packs, updated_at)
        SELECT shop_id, product_id, $8::date, requested_packs, NOW()
        FROM inserted
        ON CONFLICT (shop_id, product_id, order_date)
        DO UPDATE SET packs = EXCLUDED.packs, updated_at = NOW()
        RETURNING 1
      )
      SELECT
        i.id,
        i.shop_id,
        s.name AS shop_name,
        i.product_id,
        sp.name AS product_name,
        sp.business_category,
        i.stock_on_hand,
        i.requested_packs,
        i.requested_units,
        i.auto_suggested,
        i.order_date,
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
        targetOrderDate,
        viewer.jti,
      ],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
};

export type SellerOrderBulkItem = {
  productId: string;
  stockOnHand?: number | null;
  requestedPacks: number;
  requestedUnits: number;
  autoSuggested: boolean;
};

const createSellerOrderId = (): string => `order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const assertShopAndProducts = async (
  client: Pick<PoolClient, 'query'>,
  shopId: string,
  productIds: string[],
  businessCategory: BusinessCategory,
): Promise<boolean> => {
  const shop = await client.query<{ id: string }>(
    `SELECT id FROM shops WHERE id = $1 LIMIT 1;`,
    [shopId],
  );
  if (!shop.rows[0]) {
    return false;
  }
  if (!productIds.length) {
    return true;
  }
  const products = await client.query<{ id: string }>(
    `SELECT id FROM stock_products WHERE id = ANY($1::text[]) AND business_category = $2;`,
    [productIds, businessCategory],
  );
  return new Set(products.rows.map((row) => row.id)).size === new Set(productIds).size;
};

export const createSellerOrderBulk = async (
  viewer: OpsTokenClaims,
  input: {
    shopId: string;
    businessCategory?: BusinessCategory;
    orderDate: string;
    items: SellerOrderBulkItem[];
  },
): Promise<SellerOrder[] | null> => {
  if (viewer.role === 'worker' && !viewer.shopIds.includes(input.shopId)) {
    return null;
  }

  return opsDb.withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const businessCategory = input.businessCategory ?? DEFAULT_BUSINESS_CATEGORY;
      const productIds = input.items.map((item) => item.productId);
      const ok = await assertShopAndProducts(client, input.shopId, productIds, businessCategory);
      if (!ok) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `
          DELETE FROM order_sheet_values
          WHERE shop_id = $1
            AND order_date = $2::date
            AND EXISTS (
              SELECT 1
              FROM stock_products sp
              WHERE sp.id = order_sheet_values.product_id
                AND sp.business_category = $3
            );
        `,
        [input.shopId, input.orderDate, businessCategory],
      );

      const created: SellerOrder[] = [];
      for (const item of input.items) {
        await client.query(
          `
            INSERT INTO order_sheet_values (shop_id, product_id, order_date, packs, updated_at)
            VALUES ($1, $2, $3::date, $4, NOW());
          `,
          [input.shopId, item.productId, input.orderDate, item.requestedPacks],
        );

        const id = createSellerOrderId();
        const result = await client.query<SellerOrderRow>(
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
                order_date,
                status,
                request_jti,
                created_at
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,'new',$9,NOW())
              RETURNING
                id,
                shop_id,
                product_id,
                stock_on_hand,
                requested_packs,
                requested_units,
                auto_suggested,
                order_date::text AS order_date,
                status,
                created_at
            )
            SELECT
              i.id,
              i.shop_id,
              s.name AS shop_name,
              i.product_id,
              sp.name AS product_name,
              sp.business_category,
              i.stock_on_hand,
              i.requested_packs,
              i.requested_units,
              i.auto_suggested,
              i.order_date,
              i.status,
              i.created_at
            FROM inserted i
            JOIN stock_products sp ON sp.id = i.product_id
            LEFT JOIN shops s ON s.id = i.shop_id;
          `,
          [
            id,
            input.shopId,
            item.productId,
            item.stockOnHand ?? null,
            item.requestedPacks,
            item.requestedUnits,
            item.autoSuggested,
            input.orderDate,
            viewer.jti,
          ],
        );
        if (result.rows[0]) {
          created.push(mapOrder(result.rows[0]));
        }
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
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
        NULL::text AS business_category,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.order_date::text AS order_date,
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
        sp.business_category,
        o.stock_on_hand,
        o.requested_packs,
        o.requested_units,
        o.auto_suggested,
        o.order_date::text AS order_date,
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
