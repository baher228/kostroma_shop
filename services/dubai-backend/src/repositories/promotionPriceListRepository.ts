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

const id = () => `promo_price_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
      await client.query('ROLLBACK');
      throw error;
    }
  });
};
