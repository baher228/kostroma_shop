CREATE TABLE IF NOT EXISTS task_series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  assignee_ids TEXT[] NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT NOT NULL,
  requires_photo_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  repeat TEXT NOT NULL CHECK (repeat IN ('daily', 'every_2_days', 'weekly')),
  next_deadline_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS task_series_due_idx ON task_series (next_deadline_at) WHERE active;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS series_id TEXT NULL;

CREATE INDEX IF NOT EXISTS tasks_series_id_idx ON tasks (series_id);
