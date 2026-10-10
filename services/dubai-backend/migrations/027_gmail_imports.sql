CREATE TABLE IF NOT EXISTS gmail_imports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  attachment_id TEXT NULL,
  attachment_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NULL,
  file_hash TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'success', 'failed', 'skipped')),
  error TEXT NULL,
  retryable BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  promotion_document_id TEXT NULL REFERENCES promotion_storage_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, attachment_key)
);
CREATE INDEX IF NOT EXISTS gmail_imports_history_idx ON gmail_imports (created_at DESC, id);
CREATE INDEX IF NOT EXISTS gmail_imports_hash_idx ON gmail_imports (file_hash) WHERE status = 'success';

-- Objects uploaded before a process interruption are registered persistently.
-- They are removed under the Gmail poll lock before an interrupted import retry.
CREATE TABLE IF NOT EXISTS promotion_import_objects (
  storage_key TEXT PRIMARY KEY,
  gmail_import_id TEXT NULL REFERENCES gmail_imports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
