-- Ассортимент из файла «Галич с 24.09.2026.xlsx», лист «Галич».
-- Колонка «рекомендованная полка» используется как целевой максимум остатка.
INSERT INTO stock_product_subcategories (business_category, name, created_at)
VALUES
  ('Хлеб', 'Хлеб', TIMESTAMPTZ '2026-09-24 00:00:00+00'),
  ('Хлеб', 'Выпечка', TIMESTAMPTZ '2026-09-24 00:00:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO stock_products (
  id,
  name,
  business_category,
  category,
  units_in_pack,
  min_stock_units,
  max_stock_units,
  created_at
)
VALUES
  ('prod_galich_baton_nareznoy_0350', 'Батон Нарезной 0.350 нарезка', 'Хлеб', 'Хлеб', 1, 0, 56, TIMESTAMPTZ '2026-09-24 00:00:01+00'),
  ('prod_galich_baton_otrubyami_0300', 'Батон с отрубями 0.300 нарезка', 'Хлеб', 'Хлеб', 1, 0, 55, TIMESTAMPTZ '2026-09-24 00:00:02+00'),
  ('prod_galich_baton_gorchichnyy_0350', 'Батон Горчичный 0.350 нарезка', 'Хлеб', 'Хлеб', 1, 0, 61, TIMESTAMPTZ '2026-09-24 00:00:03+00'),
  ('prod_galich_baton_zernovoy_0350', 'Батон Зерновой 0.350 нарезка', 'Хлеб', 'Хлеб', 1, 0, 66, TIMESTAMPTZ '2026-09-24 00:00:04+00'),
  ('prod_galich_khleb_darnitskiy_0300', 'Хлеб Дарницкий 0.300 нарезка', 'Хлеб', 'Хлеб', 1, 0, 34, TIMESTAMPTZ '2026-09-24 00:00:05+00'),
  ('prod_galich_khleb_darnitskiy_0600', 'Хлеб Дарницкий 0.600 нарезка', 'Хлеб', 'Хлеб', 1, 0, 59, TIMESTAMPTZ '2026-09-24 00:00:06+00'),
  ('prod_galich_khleb_krasnoselskiy_0400', 'Хлеб Красносельский 0.400 нарезка', 'Хлеб', 'Хлеб', 1, 0, 59, TIMESTAMPTZ '2026-09-24 00:00:07+00'),
  ('prod_galich_khleb_tostovyy_0430', 'Хлеб Тостовый 0.430 нарезка', 'Хлеб', 'Хлеб', 1, 0, 80, TIMESTAMPTZ '2026-09-24 00:00:08+00'),
  ('prod_galich_khleb_tostovyy_otrubyami_0430', 'Хлеб Тостовый с отрубями 0.430 нарезка', 'Хлеб', 'Хлеб', 1, 0, 80, TIMESTAMPTZ '2026-09-24 00:00:09+00'),
  ('prod_galich_khleb_grechishnyy_medu_04', 'Хлеб Гречишный на меду 0,4 нарезка', 'Хлеб', 'Хлеб', 1, 0, 77, TIMESTAMPTZ '2026-09-24 00:00:10+00'),
  ('prod_galich_khleb_tostovyy_borodinskiy_0430', 'Хлеб Тостовый Бородинский 0.430 нарезка', 'Хлеб', 'Хлеб', 1, 0, 80, TIMESTAMPTZ '2026-09-24 00:00:11+00'),
  ('prod_galich_rulet_izyumom_0300', 'Рулет с изюмом 0.300', 'Хлеб', 'Выпечка', 1, 0, 54, TIMESTAMPTZ '2026-09-24 00:00:12+00'),
  ('prod_galich_baget_prostoy_0250', 'Багет простой 0.250', 'Хлеб', 'Хлеб', 1, 0, 51, TIMESTAMPTZ '2026-09-24 00:00:13+00'),
  ('prod_galich_khleb_pshenichnyy_zakvaske_0400', 'Хлеб Пшеничный на закваске 0.400 нарезка', 'Хлеб', 'Хлеб', 1, 0, 106, TIMESTAMPTZ '2026-09-24 00:00:14+00'),
  ('prod_galich_khleb_multizernovoy_zakvaske_0400', 'Хлеб Мультизерновой на закваске 0.400 нарезка', 'Хлеб', 'Хлеб', 1, 0, 115, TIMESTAMPTZ '2026-09-24 00:00:15+00'),
  ('prod_galich_khleb_fermerskiy_zakvaske_04', 'Хлеб Фермерский на закваске 0,4 нарезка', 'Хлеб', 'Хлеб', 1, 0, 104, TIMESTAMPTZ '2026-09-24 00:00:16+00'),
  ('prod_galich_khleb_sibirskiy_0300', 'Хлеб Сибирский 0.300 нарезка', 'Хлеб', 'Хлеб', 1, 0, 68, TIMESTAMPTZ '2026-09-24 00:00:17+00'),
  ('prod_galich_khleb_semechko_0300', 'Хлеб Семечко 0.300 нарезка', 'Хлеб', 'Хлеб', 1, 0, 70, TIMESTAMPTZ '2026-09-24 00:00:18+00'),
  ('prod_galich_lepeshka_syrom_0100', 'Лепёшка с сыром 0.100', 'Хлеб', 'Хлеб', 1, 0, 40, TIMESTAMPTZ '2026-09-24 00:00:19+00'),
  ('prod_galich_plyushka_novomoskovskaya_0150', 'Плюшка Новомосковская 0.150', 'Хлеб', 'Выпечка', 1, 0, 35, TIMESTAMPTZ '2026-09-24 00:00:20+00'),
  ('prod_galich_chiabattini_pshenichnaya_0130', 'Чиабаттини пшеничная 0,130', 'Хлеб', 'Хлеб', 1, 0, 37, TIMESTAMPTZ '2026-09-24 00:00:21+00'),
  ('prod_galich_shtrudel_abrikosom_0080', 'Штрудель с абрикосом 0.080', 'Хлеб', 'Выпечка', 1, 0, 44, TIMESTAMPTZ '2026-09-24 00:00:22+00'),
  ('prod_galich_pirozhnoe_beze', 'Пирожное Безе', 'Хлеб', 'Выпечка', 1, 0, 517, TIMESTAMPTZ '2026-09-24 00:00:23+00'),
  ('prod_galich_pirozhnoe_ekler', 'Пирожное заварное Эклер', 'Хлеб', 'Выпечка', 1, 0, 486, TIMESTAMPTZ '2026-09-24 00:00:24+00'),
  ('prod_galich_pirozhnoe_pautinka', 'Пирожное Паутинка', 'Хлеб', 'Выпечка', 1, 0, 580, TIMESTAMPTZ '2026-09-24 00:00:25+00'),
  ('prod_galich_pirozhnoe_korzh_novinka', 'Пирожное Корж Новинка', 'Хлеб', 'Выпечка', 1, 0, 400, TIMESTAMPTZ '2026-09-24 00:00:26+00'),
  ('prod_galich_pirozhnoe_sochni_tvorogom', 'Пирожное Сочни с творогом', 'Хлеб', 'Выпечка', 1, 0, 507, TIMESTAMPTZ '2026-09-24 00:00:27+00'),
  ('prod_galich_pirozhnoe_keksiki_biskvitnye', 'Пирожное Кексики бисквитные', 'Хлеб', 'Выпечка', 1, 0, 408, TIMESTAMPTZ '2026-09-24 00:00:28+00')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_category = EXCLUDED.business_category,
  category = EXCLUDED.category,
  units_in_pack = EXCLUDED.units_in_pack,
  min_stock_units = EXCLUDED.min_stock_units,
  max_stock_units = EXCLUDED.max_stock_units;
