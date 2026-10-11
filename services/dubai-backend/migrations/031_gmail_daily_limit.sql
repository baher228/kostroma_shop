ALTER TABLE gmail_deliveries ADD COLUMN IF NOT EXISTS send_started_at TIMESTAMPTZ NULL;
UPDATE gmail_deliveries SET send_started_at=COALESCE(sent_at,updated_at)
WHERE send_started_at IS NULL AND status IN ('sent','sending','unknown');
CREATE INDEX IF NOT EXISTS gmail_deliveries_recipient_limit_idx ON gmail_deliveries(lower(recipient))
WHERE status IN ('sent','sending','unknown');
