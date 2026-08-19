CREATE FUNCTION pg_temp.promotion_product_core(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT BTRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REPLACE(LOWER(COALESCE(value, '')), 'ё', 'е'),
            'кат(?:егория)?\.?[[:space:]]*[а-яa-z](?:[^[:alnum:]]|$)',
            ' ',
            'gi'
          ),
          'вак(?:уумн[а-я]*)?\.?[[:space:]]*уп(?:аковк[а-я]*)?\.?',
          ' ',
          'gi'
        ),
        '[0-9]+(?:[,.][0-9]+)?[[:space:]]*(?:кг|г)\.?',
        ' ',
        'gi'
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )
  );
$$;

-- Repair legacy unmatched rows only when their normalized source name points
-- to one unambiguous price-list item. One-word names are deliberately skipped.
WITH row_cores AS (
  SELECT
    row.id AS row_id,
    row.promo_price,
    pg_temp.promotion_product_core(COALESCE(row.source_product_name, row.product_name)) AS product_core
  FROM promotion_table_rows row
  WHERE row.price_list_item_id IS NULL
), candidate_matches AS (
  SELECT row_cores.row_id, price.id AS price_list_item_id
  FROM row_cores
  JOIN promotion_price_list_items price
    ON row_cores.product_core = pg_temp.promotion_product_core(price.product_name_raw)
    OR row_cores.product_core = pg_temp.promotion_product_core(COALESCE(price.product_name_clean, price.product_name))
  WHERE POSITION(' ' IN row_cores.product_core) > 0
    AND (row_cores.promo_price IS NULL OR price.regular_price >= row_cores.promo_price)
), unique_matches AS (
  SELECT row_id, MIN(price_list_item_id) AS price_list_item_id
  FROM candidate_matches
  GROUP BY row_id
  HAVING COUNT(DISTINCT price_list_item_id) = 1
)
UPDATE promotion_table_rows row
SET price_list_item_id = price.id,
    product_name = COALESCE(price.product_name_clean, price.product_name, row.product_name),
    regular_price = COALESCE(row.regular_price, price.regular_price),
    match_confidence = GREATEST(COALESCE(row.match_confidence, 0), 0.82),
    updated_at = NOW()
FROM unique_matches matched
JOIN promotion_price_list_items price ON price.id = matched.price_list_item_id
WHERE row.id = matched.row_id;

CREATE SEQUENCE IF NOT EXISTS promotion_table_row_number_seq AS INTEGER;

SELECT SETVAL(
  'promotion_table_row_number_seq',
  GREATEST(COALESCE(MAX(row_number), 0) + 1, 1),
  FALSE
)
FROM promotion_table_rows;

ALTER SEQUENCE promotion_table_row_number_seq
  OWNED BY promotion_table_rows.row_number;

ALTER TABLE promotion_table_rows
  ALTER COLUMN row_number SET DEFAULT NEXTVAL('promotion_table_row_number_seq');

