INSERT INTO stock_product_subcategories (business_category, name, created_at)
VALUES ('Хлеб', 'Хлеб', TIMESTAMPTZ '2026-09-29 16:45:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO stock_products (
  id,
  name,
  business_category,
  category,
  units_in_pack,
  min_stock_units,
  created_at
)
VALUES (
  'prod_galich_baton_nareznoy_0175',
  'Батон Нарезной 0.175 нарезка',
  'Хлеб',
  'Хлеб',
  1,
  0,
  TIMESTAMPTZ '2026-09-29 16:45:01+00'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_category = EXCLUDED.business_category,
  category = EXCLUDED.category,
  units_in_pack = EXCLUDED.units_in_pack,
  min_stock_units = EXCLUDED.min_stock_units;
