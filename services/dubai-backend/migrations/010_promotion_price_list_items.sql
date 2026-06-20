DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'promotion_storage_documents'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%document_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE promotion_storage_documents DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE promotion_storage_documents
  ADD CONSTRAINT promotion_storage_documents_document_type_check
  CHECK (document_type IN ('invoice', 'two_month_plan', 'retail_price_list', 'final_table_csv'));

CREATE TABLE IF NOT EXISTS promotion_price_list_items (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NULL,
  source_row_number INTEGER NULL,
  category TEXT NULL,
  product_name_raw TEXT NULL,
  product_name_clean TEXT NULL,
  product_name TEXT NULL,
  normalized_product_name TEXT NULL,
  regular_price NUMERIC(12,2) NULL,
  source_file_name TEXT NULL,
  uploaded_by TEXT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE promotion_price_list_items
  ADD COLUMN IF NOT EXISTS source_document_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_row_number INTEGER NULL,
  ADD COLUMN IF NOT EXISTS category TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_name_raw TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_name_clean TEXT NULL,
  ADD COLUMN IF NOT EXISTS product_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS normalized_product_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS regular_price NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS source_file_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'promotion_price_list_items_source_document_fk'
      AND conrelid = 'promotion_price_list_items'::regclass
  ) THEN
    ALTER TABLE promotion_price_list_items
      ADD CONSTRAINT promotion_price_list_items_source_document_fk
      FOREIGN KEY (source_document_id) REFERENCES promotion_storage_documents(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS promotion_price_list_items_source_idx
  ON promotion_price_list_items (source_document_id);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_price_list_items_normalized_unique_idx
  ON promotion_price_list_items (normalized_product_name);
