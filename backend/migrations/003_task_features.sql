ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS requires_photo_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS photo_confirmation_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS photo_confirmed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS tasks_deadline_at_idx ON tasks (deadline_at);

CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('technical_failure', 'suppliers_failure', 'client_conflict')),
  subject TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_threads_created_by_idx ON support_threads (created_by_id);
CREATE INDEX IF NOT EXISTS support_threads_status_idx ON support_threads (status);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_display_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON support_messages (thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NULL,
  actor_display_name TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);
