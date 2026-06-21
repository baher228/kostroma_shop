CREATE TABLE IF NOT EXISTS promotion_table_rows (
  id TEXT PRIMARY KEY,
  row_number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'future' CHECK (status IN ('past', 'current', 'future')),
  product_name TEXT NOT NULL DEFAULT '',
  start_date DATE NULL,
  end_date DATE NULL,
  promo_price NUMERIC(10, 2) NULL,
  regular_price NUMERIC(10, 2) NULL,
  price_difference NUMERIC(10, 2) GENERATED ALWAYS AS (
    CASE
      WHEN regular_price IS NOT NULL AND promo_price IS NOT NULL THEN regular_price - promo_price
      ELSE NULL
    END
  ) STORED,
  real_discount_percent NUMERIC(6, 2) GENERATED ALWAYS AS (
    CASE
      WHEN regular_price IS NOT NULL AND promo_price IS NOT NULL AND regular_price > 0
        THEN ROUND(((regular_price - promo_price) / regular_price) * 100, 2)
      ELSE NULL
    END
  ) STORED,
  advertising_discount_percent NUMERIC(6, 2) GENERATED ALWAYS AS (
    CASE
      WHEN regular_price IS NOT NULL AND promo_price IS NOT NULL AND regular_price > 0
        THEN LEAST(100, GREATEST(0, CEIL((((regular_price - promo_price) / regular_price) * 100) / 10) * 10))
      ELSE NULL
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_table_rows_status_idx ON promotion_table_rows (status);
CREATE INDEX IF NOT EXISTS promotion_table_rows_period_idx ON promotion_table_rows (start_date, end_date);
