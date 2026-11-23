CREATE TABLE IF NOT EXISTS inventory_submissions (
  id BIGSERIAL PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  business_category TEXT NOT NULL,
  day_date DATE NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'array')
);

CREATE INDEX IF NOT EXISTS inventory_submissions_shop_category_date_idx
  ON inventory_submissions (shop_id, business_category, day_date DESC, submitted_at DESC);
