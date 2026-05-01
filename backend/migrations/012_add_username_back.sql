ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE users
SET username = 'manager'
WHERE id = 'u_manager_01' AND (username IS NULL OR username = '');

UPDATE users
SET username = lower(id)
WHERE username IS NULL OR username = '';

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (username);
