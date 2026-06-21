ALTER TABLE promotion_table_rows
  ADD COLUMN IF NOT EXISTS invoice_document_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS invoice_document_file_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS plan_document_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS plan_document_file_name TEXT NULL;

UPDATE promotion_table_rows
SET invoice_document_id = source_document_id,
    invoice_document_file_name = source_document_file_name
WHERE source_document_id IS NOT NULL
  AND LOWER(COALESCE(source_document_file_name, '')) LIKE '%.pdf'
  AND invoice_document_id IS NULL;

UPDATE promotion_table_rows
SET plan_document_id = source_document_id,
    plan_document_file_name = source_document_file_name
WHERE source_document_id IS NOT NULL
  AND LOWER(COALESCE(source_document_file_name, '')) ~ '\.(xlsx|xls|csv)$'
  AND plan_document_id IS NULL;

WITH candidate_matches AS (
  SELECT
    plan.id AS plan_row_id,
    invoice.id AS invoice_row_id,
    ROW_NUMBER() OVER (PARTITION BY plan.id ORDER BY invoice.updated_at DESC) AS match_rank
  FROM promotion_table_rows plan
  JOIN promotion_table_rows invoice
    ON plan.price_list_item_id = invoice.price_list_item_id
  WHERE plan.plan_document_id IS NOT NULL
    AND invoice.invoice_document_id IS NOT NULL
    AND plan.id <> invoice.id
    AND (
      plan.start_date IS NULL OR plan.end_date IS NULL OR
      invoice.start_date IS NULL OR invoice.end_date IS NULL OR
      (plan.start_date <= invoice.end_date AND invoice.start_date <= plan.end_date)
    )
), best_matches AS (
  SELECT plan_row_id, invoice_row_id
  FROM candidate_matches
  WHERE match_rank = 1
)
UPDATE promotion_table_rows invoice
SET plan_document_id = plan.plan_document_id,
    plan_document_file_name = plan.plan_document_file_name,
    updated_at = NOW()
FROM best_matches matched
JOIN promotion_table_rows plan ON plan.id = matched.plan_row_id
WHERE invoice.id = matched.invoice_row_id;

WITH candidate_matches AS (
  SELECT
    plan.id AS plan_row_id,
    ROW_NUMBER() OVER (PARTITION BY plan.id ORDER BY invoice.updated_at DESC) AS match_rank
  FROM promotion_table_rows plan
  JOIN promotion_table_rows invoice
    ON plan.price_list_item_id = invoice.price_list_item_id
  WHERE plan.plan_document_id IS NOT NULL
    AND invoice.invoice_document_id IS NOT NULL
    AND plan.id <> invoice.id
    AND (
      plan.start_date IS NULL OR plan.end_date IS NULL OR
      invoice.start_date IS NULL OR invoice.end_date IS NULL OR
      (plan.start_date <= invoice.end_date AND invoice.start_date <= plan.end_date)
    )
)
DELETE FROM promotion_table_rows plan
USING candidate_matches matched
WHERE plan.id = matched.plan_row_id
  AND matched.match_rank = 1;

CREATE INDEX IF NOT EXISTS promotion_table_rows_invoice_document_idx
  ON promotion_table_rows (invoice_document_id);

CREATE INDEX IF NOT EXISTS promotion_table_rows_plan_document_idx
  ON promotion_table_rows (plan_document_id);
