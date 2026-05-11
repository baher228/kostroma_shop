CREATE TABLE IF NOT EXISTS dashboard_overrides (
  shop_id text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  cell_key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, product_id, week_start, cell_key)
);

CREATE INDEX IF NOT EXISTS dashboard_overrides_week_idx
  ON dashboard_overrides (shop_id, week_start);
