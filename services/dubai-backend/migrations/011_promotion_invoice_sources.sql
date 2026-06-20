ALTER TABLE promotion_table_rows
  ADD COLUMN IF NOT EXISTS source_document_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_document_file_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_product_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_line_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS price_list_item_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,4) NULL;

CREATE INDEX IF NOT EXISTS promotion_table_rows_source_document_idx
  ON promotion_table_rows (source_document_id);

