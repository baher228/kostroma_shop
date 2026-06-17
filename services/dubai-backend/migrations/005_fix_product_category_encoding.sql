ALTER TABLE stock_products
  ALTER COLUMN category DROP DEFAULT;

UPDATE stock_products
SET category = CASE category
  WHEN 'Ð™Ð¾Ð³ÑƒÑ€Ñ‚Ñ‹' THEN 'Йогурты'
  WHEN 'ÐšÐµÑ„Ð¸Ñ€, Ð ÑÐ¶ÐµÐ½ÐºÐ°, Ð¡Ð½ÐµÐ¶Ð¾Ðº' THEN 'Кефир, Ряженка, Снежок'
  WHEN 'ÐœÐ¾Ð»Ð¾ÐºÐ¾' THEN 'Молоко'
  WHEN 'Ð¡Ð¼ÐµÑ‚Ð°Ð½Ð°' THEN 'Сметана'
  WHEN 'Ð¢Ð²Ð¾Ñ€Ð¾Ð³' THEN 'Творог'
  ELSE category
END;

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_category_check;

ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_category_check
  CHECK (category IN ('Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'));

ALTER TABLE stock_products
  ALTER COLUMN category SET DEFAULT 'Йогурты';
