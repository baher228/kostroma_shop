INSERT INTO users (id, username, first_name, last_name, role, password_hash, shop_id, created_at)
VALUES
  ('u_admin_01', 'admin', 'Admin', 'User', 'manager', '$2b$12$F14tV9IWD0x2KTjkwwTNLeovC2Mz0taebHkcuLdc4P6sw8G8ScRUW', NULL, NOW())
ON CONFLICT (username) DO UPDATE
SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  shop_id = NULL;
