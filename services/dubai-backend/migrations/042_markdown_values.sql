CREATE TABLE IF NOT EXISTS markdown_values (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0 AND value <= 9999),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, product_id, day_date)
);

CREATE INDEX IF NOT EXISTS markdown_values_shop_date_idx ON markdown_values (shop_id, day_date);
CREATE INDEX IF NOT EXISTS markdown_values_product_idx ON markdown_values (product_id);

ALTER TABLE inventory_counts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'inventory';
ALTER TABLE inventory_counts DROP CONSTRAINT IF EXISTS inventory_counts_kind_check;
ALTER TABLE inventory_counts
  ADD CONSTRAINT inventory_counts_kind_check CHECK (kind IN ('inventory', 'markdown'));
ALTER TABLE inventory_counts DROP CONSTRAINT IF EXISTS inventory_counts_pkey;
ALTER TABLE inventory_counts ADD PRIMARY KEY (shop_id, business_category, kind, day_date);

ALTER TABLE inventory_submissions
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'inventory';
ALTER TABLE inventory_submissions DROP CONSTRAINT IF EXISTS inventory_submissions_kind_check;
ALTER TABLE inventory_submissions
  ADD CONSTRAINT inventory_submissions_kind_check CHECK (kind IN ('inventory', 'markdown'));

DROP INDEX IF EXISTS inventory_submissions_shop_category_date_idx;
CREATE INDEX IF NOT EXISTS inventory_submissions_shop_kind_category_date_idx
  ON inventory_submissions (shop_id, kind, business_category, day_date DESC, submitted_at DESC);
