ALTER TABLE stock_products
  ADD COLUMN IF NOT EXISTS min_stock_units INTEGER NULL,
  ADD COLUMN IF NOT EXISTS max_stock_units INTEGER NULL;

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_min_stock_units_check;
ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_min_stock_units_check
  CHECK (min_stock_units IS NULL OR min_stock_units >= 0);

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_max_stock_units_check;
ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_max_stock_units_check
  CHECK (max_stock_units IS NULL OR max_stock_units >= 0);

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_min_le_max_check;
ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_min_le_max_check
  CHECK (
    min_stock_units IS NULL
    OR max_stock_units IS NULL
    OR min_stock_units <= max_stock_units
  );

ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS photo_url TEXT NULL;

CREATE TABLE IF NOT EXISTS seller_orders (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_display_name TEXT NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  stock_on_hand INTEGER NULL CHECK (stock_on_hand IS NULL OR stock_on_hand >= 0),
  requested_packs INTEGER NOT NULL CHECK (requested_packs > 0),
  requested_units INTEGER NOT NULL CHECK (requested_units > 0),
  auto_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seller_orders_worker_created_idx ON seller_orders (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_orders_shop_created_idx ON seller_orders (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_orders_status_idx ON seller_orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS worker_checkin_status (
  worker_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  worker_display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in', 'out')),
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
