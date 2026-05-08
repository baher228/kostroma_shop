CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  machine_number SMALLINT NOT NULL DEFAULT 1 CHECK (machine_number BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shops (id, name, machine_number, created_at)
VALUES ('shop_main', 'Main shop', 1, NOW())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS stock_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'Ð™Ð¾Ð³ÑƒÑ€Ñ‚Ñ‹',
  pack_type TEXT NULL,
  units_in_pack INTEGER NULL CHECK (units_in_pack IS NULL OR units_in_pack > 0),
  pack_weight_kg NUMERIC(10, 3) NULL CHECK (pack_weight_kg IS NULL OR pack_weight_kg > 0),
  shelf_life_days INTEGER NULL CHECK (shelf_life_days IS NULL OR shelf_life_days > 0),
  unit_price_rub_vat NUMERIC(10, 2) NULL CHECK (unit_price_rub_vat IS NULL OR unit_price_rub_vat >= 0),
  min_stock_units INTEGER NULL CHECK (min_stock_units IS NULL OR min_stock_units >= 0),
  max_stock_units INTEGER NULL CHECK (max_stock_units IS NULL OR max_stock_units >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (min_stock_units IS NULL OR max_stock_units IS NULL OR min_stock_units <= max_stock_units),
  CHECK (category IN ('Ð™Ð¾Ð³ÑƒÑ€Ñ‚Ñ‹', 'ÐšÐµÑ„Ð¸Ñ€, Ð ÑÐ¶ÐµÐ½ÐºÐ°, Ð¡Ð½ÐµÐ¶Ð¾Ðº', 'ÐœÐ¾Ð»Ð¾ÐºÐ¾', 'Ð¡Ð¼ÐµÑ‚Ð°Ð½Ð°', 'Ð¢Ð²Ð¾Ñ€Ð¾Ð³'))
);

CREATE INDEX IF NOT EXISTS stock_products_category_idx ON stock_products (category);

INSERT INTO stock_products (
  id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, created_at
)
VALUES
  ('prod_yogurt_apricot', 'Йогурт Абрикос 2,5% ПЭТ 480 г', 'Ð™Ð¾Ð³ÑƒÑ€Ñ‚Ñ‹', 'ПЭТ', 6, 2.88, 21, 47.46, NOW()),
  ('prod_kefir_1', 'Кефир 1.0% ПЭТ 480 гр.', 'ÐšÐµÑ„Ð¸Ñ€, Ð ÑÐ¶ÐµÐ½ÐºÐ°, Ð¡Ð½ÐµÐ¶Ð¾Ðº', 'ПЭТ', 6, 2.88, 14, 40.47, NOW()),
  ('prod_milk_32', 'Молоко 3,2% ПЭТ 930 мл', 'ÐœÐ¾Ð»Ð¾ÐºÐ¾', 'ПЭТ', 6, 5.58, 14, 68.61, NOW())
ON CONFLICT (id) DO NOTHING;

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

CREATE TABLE IF NOT EXISTS order_values (
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  order_date DATE NOT NULL,
  packs SMALLINT NOT NULL CHECK (packs >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, order_date)
);

CREATE INDEX IF NOT EXISTS order_values_date_idx ON order_values (order_date);

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

CREATE TABLE IF NOT EXISTS seller_orders (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  stock_on_hand INTEGER NULL CHECK (stock_on_hand IS NULL OR stock_on_hand >= 0),
  requested_packs INTEGER NOT NULL CHECK (requested_packs > 0),
  requested_units INTEGER NOT NULL CHECK (requested_units > 0),
  auto_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processed')),
  request_jti TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seller_orders_shop_created_idx ON seller_orders (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_orders_status_idx ON seller_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_orders_request_jti_idx ON seller_orders (request_jti);
