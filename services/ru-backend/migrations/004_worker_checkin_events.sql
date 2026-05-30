CREATE TABLE IF NOT EXISTS worker_checkin_events (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in', 'out')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS worker_checkin_events_worker_time_idx ON worker_checkin_events (worker_id, event_at DESC);
CREATE INDEX IF NOT EXISTS worker_checkin_events_time_idx ON worker_checkin_events (event_at DESC);

INSERT INTO worker_checkin_events (id, worker_id, worker_display_name, status, event_at)
SELECT
  'checkin_seed_' || worker_id,
  worker_id,
  worker_display_name,
  status,
  last_changed_at
FROM worker_checkin_status
ON CONFLICT (id) DO NOTHING;
