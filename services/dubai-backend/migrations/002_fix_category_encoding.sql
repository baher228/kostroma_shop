UPDATE stock_products
SET category = CASE id
  WHEN 'prod_yogurt_apricot' THEN 'Йогурты'
  WHEN 'prod_kefir_1' THEN 'Кефир, Ряженка, Снежок'
  WHEN 'prod_milk_32' THEN 'Молоко'
  ELSE category
END
WHERE id IN ('prod_yogurt_apricot', 'prod_kefir_1', 'prod_milk_32');

ALTER TABLE stock_products
  ALTER COLUMN category SET DEFAULT 'Йогурты';

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_category_check;

ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_category_check
  CHECK (category IN ('Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'));
