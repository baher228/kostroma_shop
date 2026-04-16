import { db } from './db';
import { ColumnKey, StockRow, StockValues } from './types';

type StockDbRow = {
  id: string;
  name: string;
  pack_count: string;
  stock_tue: string;
  order_thu: string;
  stock_wed: string;
  stock_thu: string;
  order_sat: string;
  stock_fri: string;
  stock_sun: string;
  order_tue: string;
  stock_mon: string;
};

const columnMap: Record<ColumnKey, keyof StockDbRow> = {
  packCount: 'pack_count',
  stockTue: 'stock_tue',
  orderThu: 'order_thu',
  stockWed: 'stock_wed',
  stockThu: 'stock_thu',
  orderSat: 'order_sat',
  stockFri: 'stock_fri',
  stockSun: 'stock_sun',
  orderTue: 'order_tue',
  stockMon: 'stock_mon',
};

const defaultValues = (): StockValues => ({
  packCount: '',
  stockTue: '',
  orderThu: '',
  stockWed: '',
  stockThu: '',
  orderSat: '',
  stockFri: '',
  stockSun: '',
  orderTue: '',
  stockMon: '',
});

const sanitizeValue = (value: string): string => value.replace(/[^0-9]/g, '').slice(0, 5);

const mapRow = (row: StockDbRow): StockRow => ({
  id: row.id,
  name: row.name,
  values: {
    packCount: sanitizeValue(row.pack_count),
    stockTue: sanitizeValue(row.stock_tue),
    orderThu: sanitizeValue(row.order_thu),
    stockWed: sanitizeValue(row.stock_wed),
    stockThu: sanitizeValue(row.stock_thu),
    orderSat: sanitizeValue(row.order_sat),
    stockFri: sanitizeValue(row.stock_fri),
    stockSun: sanitizeValue(row.stock_sun),
    orderTue: sanitizeValue(row.order_tue),
    stockMon: sanitizeValue(row.stock_mon),
  },
});

export const getRows = async (): Promise<StockRow[]> => {
  const result = await db.query<StockDbRow>(`
    SELECT
      id,
      name,
      pack_count,
      stock_tue,
      order_thu,
      stock_wed,
      stock_thu,
      order_sat,
      stock_fri,
      stock_sun,
      order_tue,
      stock_mon
    FROM stock_rows
    ORDER BY created_at ASC, id ASC;
  `);
  return result.rows.map(mapRow);
};

export const createRow = async (name: string): Promise<StockRow> => {
  const values = defaultValues();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await db.query<StockDbRow>(
    `
      INSERT INTO stock_rows (
        id,
        name,
        pack_count,
        stock_tue,
        order_thu,
        stock_wed,
        stock_thu,
        order_sat,
        stock_fri,
        stock_sun,
        order_tue,
        stock_mon
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      RETURNING
        id,
        name,
        pack_count,
        stock_tue,
        order_thu,
        stock_wed,
        stock_thu,
        order_sat,
        stock_fri,
        stock_sun,
        order_tue,
        stock_mon;
    `,
    [
      id,
      name.trim(),
      values.packCount,
      values.stockTue,
      values.orderThu,
      values.stockWed,
      values.stockThu,
      values.orderSat,
      values.stockFri,
      values.stockSun,
      values.orderTue,
      values.stockMon,
    ],
  );
  return mapRow(result.rows[0]);
};

export const updateRow = async (
  id: string,
  patch: {
    name?: string;
    values?: Partial<Record<ColumnKey, string>>;
  },
): Promise<StockRow | null> => {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (typeof patch.name === 'string') {
    params.push(patch.name.trim());
    setClauses.push(`name = $${params.length}`);
  }

  if (patch.values) {
    for (const [key, value] of Object.entries(patch.values)) {
      const columnKey = key as ColumnKey;
      const dbColumn = columnMap[columnKey];
      if (!dbColumn) {
        continue;
      }
      params.push(sanitizeValue(value ?? ''));
      setClauses.push(`${dbColumn} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    const fallback = await db.query<StockDbRow>(
      `
        SELECT
          id,
          name,
          pack_count,
          stock_tue,
          order_thu,
          stock_wed,
          stock_thu,
          order_sat,
          stock_fri,
          stock_sun,
          order_tue,
          stock_mon
        FROM stock_rows
        WHERE id = $1;
      `,
      [id],
    );
    return fallback.rows[0] ? mapRow(fallback.rows[0]) : null;
  }

  params.push(id);
  const result = await db.query<StockDbRow>(
    `
      UPDATE stock_rows
      SET ${setClauses.join(', ')}
      WHERE id = $${params.length}
      RETURNING
        id,
        name,
        pack_count,
        stock_tue,
        order_thu,
        stock_wed,
        stock_thu,
        order_sat,
        stock_fri,
        stock_sun,
        order_tue,
        stock_mon;
    `,
    params,
  );

  if (result.rowCount === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
};

export const deleteRow = async (id: string): Promise<boolean> => {
  const result = await db.query('DELETE FROM stock_rows WHERE id = $1;', [id]);
  return (result.rowCount ?? 0) > 0;
};