-- Imported rows are aggregates. Every source interval keeps the original
-- values needed to rebuild an aggregate after one of its documents is removed.
CREATE TABLE IF NOT EXISTS promotion_row_intervals (
  id TEXT PRIMARY KEY,
  promotion_row_id TEXT NOT NULL REFERENCES promotion_table_rows(id) ON DELETE CASCADE,
  source_document_id TEXT NOT NULL REFERENCES promotion_storage_documents(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('invoice', 'plan')),
  source_document_file_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'future' CHECK (status IN ('past', 'current', 'future')),
  product_name TEXT NOT NULL DEFAULT '',
  start_date DATE NULL,
  end_date DATE NULL,
  promo_price NUMERIC(10, 2) NULL,
  regular_price NUMERIC(10, 2) NULL,
  source_product_name TEXT NULL,
  source_line_text TEXT NULL,
  price_list_item_id TEXT NULL,
  match_confidence NUMERIC(5, 4) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_row_intervals_row_idx
  ON promotion_row_intervals (promotion_row_id);

CREATE INDEX IF NOT EXISTS promotion_row_intervals_document_idx
  ON promotion_row_intervals (source_document_id);

CREATE INDEX IF NOT EXISTS promotion_row_intervals_product_period_idx
  ON promotion_row_intervals (price_list_item_id, start_date, end_date);

-- Migration 012 could already have linked one invoice and one plan to a single
-- row. Their exact original ranges are no longer recoverable, so both receive
-- the current aggregate range as a best-effort snapshot. Direct source links
-- are de-duplicated against the explicit invoice/plan links.
WITH source_candidates AS (
  SELECT
    row.id AS promotion_row_id,
    document.id AS source_document_id,
    CASE document.document_type
      WHEN 'invoice' THEN 'invoice'
      ELSE 'plan'
    END AS source_type,
    COALESCE(row.source_document_file_name, document.file_name, '') AS source_document_file_name,
    1 AS source_priority
  FROM promotion_table_rows row
  JOIN promotion_storage_documents document ON document.id = row.source_document_id
  WHERE document.document_type IN ('invoice', 'two_month_plan')

  UNION ALL

  SELECT
    row.id,
    document.id,
    'invoice',
    COALESCE(row.invoice_document_file_name, document.file_name, ''),
    2
  FROM promotion_table_rows row
  JOIN promotion_storage_documents document ON document.id = row.invoice_document_id
  WHERE document.document_type = 'invoice'

  UNION ALL

  SELECT
    row.id,
    document.id,
    'plan',
    COALESCE(row.plan_document_file_name, document.file_name, ''),
    3
  FROM promotion_table_rows row
  JOIN promotion_storage_documents document ON document.id = row.plan_document_id
  WHERE document.document_type = 'two_month_plan'
), unique_sources AS (
  SELECT DISTINCT ON (promotion_row_id, source_document_id, source_type)
    promotion_row_id,
    source_document_id,
    source_type,
    source_document_file_name
  FROM source_candidates
  ORDER BY promotion_row_id, source_document_id, source_type, source_priority
)
INSERT INTO promotion_row_intervals (
  id,
  promotion_row_id,
  source_document_id,
  source_type,
  source_document_file_name,
  status,
  product_name,
  start_date,
  end_date,
  promo_price,
  regular_price,
  source_product_name,
  source_line_text,
  price_list_item_id,
  match_confidence,
  created_at,
  updated_at
)
SELECT
  'promo_interval_backfill_' || MD5(
    source.promotion_row_id || ':' || source.source_document_id || ':' || source.source_type
  ),
  row.id,
  source.source_document_id,
  source.source_type,
  source.source_document_file_name,
  row.status,
  row.product_name,
  row.start_date,
  row.end_date,
  row.promo_price,
  row.regular_price,
  row.source_product_name,
  row.source_line_text,
  row.price_list_item_id,
  row.match_confidence,
  row.created_at,
  row.updated_at
FROM unique_sources source
JOIN promotion_table_rows row ON row.id = source.promotion_row_id
ON CONFLICT (id) DO NOTHING;

-- Build overlap/adjacency islands using the maximum previous end date. This
-- handles chains such as 19-31 Aug + 1 Sep, not only pairwise duplicates.
-- Manual rows have no constituents and deliberately stay outside this merge.
CREATE TEMP TABLE promotion_row_merge_map ON COMMIT DROP AS
WITH ordered AS (
  SELECT
    row.*,
    CASE
      WHEN row.price_list_item_id IS NOT NULL THEN 'price:' || row.price_list_item_id
      ELSE 'name:' || LOWER(BTRIM(row.product_name))
    END AS product_key,
    MAX(end_date) OVER (
      PARTITION BY CASE
        WHEN row.price_list_item_id IS NOT NULL THEN 'price:' || row.price_list_item_id
        ELSE 'name:' || LOWER(BTRIM(row.product_name))
      END
      ORDER BY start_date, end_date, row_number
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS previous_max_end
  FROM promotion_table_rows row
  WHERE start_date IS NOT NULL
    AND end_date IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM promotion_row_intervals interval
      WHERE interval.promotion_row_id = row.id
    )
), boundaries AS (
  SELECT
    ordered.*,
    CASE
      WHEN previous_max_end IS NULL OR start_date > previous_max_end + 1 THEN 1
      ELSE 0
    END AS starts_new_island
  FROM ordered
), islands AS (
  SELECT
    boundaries.*,
    SUM(starts_new_island) OVER (
      PARTITION BY product_key
      ORDER BY start_date, end_date, row_number
    ) AS island_number
  FROM boundaries
), ranked AS (
  SELECT
    islands.*,
    FIRST_VALUE(id) OVER (
      PARTITION BY product_key, island_number
      ORDER BY
        (invoice_document_id IS NOT NULL) DESC,
        (plan_document_id IS NOT NULL) DESC,
        end_date DESC,
        updated_at DESC,
        row_number ASC
    ) AS survivor_id
  FROM islands
)
SELECT id AS row_id, survivor_id
FROM ranked;

UPDATE promotion_row_intervals interval
SET promotion_row_id = map.survivor_id,
    updated_at = NOW()
FROM promotion_row_merge_map map
WHERE interval.promotion_row_id = map.row_id
  AND map.row_id <> map.survivor_id;

DELETE FROM promotion_table_rows row
USING promotion_row_merge_map map
WHERE row.id = map.row_id
  AND map.row_id <> map.survivor_id;

-- Rebuild every imported aggregate exclusively from its constituents. Source
-- ids and file names come from the same chosen record to avoid mismatched pairs.
WITH interval_bounds AS (
  SELECT
    promotion_row_id,
    MIN(start_date) AS start_date,
    MAX(end_date) AS end_date
  FROM promotion_row_intervals
  GROUP BY promotion_row_id
), latest_interval AS (
  SELECT DISTINCT ON (interval.promotion_row_id)
    interval.*
  FROM promotion_row_intervals interval
  ORDER BY
    interval.promotion_row_id,
    CASE WHEN interval.source_type = 'invoice' THEN 0 ELSE 1 END,
    interval.end_date DESC NULLS LAST,
    interval.updated_at DESC,
    interval.id DESC
), latest_promo_price AS (
  SELECT DISTINCT ON (interval.promotion_row_id)
    interval.promotion_row_id,
    interval.promo_price
  FROM promotion_row_intervals interval
  WHERE interval.promo_price IS NOT NULL
  ORDER BY
    interval.promotion_row_id,
    CASE WHEN interval.source_type = 'invoice' THEN 0 ELSE 1 END,
    interval.end_date DESC NULLS LAST,
    interval.updated_at DESC,
    interval.id DESC
), latest_regular_price AS (
  SELECT DISTINCT ON (interval.promotion_row_id)
    interval.promotion_row_id,
    interval.regular_price
  FROM promotion_row_intervals interval
  WHERE interval.regular_price IS NOT NULL
  ORDER BY
    interval.promotion_row_id,
    CASE WHEN interval.source_type = 'invoice' THEN 0 ELSE 1 END,
    interval.end_date DESC NULLS LAST,
    interval.updated_at DESC,
    interval.id DESC
), latest_invoice AS (
  SELECT DISTINCT ON (interval.promotion_row_id)
    interval.promotion_row_id,
    interval.source_document_id,
    interval.source_document_file_name
  FROM promotion_row_intervals interval
  WHERE interval.source_type = 'invoice'
  ORDER BY
    interval.promotion_row_id,
    interval.end_date DESC NULLS LAST,
    interval.updated_at DESC,
    interval.id DESC
), latest_plan AS (
  SELECT DISTINCT ON (interval.promotion_row_id)
    interval.promotion_row_id,
    interval.source_document_id,
    interval.source_document_file_name
  FROM promotion_row_intervals interval
  WHERE interval.source_type = 'plan'
  ORDER BY
    interval.promotion_row_id,
    interval.end_date DESC NULLS LAST,
    interval.updated_at DESC,
    interval.id DESC
)
UPDATE promotion_table_rows aggregate
SET status = latest.status,
    product_name = COALESCE(price.product_name_clean, price.product_name, latest.product_name),
    start_date = bounds.start_date,
    end_date = bounds.end_date,
    promo_price = promo.promo_price,
    regular_price = regular.regular_price,
    source_document_id = latest.source_document_id,
    source_document_file_name = latest.source_document_file_name,
    source_product_name = latest.source_product_name,
    source_line_text = latest.source_line_text,
    price_list_item_id = latest.price_list_item_id,
    match_confidence = latest.match_confidence,
    invoice_document_id = invoice.source_document_id,
    invoice_document_file_name = invoice.source_document_file_name,
    plan_document_id = plan.source_document_id,
    plan_document_file_name = plan.source_document_file_name,
    updated_at = NOW()
FROM interval_bounds bounds
JOIN latest_interval latest ON latest.promotion_row_id = bounds.promotion_row_id
LEFT JOIN latest_promo_price promo ON promo.promotion_row_id = bounds.promotion_row_id
LEFT JOIN latest_regular_price regular ON regular.promotion_row_id = bounds.promotion_row_id
LEFT JOIN latest_invoice invoice ON invoice.promotion_row_id = bounds.promotion_row_id
LEFT JOIN latest_plan plan ON plan.promotion_row_id = bounds.promotion_row_id
LEFT JOIN promotion_price_list_items price ON price.id = latest.price_list_item_id
WHERE aggregate.id = bounds.promotion_row_id;
