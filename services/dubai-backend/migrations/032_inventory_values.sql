CREATE TABLE IF NOT EXISTS inventory_values (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  value SMALLINT NOT NULL CHECK (value >= 0 AND value <= 50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, product_id, day_date)
);

CREATE INDEX IF NOT EXISTS inventory_values_shop_date_idx ON inventory_values (shop_id, day_date);
CREATE INDEX IF NOT EXISTS inventory_values_product_idx ON inventory_values (product_id);
