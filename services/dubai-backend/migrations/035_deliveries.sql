CREATE TABLE IF NOT EXISTS delivery_suppliers (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  window_start_minutes INTEGER NOT NULL CHECK (window_start_minutes >= 0 AND window_start_minutes < 1440),
  window_end_minutes INTEGER NOT NULL CHECK (window_end_minutes > 0 AND window_end_minutes <= 1440),
  weekdays SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (window_end_minutes > window_start_minutes)
);

CREATE INDEX IF NOT EXISTS delivery_suppliers_shop_idx ON delivery_suppliers (shop_id);

CREATE TABLE IF NOT EXISTS delivery_receipts (
  supplier_id TEXT NOT NULL REFERENCES delivery_suppliers(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  invoice_photo_key TEXT,
  invoice_photo_content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (supplier_id, day_date)
);

CREATE INDEX IF NOT EXISTS delivery_receipts_day_idx ON delivery_receipts (day_date);
