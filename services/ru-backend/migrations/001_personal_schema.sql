CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'worker')),
  password_hash TEXT NOT NULL,
  shop_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_shop_id_idx ON users (shop_id);

INSERT INTO users (id, username, first_name, last_name, role, password_hash, shop_id, created_at)
VALUES
  ('u_manager_01', 'manager', 'Main', 'Manager', 'manager', '$2b$12$CAgz2UYZgX4J4x9dm31JWu9d.Fe6cKD00lAx8eXFWDNw7PJQdnJsS', NULL, NOW()),
  ('u_worker_01', 'worker', 'Store', 'Worker', 'worker', '$2b$12$ss7t7FYQ0JEkVf7g3JXDUO0Kq2pfih53uXt4fV3.6O7eSLoJ.pVii', 'shop_main', NOW())
ON CONFLICT (username) DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  assignee_display_name TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  deadline_at TIMESTAMPTZ NULL,
  requires_photo_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  photo_confirmation_url TEXT NULL,
  photo_confirmed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON tasks (created_at DESC);
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
  photo_url TEXT NULL,
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

CREATE TABLE IF NOT EXISTS worker_checkin_status (
  worker_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  worker_display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in', 'out')),
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
