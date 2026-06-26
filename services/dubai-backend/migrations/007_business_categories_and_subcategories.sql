ALTER TABLE stock_products
  ADD COLUMN IF NOT EXISTS business_category TEXT NOT NULL DEFAULT 'Молоко';

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_business_category_check;

ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_business_category_check
  CHECK (business_category IN ('Хлеб', 'Молоко', 'Деликатесы', 'Сыр'));

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_category_check;

CREATE INDEX IF NOT EXISTS stock_products_business_category_idx
  ON stock_products (business_category);

CREATE TABLE IF NOT EXISTS stock_product_subcategories (
  business_category TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_category, name),
  CHECK (business_category IN ('Хлеб', 'Молоко', 'Деликатесы', 'Сыр')),
  CHECK (length(trim(name)) BETWEEN 1 AND 80)
);

INSERT INTO stock_product_subcategories (business_category, name)
VALUES
  ('Хлеб', 'Хлеб'),
  ('Хлеб', 'Выпечка'),
  ('Хлеб', 'Лаваш'),
  ('Молоко', 'Йогурты'),
  ('Молоко', 'Кефир, Ряженка, Снежок'),
  ('Молоко', 'Молоко'),
  ('Молоко', 'Сметана'),
  ('Молоко', 'Творог'),
  ('Деликатесы', 'Колбасы'),
  ('Деликатесы', 'Мясо'),
  ('Деликатесы', 'Готовая продукция'),
  ('Сыр', 'Твердый сыр'),
  ('Сыр', 'Мягкий сыр'),
  ('Сыр', 'Творожный сыр')
ON CONFLICT DO NOTHING;

INSERT INTO stock_product_subcategories (business_category, name)
SELECT DISTINCT business_category, category
FROM stock_products
WHERE category IS NOT NULL
  AND length(trim(category)) > 0
ON CONFLICT DO NOTHING;
