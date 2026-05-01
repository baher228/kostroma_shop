CREATE TABLE IF NOT EXISTS order_values (
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  order_date DATE NOT NULL,
  packs SMALLINT NOT NULL CHECK (packs >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, order_date)
);

CREATE INDEX IF NOT EXISTS order_values_date_idx ON order_values (order_date);
