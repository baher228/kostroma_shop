ALTER TABLE promotion_documents
  ADD COLUMN IF NOT EXISTS content_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS size_bytes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE promotion_documents
SET
  content_type = COALESCE(content_type, 'application/octet-stream'),
  size_bytes = COALESCE(size_bytes, 0)
WHERE content_type IS NULL OR size_bytes IS NULL;

ALTER TABLE promotion_documents
  ALTER COLUMN content_type SET NOT NULL,
  ALTER COLUMN size_bytes SET NOT NULL;
