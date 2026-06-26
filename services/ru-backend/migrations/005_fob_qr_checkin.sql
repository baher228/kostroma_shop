DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('manager', 'worker', 'store_tablet'));

CREATE TABLE IF NOT EXISTS fob_qr_challenges (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  consumed_by_tablet_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  consumed_shop_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fob_qr_challenges_worker_created_idx ON fob_qr_challenges (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fob_qr_challenges_expires_idx ON fob_qr_challenges (expires_at);

ALTER TABLE worker_checkin_status
  ADD COLUMN IF NOT EXISTS shop_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS shop_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS scanned_by_tablet_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scanned_by_tablet_display_name TEXT NULL;

ALTER TABLE worker_checkin_status
  DROP CONSTRAINT IF EXISTS worker_checkin_status_source_check;

ALTER TABLE worker_checkin_status
  ADD CONSTRAINT worker_checkin_status_source_check CHECK (source IN ('manual', 'tablet_qr'));

ALTER TABLE worker_checkin_events
  ADD COLUMN IF NOT EXISTS shop_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS shop_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS scanned_by_tablet_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scanned_by_tablet_display_name TEXT NULL;

ALTER TABLE worker_checkin_events
  DROP CONSTRAINT IF EXISTS worker_checkin_events_source_check;

ALTER TABLE worker_checkin_events
  ADD CONSTRAINT worker_checkin_events_source_check CHECK (source IN ('manual', 'tablet_qr'));

CREATE INDEX IF NOT EXISTS worker_checkin_events_shop_time_idx ON worker_checkin_events (shop_id, event_at DESC);
