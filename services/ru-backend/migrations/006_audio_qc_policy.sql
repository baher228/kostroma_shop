CREATE TABLE IF NOT EXISTS audio_qc_policies (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'manual',
  max_segment_duration_sec INTEGER NOT NULL DEFAULT 300,
  silence_to_stop_sec INTEGER NOT NULL DEFAULT 3,
  pre_roll_sec INTEGER NOT NULL DEFAULT 5,
  upload_immediately BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audio_qc_policies_mode_check CHECK (mode = 'manual'),
  CONSTRAINT audio_qc_policies_max_segment_check CHECK (max_segment_duration_sec BETWEEN 30 AND 1800),
  CONSTRAINT audio_qc_policies_silence_check CHECK (silence_to_stop_sec BETWEEN 1 AND 30),
  CONSTRAINT audio_qc_policies_preroll_check CHECK (pre_roll_sec BETWEEN 0 AND 30)
);

CREATE INDEX IF NOT EXISTS audio_qc_policies_updated_idx ON audio_qc_policies (updated_at DESC);

CREATE TABLE IF NOT EXISTS audio_qc_device_heartbeats (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  shop_id TEXT NOT NULL,
  user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  app_version TEXT NULL,
  current_mode TEXT NULL,
  queue_size INTEGER NOT NULL DEFAULT 0,
  is_recording BOOLEAN NOT NULL DEFAULT FALSE,
  last_error TEXT NULL,
  last_upload_at TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audio_qc_device_heartbeats_mode_check CHECK (current_mode IS NULL OR current_mode = 'manual'),
  CONSTRAINT audio_qc_device_heartbeats_queue_size_check CHECK (queue_size >= 0)
);

CREATE INDEX IF NOT EXISTS audio_qc_device_heartbeats_shop_seen_idx
  ON audio_qc_device_heartbeats (shop_id, last_seen_at DESC);
