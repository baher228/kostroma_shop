ALTER TABLE stock_products
  ADD COLUMN IF NOT EXISTS unit_price_rub_vat NUMERIC(10, 2) NULL;

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_unit_price_rub_vat_check;
ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_unit_price_rub_vat_check
  CHECK (unit_price_rub_vat IS NULL OR unit_price_rub_vat >= 0);

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_category_check;

WITH reference_data(name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat) AS (
  VALUES
    ('Йогурт Абрикос 2,5% ПЭТ 480 г', 'Йогурты', 'ПЭТ', 6, 2.88, 21, 47.46),
    ('Йогурт Клубника 2,5% ПЭТ 480 г', 'Йогурты', 'ПЭТ', 6, 2.88, 21, 47.46),
    ('Биойогурт Малина 3% стак 0,18 кг', 'Йогурты', 'стакан', 12, 2.16, 14, 32.22),
    ('Биойогурт Земляника 3% стак 0,18 кг', 'Йогурты', 'стакан', 12, 2.16, 14, 32.22),
    ('Биойогурт Персик-Маракуйя 3% стак 0,18 кг', 'Йогурты', 'стакан', 12, 2.16, 14, 32.22),
    ('Биойогурт Черника 3% стак 0,18 кг', 'Йогурты', 'стакан', 12, 2.16, 14, 32.22),
    ('Биойогурт с бифидобактериями 3,5% стак 0,33 кг', 'Йогурты', 'стакан', 12, 3.96, 14, 35.86),

    ('Кефир 1.0% ПЭТ 480 гр.', 'Кефир, Ряженка, Снежок', 'ПЭТ', 6, 2.88, 14, 40.47),
    ('Кефир 3.2% п/э 0.5 кг', 'Кефир, Ряженка, Снежок', 'П/Э', 20, 10, 14, 36.96),
    ('Снежок 2,5% 0,48 кг ПЭТ', 'Кефир, Ряженка, Снежок', 'ПЭТ', 6, 2.88, 14, 45.50),
    ('Ряженка 3.2% ПЭТ 480 гр.', 'Кефир, Ряженка, Снежок', 'ПЭТ', 6, 2.88, 14, 46.73),

    ('Молоко 1,5% ПЭТ 930 мл', 'Молоко', 'ПЭТ', 6, 5.58, 14, 73.42),
    ('Молоко 3,2% ПЭТ 930 мл', 'Молоко', 'ПЭТ', 6, 5.58, 14, 68.61),
    ('Молоко 3.2% п/э 0,9 л', 'Молоко', 'П/Э', 20, 18, 14, 56.02),
    ('Молоко 3.2% ПЭТ 1,4 л', 'Молоко', 'П/Э', 20, 18, 14, 56.02),
    ('Молоко 2.5% ПЭТ 930 мл', 'Молоко', 'ПЭТ', 6, 5.58, 14, 63.50),
    ('Топленое молоко 3.2% ПЭТ 480 гр.', 'Молоко', 'ПЭТ', 6, 2.88, 14, 43.33),

    ('Сметана 15% ст 0.25 кг', 'Сметана', 'стакан', 12, 3, 21, 53.22),
    ('Сметана 20% ст 0.25 кг', 'Сметана', 'стакан', 12, 3, 21, 58.92),

    ('Творог 5% фольга 0.2 кг', 'Творог', 'флоу-пак, фольга', 14, 2.8, 10, 62.14),
    ('Масло сливочное 61.5% фольга 0,2кг', 'Творог', NULL::text, NULL::integer, NULL::numeric, NULL::integer, NULL::numeric),
    ('Масло сливочное 72.5% фольга 0,2кг', 'Творог', 'гофротара', 1, 4, 10, 603.88),
    ('Масло сливочное 82.5% фольга 0,2кг', 'Творог', 'гофротара', 1, 4, 10, 768.65),
    ('Творог 5% пакет 0,27кг', 'Творог', NULL::text, NULL::integer, NULL::numeric, NULL::integer, NULL::numeric)
)
UPDATE stock_products AS sp
SET
  category = reference_data.category,
  pack_type = reference_data.pack_type,
  units_in_pack = reference_data.units_in_pack,
  pack_weight_kg = reference_data.pack_weight_kg,
  shelf_life_days = reference_data.shelf_life_days,
  unit_price_rub_vat = reference_data.unit_price_rub_vat
FROM reference_data
WHERE sp.name = reference_data.name;

UPDATE stock_products
SET category = CASE
  WHEN LOWER(name) LIKE 'йогурт%' OR LOWER(name) LIKE 'биойогурт%' THEN 'Йогурты'
  WHEN LOWER(name) LIKE 'кефир%' OR LOWER(name) LIKE 'ряженка%' OR LOWER(name) LIKE 'снежок%' THEN 'Кефир, Ряженка, Снежок'
  WHEN LOWER(name) LIKE 'молоко%' OR LOWER(name) LIKE 'топленое молоко%' THEN 'Молоко'
  WHEN LOWER(name) LIKE 'сметана%' THEN 'Сметана'
  WHEN LOWER(name) LIKE 'творог%' OR LOWER(name) LIKE 'масло сливочное%' THEN 'Творог'
  ELSE 'Йогурты'
END;

ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_category_check
  CHECK (category IN ('Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'));
