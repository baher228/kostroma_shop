import { opsDb } from '../db/opsDb';

export type DeliverySupplier = {
  id: string;
  shopId: string;
  name: string;
  windowStartMinutes: number;
  windowEndMinutes: number;
  weekdays: number[];
  createdAt: string;
};

export type DeliveryReceipt = {
  supplierId: string;
  date: string;
  receivedAt: string;
  markedAt: string;
  hasInvoicePhoto: boolean;
};

export type DeliverySupplierInput = Omit<DeliverySupplier, 'id' | 'createdAt'>;

type SupplierDbRow = {
  id: string;
  shop_id: string;
  name: string;
  window_start_minutes: number;
  window_end_minutes: number;
  weekdays: number[];
  created_at: Date | string;
};

type ReceiptDbRow = {
  supplier_id: string;
  day_date: string;
  received_at: Date | string;
  created_at: Date | string;
  has_invoice_photo: boolean;
};

const toSupplier = (row: SupplierDbRow): DeliverySupplier => ({
  id: row.id,
  shopId: row.shop_id,
  name: row.name,
  windowStartMinutes: Number(row.window_start_minutes),
  windowEndMinutes: Number(row.window_end_minutes),
  weekdays: (row.weekdays ?? []).map(Number).sort((a, b) => a - b),
  createdAt: new Date(row.created_at).toISOString(),
});

const toReceipt = (row: ReceiptDbRow): DeliveryReceipt => ({
  supplierId: row.supplier_id,
  date: row.day_date,
  receivedAt: new Date(row.received_at).toISOString(),
  markedAt: new Date(row.created_at ?? row.received_at).toISOString(),
  hasInvoicePhoto: Boolean(row.has_invoice_photo),
});

const SUPPLIER_COLUMNS = 'id, shop_id, name, window_start_minutes, window_end_minutes, weekdays, created_at';
const RECEIPT_COLUMNS = 'supplier_id, day_date::text AS day_date, received_at, created_at, invoice_photo_key IS NOT NULL AS has_invoice_photo';

export const listDeliverySuppliers = async (): Promise<DeliverySupplier[]> => {
  const result = await opsDb.query<SupplierDbRow>(
    `SELECT ${SUPPLIER_COLUMNS} FROM delivery_suppliers ORDER BY shop_id, window_start_minutes, name;`,
  );
  return result.rows.map(toSupplier);
};

export const createDeliverySupplier = async (input: DeliverySupplierInput): Promise<DeliverySupplier> => {
  const id = `dsup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const result = await opsDb.query<SupplierDbRow>(
    `
      INSERT INTO delivery_suppliers (id, shop_id, name, window_start_minutes, window_end_minutes, weekdays)
      VALUES ($1, $2, $3, $4, $5, $6::smallint[])
      RETURNING ${SUPPLIER_COLUMNS};
    `,
    [id, input.shopId, input.name, input.windowStartMinutes, input.windowEndMinutes, input.weekdays],
  );
  return toSupplier(result.rows[0]);
};

export const updateDeliverySupplier = async (
  id: string,
  input: Omit<DeliverySupplierInput, 'shopId'>,
): Promise<DeliverySupplier | null> => {
  const result = await opsDb.query<SupplierDbRow>(
    `
      UPDATE delivery_suppliers
      SET name = $2, window_start_minutes = $3, window_end_minutes = $4, weekdays = $5::smallint[], updated_at = NOW()
      WHERE id = $1
      RETURNING ${SUPPLIER_COLUMNS};
    `,
    [id, input.name, input.windowStartMinutes, input.windowEndMinutes, input.weekdays],
  );
  return result.rows[0] ? toSupplier(result.rows[0]) : null;
};

export const deleteDeliverySupplier = async (id: string): Promise<{ deleted: boolean; photoKeys: string[] }> => {
  const photos = await opsDb.query<{ invoice_photo_key: string }>(
    'SELECT invoice_photo_key FROM delivery_receipts WHERE supplier_id = $1 AND invoice_photo_key IS NOT NULL;',
    [id],
  );
  const result = await opsDb.query<{ id: string }>('DELETE FROM delivery_suppliers WHERE id = $1 RETURNING id;', [id]);
  return { deleted: result.rows.length > 0, photoKeys: photos.rows.map((row: { invoice_photo_key: string }) => row.invoice_photo_key) };
};

export const listDeliveryReceipts = async (from: string, to: string): Promise<DeliveryReceipt[]> => {
  const result = await opsDb.query<ReceiptDbRow>(
    `
      SELECT ${RECEIPT_COLUMNS}
      FROM delivery_receipts
      WHERE day_date >= $1::date AND day_date <= $2::date
      ORDER BY day_date, supplier_id;
    `,
    [from, to],
  );
  return result.rows.map(toReceipt);
};

export const getDeliveryReceiptPhoto = async (
  supplierId: string,
  date: string,
): Promise<{ key: string; contentType: string } | null> => {
  const result = await opsDb.query<{ invoice_photo_key: string | null; invoice_photo_content_type: string | null }>(
    'SELECT invoice_photo_key, invoice_photo_content_type FROM delivery_receipts WHERE supplier_id = $1 AND day_date = $2::date;',
    [supplierId, date],
  );
  const row = result.rows[0];
  return row?.invoice_photo_key
    ? { key: row.invoice_photo_key, contentType: row.invoice_photo_content_type || 'image/jpeg' }
    : null;
};

/** `photo: undefined` keeps the stored photo, `null` removes it. Returns the replaced photo key, if any. */
export const upsertDeliveryReceipt = async (input: {
  supplierId: string;
  date: string;
  receivedAt: string;
  photo?: { key: string; contentType: string } | null;
}): Promise<{ receipt: DeliveryReceipt; replacedPhotoKey: string | null }> => {
  const previous = await getDeliveryReceiptPhoto(input.supplierId, input.date);
  const keepPhoto = input.photo === undefined;
  const result = await opsDb.query<ReceiptDbRow>(
    `
      INSERT INTO delivery_receipts (supplier_id, day_date, received_at, invoice_photo_key, invoice_photo_content_type, updated_at)
      VALUES ($1, $2::date, $3::timestamptz, $4, $5, NOW())
      ON CONFLICT (supplier_id, day_date) DO UPDATE SET
        received_at = EXCLUDED.received_at,
        invoice_photo_key = CASE WHEN $6::boolean THEN delivery_receipts.invoice_photo_key ELSE EXCLUDED.invoice_photo_key END,
        invoice_photo_content_type = CASE WHEN $6::boolean THEN delivery_receipts.invoice_photo_content_type ELSE EXCLUDED.invoice_photo_content_type END,
        updated_at = NOW()
      RETURNING ${RECEIPT_COLUMNS};
    `,
    [input.supplierId, input.date, input.receivedAt, input.photo?.key ?? null, input.photo?.contentType ?? null, keepPhoto],
  );
  const replacedPhotoKey = !keepPhoto && previous && previous.key !== input.photo?.key ? previous.key : null;
  return { receipt: toReceipt(result.rows[0]), replacedPhotoKey };
};

export const deleteDeliveryReceipt = async (
  supplierId: string,
  date: string,
): Promise<{ deleted: boolean; photoKey: string | null }> => {
  const result = await opsDb.query<{ invoice_photo_key: string | null }>(
    'DELETE FROM delivery_receipts WHERE supplier_id = $1 AND day_date = $2::date RETURNING invoice_photo_key;',
    [supplierId, date],
  );
  return { deleted: result.rows.length > 0, photoKey: result.rows[0]?.invoice_photo_key ?? null };
};
