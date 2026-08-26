DELETE FROM stock_products
WHERE business_category = 'Сыр';

INSERT INTO stock_product_subcategories (business_category, name, created_at)
VALUES ('Сыр', 'Твердый сыр', TIMESTAMPTZ '2026-08-26 14:15:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO stock_products (
  id,
  name,
  business_category,
  category,
  pack_type,
  units_in_pack,
  pack_weight_kg,
  unit_price_rub_vat,
  created_at
)
VALUES
  ('prod_cheese_order_c00001584', 'Премиум Ф', 'Сыр', 'Твердый сыр', 'фольга', 16, 2.720, 184.00, TIMESTAMPTZ '2026-08-26 14:15:01+00'),
  ('prod_cheese_order_c00001507', 'Шоколадное Ф', 'Сыр', 'Твердый сыр', 'фольга', 16, 2.880, 164.00, TIMESTAMPTZ '2026-08-26 14:15:02+00'),
  ('prod_cheese_order_c00001549', 'Боговарово Ф', 'Сыр', 'Твердый сыр', 'фольга', 40, 6.800, 165.00, TIMESTAMPTZ '2026-08-26 14:15:03+00'),
  ('prod_cheese_order_c00001608', 'Малыш Вохма', 'Сыр', 'Твердый сыр', 'пленка', 9, 8.100, 716.00, TIMESTAMPTZ '2026-08-26 14:15:04+00'),
  ('prod_cheese_order_c00000240', 'Российский Вохма', 'Сыр', 'Твердый сыр', 'пленка', 2, 14.000, 680.00, TIMESTAMPTZ '2026-08-26 14:15:05+00'),
  ('prod_cheese_order_c00001794', 'Золотое кольцо', 'Сыр', 'Твердый сыр', 'пленка', 10, 9.000, 706.00, TIMESTAMPTZ '2026-08-26 14:15:06+00'),
  ('prod_cheese_order_c00001798', 'Амстердам Мант', 'Сыр', 'Твердый сыр', 'пленка', 10, 9.000, 706.00, TIMESTAMPTZ '2026-08-26 14:15:07+00'),
  ('prod_cheese_order_c00001803', 'Гауда Мант', 'Сыр', 'Твердый сыр', 'пленка', 3, 10.500, 691.00, TIMESTAMPTZ '2026-08-26 14:15:08+00'),
  ('prod_cheese_order_c00001804', 'Голландский Мант', 'Сыр', 'Твердый сыр', 'пленка', 5, 7.500, 696.00, TIMESTAMPTZ '2026-08-26 14:15:09+00'),
  ('prod_cheese_order_c00001219', 'Костромской Вохм', 'Сыр', 'Твердый сыр', 'пленка', 2, 13.000, 677.00, TIMESTAMPTZ '2026-08-26 14:15:10+00'),
  ('prod_cheese_order_c00001807', 'Пошехонский Мант', 'Сыр', 'Твердый сыр', 'пленка', 2, 13.000, 677.00, TIMESTAMPTZ '2026-08-26 14:15:11+00'),
  ('prod_cheese_order_c00001809', 'Тильзитер Мант', 'Сыр', 'Твердый сыр', 'пленка', 3, 10.500, 696.00, TIMESTAMPTZ '2026-08-26 14:15:12+00'),
  ('prod_cheese_order_c00001810', 'Эдам Мант', 'Сыр', 'Твердый сыр', 'пленка', 3, 10.500, 691.00, TIMESTAMPTZ '2026-08-26 14:15:13+00')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_category = EXCLUDED.business_category,
  category = EXCLUDED.category,
  pack_type = EXCLUDED.pack_type,
  units_in_pack = EXCLUDED.units_in_pack,
  pack_weight_kg = EXCLUDED.pack_weight_kg,
  unit_price_rub_vat = EXCLUDED.unit_price_rub_vat,
  created_at = EXCLUDED.created_at;
