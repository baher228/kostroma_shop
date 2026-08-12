CREATE TABLE IF NOT EXISTS user_push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx ON user_push_tokens (user_id);
