ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE users DROP COLUMN IF EXISTS username;
ALTER TABLE users DROP COLUMN IF EXISTS display_name;

DELETE FROM users;

ALTER TABLE users
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL;

INSERT INTO users (id, first_name, last_name, role, password_hash, shop_id, created_at)
VALUES
  (
    'u_manager_01',
    'Главный',
    'Менеджер',
    'manager',
    '$2b$12$CAgz2UYZgX4J4x9dm31JWu9d.Fe6cKD00lAx8eXFWDNw7PJQdnJsS',
    NULL,
    NOW()
  );
