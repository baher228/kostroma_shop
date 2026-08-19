INSERT INTO stock_products (
  id,
  name,
  business_category,
  category,
  pack_type,
  units_in_pack,
  pack_weight_kg,
  created_at
)
VALUES (
  'prod_tvorog_5_packet_027',
  'Творог 5% пакет 0.27кг',
  'Молоко',
  'Творог',
  'пакет',
  8,
  2.160,
  TIMESTAMPTZ '2026-08-17 14:27:00+00'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_category = EXCLUDED.business_category,
  category = EXCLUDED.category,
  pack_type = EXCLUDED.pack_type,
  units_in_pack = EXCLUDED.units_in_pack,
  pack_weight_kg = EXCLUDED.pack_weight_kg;
