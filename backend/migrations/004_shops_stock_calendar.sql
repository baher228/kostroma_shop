CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shops (id, name, created_at)
VALUES ('shop_main', 'Основной магазин', NOW())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS shop_id TEXT NULL REFERENCES shops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_shop_id_idx ON users (shop_id);

CREATE TABLE IF NOT EXISTS stock_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_values (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  value SMALLINT NOT NULL CHECK (value >= 0 AND value <= 15),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, product_id, day_date)
);

CREATE INDEX IF NOT EXISTS stock_values_shop_date_idx ON stock_values (shop_id, day_date);
CREATE INDEX IF NOT EXISTS stock_values_product_idx ON stock_values (product_id);

INSERT INTO stock_products (id, name, created_at)
SELECT
  CONCAT('prod_legacy_', id),
  name,
  NOW()
FROM stock_rows
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  week_start DATE;
BEGIN
  week_start := (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) * INTERVAL '1 day')::date;

  INSERT INTO stock_values (shop_id, product_id, day_date, value, updated_at)
  SELECT
    'shop_main',
    CONCAT('prod_legacy_', sr.id),
    day_date,
    value,
    NOW()
  FROM (
    SELECT id, (week_start + INTERVAL '0 day')::date AS day_date, NULLIF(stock_mon, '')::int AS value FROM stock_rows
    UNION ALL
    SELECT id, (week_start + INTERVAL '1 day')::date AS day_date, NULLIF(stock_tue, '')::int AS value FROM stock_rows
    UNION ALL
    SELECT id, (week_start + INTERVAL '2 day')::date AS day_date, NULLIF(stock_wed, '')::int AS value FROM stock_rows
    UNION ALL
    SELECT id, (week_start + INTERVAL '3 day')::date AS day_date, NULLIF(stock_thu, '')::int AS value FROM stock_rows
    UNION ALL
    SELECT id, (week_start + INTERVAL '4 day')::date AS day_date, NULLIF(stock_fri, '')::int AS value FROM stock_rows
    UNION ALL
    SELECT id, (week_start + INTERVAL '6 day')::date AS day_date, NULLIF(stock_sun, '')::int AS value FROM stock_rows
  ) AS legacy
  JOIN stock_rows sr ON sr.id = legacy.id
  WHERE legacy.value IS NOT NULL
    AND legacy.value BETWEEN 0 AND 15
  ON CONFLICT (shop_id, product_id, day_date) DO NOTHING;
END $$;
