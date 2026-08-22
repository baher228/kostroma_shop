ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_business_category_check;

ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_business_category_check
  CHECK (business_category IN ('Хлеб', 'Молоко', 'Деликатесы', 'Сыр', 'Мороженое'));

ALTER TABLE stock_product_subcategories
  DROP CONSTRAINT IF EXISTS stock_product_subcategories_business_category_check;

ALTER TABLE stock_product_subcategories
  ADD CONSTRAINT stock_product_subcategories_business_category_check
  CHECK (business_category IN ('Хлеб', 'Молоко', 'Деликатесы', 'Сыр', 'Мороженое'));

INSERT INTO stock_product_subcategories (business_category, name, created_at)
VALUES ('Мороженое', 'Мороженое', TIMESTAMPTZ '2026-08-22 11:15:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO stock_products (
  id,
  name,
  business_category,
  category,
  units_in_pack,
  pack_weight_kg,
  created_at
)
VALUES
  ('prod_icecream_cone_milk_raspberry', 'Рожок молочный малина', 'Мороженое', 'Мороженое', 24, 1.800, TIMESTAMPTZ '2026-08-22 11:15:01+00'),
  ('prod_icecream_strawberry_waffle_cup_75', 'Клубника в вафельном ст 3,5% 75г', 'Мороженое', 'Мороженое', 24, 1.800, TIMESTAMPTZ '2026-08-22 11:15:02+00'),
  ('prod_icecream_creme_brulee_condensed_75', 'Крем-брюле с вар сгущенкой 3,5% 75г', 'Мороженое', 'Мороженое', 24, 1.680, TIMESTAMPTZ '2026-08-22 11:15:03+00'),
  ('prod_icecream_plombir_15_70', 'Пломбир 15% 70г', 'Мороженое', 'Мороженое', 18, 1.800, TIMESTAMPTZ '2026-08-22 11:15:04+00'),
  ('prod_icecream_plombir_strawberry_waffle_cone', 'Пломбир с клубникой в вафельном рожке', 'Мороженое', 'Мороженое', 20, 1.400, TIMESTAMPTZ '2026-08-22 11:15:05+00')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_category = EXCLUDED.business_category,
  category = EXCLUDED.category,
  units_in_pack = EXCLUDED.units_in_pack,
  pack_weight_kg = EXCLUDED.pack_weight_kg;
