INSERT INTO stock_product_subcategories (business_category, name, created_at)
VALUES ('Курица', 'Курица', TIMESTAMPTZ '2026-10-05 01:02:00+00')
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
VALUES
  (
    'prod_chicken_egg_c0',
    'Яйцо С0',
    'Курица',
    'Курица',
    1,
    0,
    TIMESTAMPTZ '2026-10-05 01:02:01+00'
  ),
  (
    'prod_chicken_egg_c1',
    'Яйцо С1',
    'Курица',
    'Курица',
    1,
    0,
    TIMESTAMPTZ '2026-10-05 01:02:02+00'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_category = EXCLUDED.business_category,
  category = EXCLUDED.category,
  units_in_pack = EXCLUDED.units_in_pack,
  min_stock_units = EXCLUDED.min_stock_units;
