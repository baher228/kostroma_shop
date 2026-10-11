import type { PoolClient } from 'pg';
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

type PromotionIntervalDb = {
  id: string;
  promotion_row_id: string;
  start_date: Date | string | null;
  end_date: Date | string | null;
};

export type PromotionIntervalPeriod = {
  id: string;
  startDate: string | null;
  endDate: string | null;
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

// Preserve the invoice's own prices and exact period when the common table
// consolidates adjacent promotions from several source documents.
type GmailInvoiceRow = PromotionTableRowDb & {invoice_start:Date|string|null;invoice_end:Date|string|null;invoice_promo:string|number|null;invoice_regular:string|number|null;invoice_id:string;invoice_name:string};
export const listPromotionRowsForGmailMessage = async (mailbox:string,messageId:string):Promise<PromotionTableRow[]> => {
  const result=await opsDb.query<GmailInvoiceRow>(`SELECT aggregate.*, interval.start_date::text AS invoice_start,interval.end_date::text AS invoice_end,
    interval.promo_price AS invoice_promo,COALESCE(interval.regular_price,price.regular_price) AS invoice_regular,
    interval.source_document_id AS invoice_id,interval.source_document_file_name AS invoice_name
    FROM gmail_imports gmail JOIN promotion_storage_documents document ON document.id=gmail.promotion_document_id
    JOIN promotion_row_intervals interval ON interval.source_document_id=document.id
    JOIN promotion_table_rows aggregate ON aggregate.id=interval.promotion_row_id
    LEFT JOIN promotion_price_list_items price ON price.id=interval.price_list_item_id
    WHERE gmail.mailbox=$1 AND gmail.message_id=$2 AND gmail.status='success' AND document.document_type='invoice'
    ORDER BY aggregate.row_number,interval.start_date,interval.id;`,[mailbox,messageId]);
  const seen=new Set<string>();
  return result.rows.map((row:GmailInvoiceRow)=>{
    const promo=num(row.invoice_promo),regular=num(row.invoice_regular);
    const percent=regular!==null&&regular>0&&promo!==null?(regular-promo)/regular*100:null;
    return {...mapRow(row),startDate:dateOnly(row.invoice_start),endDate:dateOnly(row.invoice_end),promoPrice:promo,regularPrice:regular,
      priceDifference:regular!==null&&promo!==null?regular-promo:null,realDiscountPercent:percent===null?null:Math.round(percent*100)/100,
      advertisingDiscountPercent:percent===null?null:Math.min(100,Math.max(0,Math.ceil(percent/10)*10)),
      sourceDocumentId:row.invoice_id,sourceDocumentFileName:row.invoice_name,invoiceDocumentId:row.invoice_id,invoiceDocumentFileName:row.invoice_name};
  }).filter((row:PromotionTableRow)=>{const key=JSON.stringify([row.productName,row.startDate,row.endDate,row.promoPrice,row.regularPrice]);if(seen.has(key))return false;seen.add(key);return true;});
};

const id = () => `promo_row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const intervalId = () => `promo_interval_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const nextDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

export const splitPromotionIntervalsIntoIslands = (
  intervals: readonly PromotionIntervalPeriod[],
): PromotionIntervalPeriod[][] => {
  const dated = intervals
    .filter((interval): interval is PromotionIntervalPeriod & { startDate: string; endDate: string } => (
      interval.startDate !== null && interval.endDate !== null
    ))
    .sort((left, right) => (
      left.startDate.localeCompare(right.startDate) ||
      left.endDate.localeCompare(right.endDate) ||
      left.id.localeCompare(right.id)
    ));
  const islands: PromotionIntervalPeriod[][] = [];
  let maximumEnd: string | null = null;

  for (const interval of dated) {
    if (maximumEnd === null || interval.startDate > nextDate(maximumEnd)) {
      islands.push([interval]);
      maximumEnd = interval.endDate;
      continue;
    }
    islands[islands.length - 1].push(interval);
    if (interval.endDate > maximumEnd) maximumEnd = interval.endDate;
  }

  // Unknown bounds never bridge dated periods or other unknown intervals.
  const unknown = intervals
    .filter((interval) => interval.startDate === null || interval.endDate === null)
    .sort((left, right) => left.id.localeCompare(right.id));
  islands.push(...unknown.map((interval) => [interval]));
  return islands;
};

const recalculatePromotionRowsForClient = async (
  client: PoolClient,
  rowIds: string[],
): Promise<PromotionTableRow[]> => {
  if (!rowIds.length) return [];
  const result = await client.query<PromotionTableRowDb>(
    `WITH target_rows AS (
       SELECT DISTINCT value AS promotion_row_id
       FROM UNNEST($1::text[]) AS value
     ), interval_bounds AS (
       SELECT
         interval.promotion_row_id,
         MIN(interval.start_date) AS start_date,
         MAX(interval.end_date) AS end_date
       FROM promotion_row_intervals interval
       JOIN target_rows target ON target.promotion_row_id = interval.promotion_row_id
       GROUP BY interval.promotion_row_id
     ), latest_interval AS (
       SELECT DISTINCT ON (interval.promotion_row_id)
         interval.*
       FROM promotion_row_intervals interval
       JOIN target_rows target ON target.promotion_row_id = interval.promotion_row_id
       ORDER BY
         interval.promotion_row_id,
         CASE WHEN interval.source_type = 'invoice' THEN 0 ELSE 1 END,
         interval.end_date DESC NULLS LAST,
         interval.updated_at DESC,
         interval.id DESC
     ), latest_promo_price AS (
       SELECT DISTINCT ON (interval.promotion_row_id)
         interval.promotion_row_id,
         interval.promo_price
       FROM promotion_row_intervals interval
       JOIN target_rows target ON target.promotion_row_id = interval.promotion_row_id
       WHERE interval.promo_price IS NOT NULL
       ORDER BY
         interval.promotion_row_id,
         CASE WHEN interval.source_type = 'invoice' THEN 0 ELSE 1 END,
         interval.end_date DESC NULLS LAST,
         interval.updated_at DESC,
         interval.id DESC
     ), latest_regular_price AS (
       SELECT DISTINCT ON (interval.promotion_row_id)
         interval.promotion_row_id,
         interval.regular_price
       FROM promotion_row_intervals interval
       JOIN target_rows target ON target.promotion_row_id = interval.promotion_row_id
       WHERE interval.regular_price IS NOT NULL
       ORDER BY
         interval.promotion_row_id,
         CASE WHEN interval.source_type = 'invoice' THEN 0 ELSE 1 END,
         interval.end_date DESC NULLS LAST,
         interval.updated_at DESC,
         interval.id DESC
     ), latest_invoice AS (
       SELECT DISTINCT ON (interval.promotion_row_id)
         interval.promotion_row_id,
         interval.source_document_id,
         interval.source_document_file_name
       FROM promotion_row_intervals interval
       JOIN target_rows target ON target.promotion_row_id = interval.promotion_row_id
       WHERE interval.source_type = 'invoice'
       ORDER BY
         interval.promotion_row_id,
         interval.end_date DESC NULLS LAST,
         interval.updated_at DESC,
         interval.id DESC
     ), latest_plan AS (
       SELECT DISTINCT ON (interval.promotion_row_id)
         interval.promotion_row_id,
         interval.source_document_id,
         interval.source_document_file_name
       FROM promotion_row_intervals interval
       JOIN target_rows target ON target.promotion_row_id = interval.promotion_row_id
       WHERE interval.source_type = 'plan'
       ORDER BY
         interval.promotion_row_id,
         interval.end_date DESC NULLS LAST,
         interval.updated_at DESC,
         interval.id DESC
     )
     UPDATE promotion_table_rows aggregate
     SET status = latest.status,
         product_name = COALESCE(price.product_name_clean, price.product_name, latest.product_name),
         start_date = bounds.start_date,
         end_date = bounds.end_date,
         promo_price = promo.promo_price,
         regular_price = regular.regular_price,
         source_document_id = latest.source_document_id,
         source_document_file_name = latest.source_document_file_name,
         source_product_name = latest.source_product_name,
         source_line_text = latest.source_line_text,
         price_list_item_id = latest.price_list_item_id,
         match_confidence = latest.match_confidence,
         invoice_document_id = invoice.source_document_id,
         invoice_document_file_name = invoice.source_document_file_name,
         plan_document_id = plan.source_document_id,
         plan_document_file_name = plan.source_document_file_name,
         updated_at = NOW()
     FROM interval_bounds bounds
     JOIN latest_interval latest ON latest.promotion_row_id = bounds.promotion_row_id
     LEFT JOIN latest_promo_price promo ON promo.promotion_row_id = bounds.promotion_row_id
     LEFT JOIN latest_regular_price regular ON regular.promotion_row_id = bounds.promotion_row_id
     LEFT JOIN latest_invoice invoice ON invoice.promotion_row_id = bounds.promotion_row_id
     LEFT JOIN latest_plan plan ON plan.promotion_row_id = bounds.promotion_row_id
     LEFT JOIN promotion_price_list_items price ON price.id = latest.price_list_item_id
     WHERE aggregate.id = bounds.promotion_row_id
     RETURNING aggregate.*;`,
    [rowIds],
  );
  return result.rows.map(mapRow);
};

export const rebuildPromotionRowsForClient = async (
  client: PoolClient,
  rowIds: string[],
): Promise<{ deletedRows: number; rows: PromotionTableRow[] }> => {
  if (!rowIds.length) return { deletedRows: 0, rows: [] };
  const uniqueRowIds = [...new Set(rowIds)];
  const lockedRows = await client.query<{ id: string }>(
    `SELECT id
     FROM promotion_table_rows
     WHERE id = ANY($1::text[])
     ORDER BY id
     FOR UPDATE;`,
    [uniqueRowIds],
  );
  const existingRowIds = lockedRows.rows.map((row: { id: string }) => row.id);
  const intervalResult = await client.query<PromotionIntervalDb>(
    `SELECT id, promotion_row_id, start_date, end_date
     FROM promotion_row_intervals
     WHERE promotion_row_id = ANY($1::text[])
     ORDER BY promotion_row_id, start_date NULLS LAST, end_date NULLS LAST, id
     FOR UPDATE;`,
    [existingRowIds],
  );
  const intervalsByRow = new Map<string, PromotionIntervalDb[]>();
  for (const interval of intervalResult.rows) {
    const current = intervalsByRow.get(interval.promotion_row_id) ?? [];
    current.push(interval);
    intervalsByRow.set(interval.promotion_row_id, current);
  }

  let deletedRows = 0;
  const rowsToRecalculate: string[] = [];
  for (const rowId of existingRowIds) {
    const intervals = intervalsByRow.get(rowId) ?? [];
    if (!intervals.length) {
      const removed = await client.query(
        `DELETE FROM promotion_table_rows aggregate
         WHERE aggregate.id = $1
           AND NOT EXISTS (
             SELECT 1 FROM promotion_row_intervals interval
             WHERE interval.promotion_row_id = aggregate.id
           );`,
        [rowId],
      );
      deletedRows += removed.rowCount ?? 0;
      continue;
    }

    const islands = splitPromotionIntervalsIntoIslands(intervals.map((interval) => ({
      id: interval.id,
      startDate: dateOnly(interval.start_date),
      endDate: dateOnly(interval.end_date),
    })));
    rowsToRecalculate.push(rowId);
    for (const island of islands.slice(1)) {
      const newRowId = id();
      const cloned = await client.query<{ id: string }>(
        `INSERT INTO promotion_table_rows (
           id, row_number, status, product_name, start_date, end_date,
           promo_price, regular_price, source_document_id,
           source_document_file_name, source_product_name, source_line_text,
           price_list_item_id, match_confidence, invoice_document_id,
           invoice_document_file_name, plan_document_id,
           plan_document_file_name, created_at, updated_at
         )
         SELECT
           $1, NEXTVAL('promotion_table_row_number_seq')::integer, status,
           product_name, start_date, end_date, promo_price, regular_price,
           source_document_id, source_document_file_name, source_product_name,
           source_line_text, price_list_item_id, match_confidence,
           invoice_document_id, invoice_document_file_name, plan_document_id,
           plan_document_file_name, NOW(), NOW()
         FROM promotion_table_rows
         WHERE id = $2
         RETURNING id;`,
        [newRowId, rowId],
      );
      if (!cloned.rows[0]) throw new Error('Failed to split promotion aggregate row.');
      await client.query(
        `UPDATE promotion_row_intervals
         SET promotion_row_id = $1,
             updated_at = NOW()
         WHERE id = ANY($2::text[]);`,
        [newRowId, island.map((interval) => interval.id)],
      );
      rowsToRecalculate.push(newRowId);
    }
  }

  const rows = await recalculatePromotionRowsForClient(client, rowsToRecalculate);
  return { deletedRows, rows };
};

export const listPromotionRows = async (): Promise<PromotionTableRow[]> => {
  const result = await opsDb.query<PromotionTableRowDb>(
    `SELECT *
     FROM promotion_table_rows
     ORDER BY start_date ASC NULLS LAST,
              end_date ASC NULLS LAST,
              product_name ASC,
              row_number ASC;`,
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
  const result = await opsDb.query<PromotionTableRowDb>(
    `INSERT INTO promotion_table_rows (id, row_number, status, product_name, start_date, end_date, promo_price, regular_price, created_at, updated_at)
     VALUES ($1,NEXTVAL('promotion_table_row_number_seq')::integer,$2,$3,$4::date,$5::date,$6,$7,NOW(),NOW())
     RETURNING *;`,
    [id(), input.status, input.productName, input.startDate, input.endDate, input.promoPrice, input.regularPrice],
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
      const sourceDocumentIds = [...new Set(items.map((item) => item.sourceDocumentId))];
      const lockedDocuments = await client.query<{ id: string }>(
        `SELECT id
         FROM promotion_storage_documents
         WHERE id = ANY($1::text[])
         ORDER BY id
         FOR KEY SHARE;`,
        [sourceDocumentIds],
      );
      if (lockedDocuments.rows.length !== sourceDocumentIds.length) {
        throw new Error('Promotion source document no longer exists.');
      }
      const saved: PromotionTableRow[] = [];

      for (const item of items) {
        const existing = item.startDate !== null && item.endDate !== null
          ? await client.query<PromotionTableRowDb>(
            `SELECT aggregate.*
             FROM promotion_table_rows aggregate
             WHERE (
               ($1::text IS NOT NULL AND aggregate.price_list_item_id = $1) OR
               ($1::text IS NULL AND aggregate.price_list_item_id IS NULL
                 AND LOWER(aggregate.product_name) = LOWER($2))
             )
               AND aggregate.start_date IS NOT NULL
               AND aggregate.end_date IS NOT NULL
               AND aggregate.start_date <= ($4::date + 1)
               AND $3::date <= (aggregate.end_date + 1)
               AND EXISTS (
                 SELECT 1
                 FROM promotion_row_intervals interval
                 WHERE interval.promotion_row_id = aggregate.id
               )
             ORDER BY aggregate.row_number, aggregate.id
             FOR UPDATE;`,
            [item.priceListItemId, item.productName, item.startDate, item.endDate],
          )
          : { rows: [] as PromotionTableRowDb[] };

        let aggregateRowId: string;
        if (existing.rows.length) {
          aggregateRowId = existing.rows[0].id;
          const loserIds = existing.rows.slice(1).map((row: PromotionTableRowDb) => row.id);
          if (loserIds.length) {
            await client.query(
              `UPDATE promotion_row_intervals
               SET promotion_row_id = $1,
                   updated_at = NOW()
               WHERE promotion_row_id = ANY($2::text[]);`,
              [aggregateRowId, loserIds],
            );
            await client.query(
              'DELETE FROM promotion_table_rows WHERE id = ANY($1::text[]);',
              [loserIds],
            );
          }
        } else {
          aggregateRowId = id();
          await client.query<PromotionTableRowDb>(
            `INSERT INTO promotion_table_rows (
               id, row_number, status, product_name, start_date, end_date,
               promo_price, regular_price, source_document_id,
               source_document_file_name, source_product_name, source_line_text,
               price_list_item_id, match_confidence, invoice_document_id,
               invoice_document_file_name, plan_document_id,
               plan_document_file_name, created_at, updated_at
             )
             VALUES (
               $1,NEXTVAL('promotion_table_row_number_seq')::integer,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,
               CASE WHEN $14 = 'invoice' THEN $8 ELSE NULL END,
               CASE WHEN $14 = 'invoice' THEN $9 ELSE NULL END,
               CASE WHEN $14 = 'plan' THEN $8 ELSE NULL END,
               CASE WHEN $14 = 'plan' THEN $9 ELSE NULL END,
               NOW(),NOW()
             )
             RETURNING *;`,
            [
              aggregateRowId,
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
        }

        await client.query(
          `INSERT INTO promotion_row_intervals (
             id, promotion_row_id, source_document_id, source_type,
             source_document_file_name, status, product_name, start_date,
             end_date, promo_price, regular_price, source_product_name,
             source_line_text, price_list_item_id, match_confidence,
             created_at, updated_at
           )
           VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12,$13,$14,$15,NOW(),NOW()
           );`,
          [
            intervalId(),
            aggregateRowId,
            item.sourceDocumentId,
            sourceType,
            item.sourceDocumentFileName,
            item.status,
            item.productName,
            item.startDate,
            item.endDate,
            item.promoPrice,
            item.regularPrice,
            item.sourceProductName,
            item.sourceLineText,
            item.priceListItemId,
            item.matchConfidence,
          ],
        );
        const recalculated = await recalculatePromotionRowsForClient(client, [aggregateRowId]);
        if (!recalculated[0]) throw new Error('Failed to rebuild promotion aggregate row.');
        saved.push(recalculated[0]);
      }

      await client.query('COMMIT');
      return saved;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  });
};

export const updatePromotionRowByNumber = async (rowNumber: number, input: PromotionRowInput): Promise<PromotionTableRow | null> => {
  return opsDb.withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const target = await client.query<{ id: string; has_sources: boolean }>(
        `SELECT
           aggregate.id,
           EXISTS (
             SELECT 1
             FROM promotion_row_intervals interval
             WHERE interval.promotion_row_id = aggregate.id
           ) AS has_sources
         FROM promotion_table_rows aggregate
         WHERE aggregate.row_number = $1
         FOR UPDATE;`,
        [rowNumber],
      );
      if (!target.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      if (target.rows[0].has_sources) {
        throw new Error('Импортированную строку акции нельзя редактировать вручную. Измените или замените исходный документ.');
      }
      const result = await client.query<PromotionTableRowDb>(
        `UPDATE promotion_table_rows
         SET status = $1,
             product_name = $2,
             start_date = $3::date,
             end_date = $4::date,
             promo_price = $5,
             regular_price = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING *;`,
        [
          input.status,
          input.productName,
          input.startDate,
          input.endDate,
          input.promoPrice,
          input.regularPrice,
          target.rows[0].id,
        ],
      );
      await client.query('COMMIT');
      return mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  });
};

export const deletePromotionRowByNumber = async (rowNumber: number): Promise<boolean> => {
  const result = await opsDb.query(
    'DELETE FROM promotion_table_rows WHERE row_number = $1;',
    [rowNumber],
  );
  return (result.rowCount ?? 0) > 0;
};
