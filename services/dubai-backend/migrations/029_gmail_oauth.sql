CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS gmail_connection (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  email TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE gmail_imports ADD COLUMN IF NOT EXISTS mailbox TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE gmail_imports DROP CONSTRAINT IF EXISTS gmail_imports_message_id_attachment_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS gmail_imports_mailbox_attachment_idx ON gmail_imports (mailbox,message_id,attachment_key);
