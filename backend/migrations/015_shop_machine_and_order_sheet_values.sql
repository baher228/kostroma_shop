ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS machine_number SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE shops
  DROP CONSTRAINT IF EXISTS shops_machine_number_check;
ALTER TABLE shops
  ADD CONSTRAINT shops_machine_number_check
  CHECK (machine_number BETWEEN 1 AND 3);

CREATE TABLE IF NOT EXISTS order_sheet_values (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  order_date DATE NOT NULL,
  packs INTEGER NOT NULL CHECK (packs >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, product_id, order_date)
);

CREATE INDEX IF NOT EXISTS order_sheet_values_date_idx ON order_sheet_values (order_date);
CREATE INDEX IF NOT EXISTS order_sheet_values_shop_idx ON order_sheet_values (shop_id, order_date);
