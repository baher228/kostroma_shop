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
  created_at: Date | string;
  updated_at: Date | string;
};

const dateOnly = (value: Date | string | null) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
};

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const num = (value: string | number | null) => (value === null ? null : Number(value));

const mapRow = (row: PromotionTableRowDb): PromotionTableRow => ({
  id: row.id,
  rowNumber: Number(row.row_number),
  status: row.status,
  productName: row.product_name,
  startDate: dateOnly(row.start_date),
  endDate: dateOnly(row.end_date),
  promoPrice: num(row.promo_price),
  regularPrice: num(row.regular_price),
  priceDifference: num(row.price_difference),
  realDiscountPercent: num(row.real_discount_percent),
  advertisingDiscountPercent: num(row.advertising_discount_percent),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

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
