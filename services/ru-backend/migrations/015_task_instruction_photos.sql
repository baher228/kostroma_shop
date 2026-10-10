CREATE TABLE IF NOT EXISTS task_instruction_photos (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS instruction_photo_id TEXT NULL;

ALTER TABLE task_series
  ADD COLUMN IF NOT EXISTS instruction_photo_id TEXT NULL;
