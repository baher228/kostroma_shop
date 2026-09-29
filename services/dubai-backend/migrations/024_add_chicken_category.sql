ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_business_category_check;

ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_business_category_check
  CHECK (business_category IN ('Хлеб', 'Молоко', 'Деликатесы', 'Сыр', 'Мороженое', 'Курица'));

ALTER TABLE stock_product_subcategories
  DROP CONSTRAINT IF EXISTS stock_product_subcategories_business_category_check;

ALTER TABLE stock_product_subcategories
  ADD CONSTRAINT stock_product_subcategories_business_category_check
  CHECK (business_category IN ('Хлеб', 'Молоко', 'Деликатесы', 'Сыр', 'Мороженое', 'Курица'));

INSERT INTO stock_product_subcategories (business_category, name, created_at)
VALUES ('Курица', 'Курица', TIMESTAMPTZ '2026-09-29 09:56:00+00')
ON CONFLICT DO NOTHING;
