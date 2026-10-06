INSERT INTO stock_product_subcategories (business_category, name, created_at)
VALUES ('Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO stock_products (
  id,
  name,
  business_category,
  category,
  created_at
)
VALUES
  ('prod_chicken_wings', 'Крылышки куриные', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:01+00'),
  ('prod_chicken_drumstick', 'Ножка (голень) куриная', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:02+00'),
  ('prod_chicken_leg_quarter', 'Окорочок куриный', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:03+00'),
  ('prod_chicken_half_second_category', 'Полутушка куриная 2 категории', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:04+00'),
  ('prod_chicken_fillet', 'Филе куриное', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:05+00'),
  ('prod_chicken_cutlets_volzhskie_75g', 'Котлеты "Волжские" (75г)', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:06+00'),
  ('prod_chicken_breaded_breast_cutlets', 'Котлеты "Грудка куриная в панировке"', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:07+00'),
  ('prod_chicken_mince', 'Фарш куриный', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:08+00'),
  ('prod_chicken_ham_yuryevskaya', 'Ветчина "Юрьевская"', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:09+00'),
  ('prod_chicken_ham', 'Ветчина куриная', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:10+00'),
  ('prod_chicken_sausage_krestyanskaya_smoked', 'Колбаса «Крестьянская» п/к', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:11+00'),
  ('prod_chicken_sausage_neobyknovennaya', 'Колбаса «Необыкновенная»', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:12+00'),
  ('prod_chicken_boiled_sausage_krylatskaya', 'Колбаса вареная "Крылатская"', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:13+00'),
  ('prod_chicken_boiled_sausage_priozernaya', 'Колбаса вареная "Приозерная"', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:14+00'),
  ('prod_chicken_boiled_sausage_charodeyka', 'Колбаса вареная "Чародейка"', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:15+00'),
  ('prod_chicken_sausage_fantaziya_smoked', 'Колбаса «Фантазия» п/к', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:16+00'),
  ('prod_chicken_sausage_rublenaya_smoked', 'Колбаса "Рубленая" п/к', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:17+00'),
  ('prod_chicken_ham_sausages_cheese_smoked', 'Колбаски ветчинные с сыром в/к', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:18+00'),
  ('prod_chicken_pate_petrovsky', 'Паштет "Петровский"', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:19+00'),
  ('prod_chicken_sardelki_polyanskie_cheese', 'Сардельки "Полянские" с сыром', 'Курица', 'Курица', TIMESTAMPTZ '2026-09-29 16:25:20+00')
ON CONFLICT (name) DO UPDATE SET
  business_category = EXCLUDED.business_category,
  category = EXCLUDED.category;
