ALTER TABLE gmail_connection ADD COLUMN IF NOT EXISTS granted_scopes TEXT[] NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS gmail_delivery_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  recipient TEXT NULL,
  allowed_senders TEXT[] NOT NULL DEFAULT '{}',
  auto_send BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(allowed_senders) <= 50)
);
CREATE TABLE IF NOT EXISTS gmail_deliveries (
  id TEXT PRIMARY KEY,
  mailbox TEXT NOT NULL,
  source_key TEXT NOT NULL,
  message_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','preparing','ready','sending','sent','failed','unknown')),
  manual BOOLEAN NOT NULL DEFAULT FALSE,
  rows_snapshot JSONB NULL,
  storage_key TEXT NULL,
  manifest JSONB NULL,
  recipient TEXT NULL,
  send_message_id TEXT NOT NULL UNIQUE,
  gmail_sent_id TEXT NULL,
  error TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  UNIQUE (mailbox,source_key)
);
CREATE INDEX IF NOT EXISTS gmail_deliveries_pending_idx ON gmail_deliveries (updated_at) WHERE status NOT IN ('sent','failed');
