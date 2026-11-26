ALTER TABLE stock_products ADD COLUMN IF NOT EXISTS markdown_price_rub NUMERIC(12, 2);

UPDATE stock_products
SET markdown_price_rub = inventory_price_rub
WHERE markdown_price_rub IS NULL
  AND inventory_price_rub IS NOT NULL;
