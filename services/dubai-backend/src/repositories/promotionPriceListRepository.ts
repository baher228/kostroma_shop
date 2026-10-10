import { opsDb } from '../db/opsDb';

export type PromotionPriceListItemInput = {
  sourceDocumentId: string;
  sourceFileName: string;
  sourceRowNumber: number;
  category: string | null;
  productNameRaw: string | null;
  productNameClean: string;
  normalizedProductName: string;
  regularPrice: number;
};

export type PromotionPriceListItem = {
  id: string;
  productName: string;
  productNameRaw: string | null;
  productNameClean: string;
  normalizedProductName: string;
  regularPrice: number;
};

type PromotionPriceListItemRow = {
  id: string;
  product_name: string | null;
  product_name_raw: string | null;
  product_name_clean: string | null;
  normalized_product_name: string;
  regular_price: string | number;
};

const id = () => `promo_price_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const listPromotionPriceListItems = async (): Promise<PromotionPriceListItem[]> => {
  const result = await opsDb.query<PromotionPriceListItemRow>(
    `SELECT id, product_name, product_name_raw, product_name_clean, normalized_product_name, regular_price
     FROM promotion_price_list_items
     WHERE normalized_product_name IS NOT NULL AND regular_price IS NOT NULL;`,
  );
  return result.rows.map((row: PromotionPriceListItemRow) => ({
    id: row.id,
    productName: row.product_name_clean || row.product_name || '',
    productNameRaw: row.product_name_raw,
    productNameClean: row.product_name_clean || row.product_name || '',
    normalizedProductName: row.normalized_product_name,
    regularPrice: Number(row.regular_price),
  }));
};

export const hasPromotionPriceListItems = async (): Promise<boolean> => {
  const result = await opsDb.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM promotion_price_list_items
       WHERE normalized_product_name IS NOT NULL
         AND regular_price IS NOT NULL
       LIMIT 1
     ) AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

export const upsertPromotionPriceListItems = async (items: PromotionPriceListItemInput[]): Promise<number> => {
  if (!items.length) return 0;

  return opsDb.withClient(async (client) => {
    await client.query('BEGIN');
    try {
      for (const item of items) {
        await client.query(
          `INSERT INTO promotion_price_list_items (
             id,
             source_document_id,
             source_row_number,
             category,
           product_name_raw,
           product_name_clean,
           product_name,
           normalized_product_name,
           regular_price,
           source_file_name,
           created_at,
           updated_at
         )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
           ON CONFLICT (normalized_product_name)
           DO UPDATE SET
             source_document_id = EXCLUDED.source_document_id,
             source_row_number = EXCLUDED.source_row_number,
             category = EXCLUDED.category,
             product_name_raw = EXCLUDED.product_name_raw,
             product_name_clean = EXCLUDED.product_name_clean,
             product_name = EXCLUDED.product_name,
             regular_price = EXCLUDED.regular_price,
             source_file_name = EXCLUDED.source_file_name,
             updated_at = NOW();`,
          [
            id(),
            item.sourceDocumentId,
            item.sourceRowNumber,
            item.category,
            item.productNameRaw,
            item.productNameClean,
            item.productNameClean,
            item.normalizedProductName,
            item.regularPrice,
            item.sourceFileName,
          ],
        );
      }
      await client.query('COMMIT');
      return items.length;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  });
};
