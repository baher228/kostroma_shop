ALTER TABLE stock_products ADD COLUMN IF NOT EXISTS inventory_price_rub NUMERIC(12, 2);

ALTER TABLE inventory_values DROP CONSTRAINT IF EXISTS inventory_values_value_check;
ALTER TABLE inventory_values ALTER COLUMN value TYPE INTEGER;
ALTER TABLE inventory_values ADD CONSTRAINT inventory_values_value_check CHECK (value >= 0 AND value <= 9999);

CREATE TABLE IF NOT EXISTS inventory_counts (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  business_category TEXT NOT NULL,
  day_date DATE NOT NULL,
  counted_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, business_category, day_date)
);

CREATE INDEX IF NOT EXISTS inventory_counts_shop_category_idx ON inventory_counts (shop_id, business_category, day_date);
