CREATE TABLE IF NOT EXISTS promotion_storage_documents (
  id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'two_month_plan', 'final_table_csv')),
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_storage_documents_type_uploaded_idx
  ON promotion_storage_documents (document_type, uploaded_at DESC);
