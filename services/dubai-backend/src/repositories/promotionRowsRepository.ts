import { opsDb } from '../db/opsDb';

export type PromotionRowStatus = 'past' | 'current' | 'future';

export type PromotionTableRow = {
  id: string;
  rowNumber: number;
  status: PromotionRowStatus;
  productName: string;
  startDate: string | null;
  endDate: string | null;
  promoPrice: number | null;
  regularPrice: number | null;
  priceDifference: number | null;
  realDiscountPercent: number | null;
  advertisingDiscountPercent: number | null;
  sourceDocumentId: string | null;
  sourceDocumentFileName: string | null;
  invoiceDocumentId: string | null;
  invoiceDocumentFileName: string | null;
  planDocumentId: string | null;
  planDocumentFileName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromotionRowInput = {
  status: PromotionRowStatus;
  productName: string;
  startDate: string | null;
  endDate: string | null;
  promoPrice: number | null;
  regularPrice: number | null;
};

export type PromotionDocumentRowInput = PromotionRowInput & {
  sourceDocumentId: string;
  sourceDocumentFileName: string;
  sourceProductName: string;
  sourceLineText: string;
  priceListItemId: string | null;
  matchConfidence: number | null;
};

type PromotionTableRowDb = {
  id: string;
  row_number: number;
  status: PromotionRowStatus;
  product_name: string;
  start_date: Date | string | null;
  end_date: Date | string | null;
  promo_price: string | number | null;
  regular_price: string | number | null;
  price_difference: string | number | null;
  real_discount_percent: string | number | null;
  advertising_discount_percent: string | number | null;
  source_document_id: string | null;
  source_document_file_name: string | null;
  invoice_document_id: string | null;
  invoice_document_file_name: string | null;
  plan_document_id: string | null;
  plan_document_file_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const dateOnly = (value: Date | string | null) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
};

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const num = (value: string | number | null) => (value === null ? null : Number(value));

const todayKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const promotionStatusForPeriod = (
  storedStatus: PromotionRowStatus,
  startDate: string | null,
  endDate: string | null,
): PromotionRowStatus => {
  if (!startDate && !endDate) return storedStatus;
  const today = todayKey();
  if (endDate && endDate < today) return 'past';
  if (startDate && startDate > today) return 'future';
  return 'current';
};

const mapRow = (row: PromotionTableRowDb): PromotionTableRow => {
  const startDate = dateOnly(row.start_date);
  const endDate = dateOnly(row.end_date);
  return {
    id: row.id,
    rowNumber: Number(row.row_number),
    status: promotionStatusForPeriod(row.status, startDate, endDate),
    productName: row.product_name,
    startDate,
    endDate,
    promoPrice: num(row.promo_price),
    regularPrice: num(row.regular_price),
    priceDifference: num(row.price_difference),
    realDiscountPercent: num(row.real_discount_percent),
    advertisingDiscountPercent: num(row.advertising_discount_percent),
    sourceDocumentId: row.source_document_id,
    sourceDocumentFileName: row.source_document_file_name,
    invoiceDocumentId: row.invoice_document_id,
    invoiceDocumentFileName: row.invoice_document_file_name,
    planDocumentId: row.plan_document_id,
    planDocumentFileName: row.plan_document_file_name,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
};

const id = () => `promo_row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const listPromotionRows = async (): Promise<PromotionTableRow[]> => {
  const result = await opsDb.query<PromotionTableRowDb>(
    'SELECT * FROM promotion_table_rows ORDER BY row_number ASC;',
  );
  return result.rows.map(mapRow);
};

export const getPromotionRowByNumber = async (rowNumber: number): Promise<PromotionTableRow | null> => {
  const result = await opsDb.query<PromotionTableRowDb>(
    'SELECT * FROM promotion_table_rows WHERE row_number = $1 LIMIT 1;',
    [rowNumber],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
};

export const createPromotionRow = async (input: PromotionRowInput): Promise<PromotionTableRow> => {
  const next = await opsDb.query<{ row_number: number }>(
    'SELECT COALESCE(MAX(row_number), 0) + 1 AS row_number FROM promotion_table_rows;',
  );
  const rowNumber = Number(next.rows[0]?.row_number ?? 1);
  const result = await opsDb.query<PromotionTableRowDb>(
    `INSERT INTO promotion_table_rows (id, row_number, status, product_name, start_date, end_date, promo_price, regular_price, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,NOW(),NOW())
     RETURNING *;`,
    [id(), rowNumber, input.status, input.productName, input.startDate, input.endDate, input.promoPrice, input.regularPrice],
  );
  return mapRow(result.rows[0]);
};

export const upsertPromotionDocumentRows = async (
  items: PromotionDocumentRowInput[],
  sourceType: 'invoice' | 'plan',
): Promise<PromotionTableRow[]> => {
  if (!items.length) return [];

  return opsDb.withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const next = await client.query<{ row_number: number }>(
        'SELECT COALESCE(MAX(row_number), 0) + 1 AS row_number FROM promotion_table_rows;',
      );
      let rowNumber = Number(next.rows[0]?.row_number ?? 1);
      const saved: PromotionTableRow[] = [];

      for (const item of items) {
        const existing = await client.query<PromotionTableRowDb>(
          `SELECT *
           FROM promotion_table_rows
           WHERE (
             ($1::text IS NOT NULL AND price_list_item_id = $1) OR
             ($1::text IS NULL AND LOWER(product_name) = LOWER($2))
           )
             AND (
               start_date IS NULL OR end_date IS NULL OR
               $3::date IS NULL OR $4::date IS NULL OR
               (start_date <= $4::date AND $3::date <= end_date)
             )
           ORDER BY
             CASE WHEN invoice_document_id IS NOT NULL THEN 0 ELSE 1 END,
             updated_at DESC
           LIMIT 1
           FOR UPDATE;`,
          [item.priceListItemId, item.productName, item.startDate, item.endDate],
        );

        const current = existing.rows[0];
        if (current) {
          if (sourceType === 'plan' && current.invoice_document_id) {
            const linked = await client.query<PromotionTableRowDb>(
              `UPDATE promotion_table_rows
               SET plan_document_id = $1,
                   plan_document_file_name = $2,
                   regular_price = COALESCE(regular_price, $3),
                   updated_at = NOW()
               WHERE id = $4
               RETURNING *;`,
              [item.sourceDocumentId, item.sourceDocumentFileName, item.regularPrice, current.id],
            );
            saved.push(mapRow(linked.rows[0]));
            continue;
          }

          const updated = await client.query<PromotionTableRowDb>(
            `UPDATE promotion_table_rows
             SET status = $1,
                 product_name = $2,
                 start_date = $3::date,
                 end_date = $4::date,
                 promo_price = $5,
                 regular_price = $6,
                 source_document_id = $7,
                 source_document_file_name = $8,
                 source_product_name = $9,
                 source_line_text = $10,
                 price_list_item_id = $11,
                 match_confidence = $12,
                 invoice_document_id = CASE WHEN $13 = 'invoice' THEN $7 ELSE invoice_document_id END,
                 invoice_document_file_name = CASE WHEN $13 = 'invoice' THEN $8 ELSE invoice_document_file_name END,
                 plan_document_id = CASE WHEN $13 = 'plan' THEN $7 ELSE plan_document_id END,
                 plan_document_file_name = CASE WHEN $13 = 'plan' THEN $8 ELSE plan_document_file_name END,
                 updated_at = NOW()
             WHERE id = $14
             RETURNING *;`,
            [
              item.status,
              item.productName,
              item.startDate,
              item.endDate,
              item.promoPrice,
              item.regularPrice,
              item.sourceDocumentId,
              item.sourceDocumentFileName,
              item.sourceProductName,
              item.sourceLineText,
              item.priceListItemId,
              item.matchConfidence,
              sourceType,
              current.id,
            ],
          );
          saved.push(mapRow(updated.rows[0]));
          continue;
        }

        const inserted = await client.query<PromotionTableRowDb>(
          `INSERT INTO promotion_table_rows (
             id,
             row_number,
             status,
             product_name,
             start_date,
             end_date,
             promo_price,
             regular_price,
             source_document_id,
             source_document_file_name,
             source_product_name,
             source_line_text,
             price_list_item_id,
             match_confidence,
             invoice_document_id,
             invoice_document_file_name,
             plan_document_id,
             plan_document_file_name,
             created_at,
             updated_at
           )
           VALUES (
             $1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,
             CASE WHEN $15 = 'invoice' THEN $9 ELSE NULL END,
             CASE WHEN $15 = 'invoice' THEN $10 ELSE NULL END,
             CASE WHEN $15 = 'plan' THEN $9 ELSE NULL END,
             CASE WHEN $15 = 'plan' THEN $10 ELSE NULL END,
             NOW(),NOW()
           )
           RETURNING *;`,
          [
            id(),
            rowNumber,
            item.status,
            item.productName,
            item.startDate,
            item.endDate,
            item.promoPrice,
            item.regularPrice,
            item.sourceDocumentId,
            item.sourceDocumentFileName,
            item.sourceProductName,
            item.sourceLineText,
            item.priceListItemId,
            item.matchConfidence,
            sourceType,
          ],
        );
        saved.push(mapRow(inserted.rows[0]));
        rowNumber += 1;
      }

      await client.query('COMMIT');
      return saved;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
};

export const updatePromotionRowByNumber = async (rowNumber: number, input: PromotionRowInput): Promise<PromotionTableRow | null> => {
  const result = await opsDb.query<PromotionTableRowDb>(
    `UPDATE promotion_table_rows
     SET status = $1,
         product_name = $2,
         start_date = $3::date,
         end_date = $4::date,
         promo_price = $5,
         regular_price = $6,
         updated_at = NOW()
     WHERE row_number = $7
     RETURNING *;`,
    [input.status, input.productName, input.startDate, input.endDate, input.promoPrice, input.regularPrice, rowNumber],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
};

export const deletePromotionRowByNumber = async (rowNumber: number): Promise<boolean> => {
  const result = await opsDb.query(
    'DELETE FROM promotion_table_rows WHERE row_number = $1;',
    [rowNumber],
  );
  return (result.rowCount ?? 0) > 0;
};
