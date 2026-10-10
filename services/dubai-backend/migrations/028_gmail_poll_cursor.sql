-- A bounded poll must advance beyond already-terminal recent messages, even
-- when the process restarts. Query changes reset the cursor automatically.
CREATE TABLE IF NOT EXISTS gmail_poll_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  query TEXT NOT NULL,
  page_token TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
