ALTER TABLE stock_products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Молочная продукция';

UPDATE stock_products
SET category = CASE
  WHEN LOWER(name) LIKE '%сыр%' THEN 'Сыр'
  WHEN LOWER(name) LIKE '%хлеб%' OR LOWER(name) LIKE '%батон%' OR LOWER(name) LIKE '%булк%' THEN 'Хлеб'
  WHEN LOWER(name) LIKE '%колбас%' OR LOWER(name) LIKE '%мяс%' OR LOWER(name) LIKE '%деликатес%' THEN 'Мясные деликатесы'
  ELSE category
END;

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_category_check;

ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_category_check
  CHECK (category IN ('Молочная продукция', 'Хлеб', 'Мясные деликатесы', 'Сыр'));

CREATE INDEX IF NOT EXISTS stock_products_category_idx ON stock_products (category);
