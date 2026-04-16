CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'worker')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

INSERT INTO users (id, username, display_name, role, password_hash, created_at)
VALUES
  ('u_manager', 'manager', 'Менеджер', 'manager', '$2b$12$CAgz2UYZgX4J4x9dm31JWu9d.Fe6cKD00lAx8eXFWDNw7PJQdnJsS', NOW()),
  ('u_worker', 'worker', 'Сотрудник', 'worker', '$2b$12$ss7t7FYQ0JEkVf7g3JXDUO0Kq2pfih53uXt4fV3.6O7eSLoJ.pVii', NOW())
ON CONFLICT (username) DO NOTHING;
