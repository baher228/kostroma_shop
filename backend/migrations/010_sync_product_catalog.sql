DO $$
DECLARE
  old_id TEXT;
  canonical_id TEXT;
BEGIN
  SELECT id INTO old_id
  FROM stock_products
  WHERE name = 'Биойогурт с бифидобактериями 3,5% с. 0,33 кг'
  LIMIT 1;

  SELECT id INTO canonical_id
  FROM stock_products
  WHERE name = 'Биойогурт с бифидобактериями 3,5% стак 0,33 кг'
  LIMIT 1;

  IF old_id IS NOT NULL AND canonical_id IS NOT NULL AND old_id <> canonical_id THEN
    INSERT INTO stock_values (shop_id, product_id, day_date, value, updated_at)
    SELECT shop_id, canonical_id, day_date, value, updated_at
    FROM stock_values
    WHERE product_id = old_id
    ON CONFLICT (shop_id, product_id, day_date)
    DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = GREATEST(stock_values.updated_at, EXCLUDED.updated_at);

    DELETE FROM stock_products WHERE id = old_id;
  ELSIF old_id IS NOT NULL AND canonical_id IS NULL THEN
    UPDATE stock_products
    SET name = 'Биойогурт с бифидобактериями 3,5% стак 0,33 кг'
    WHERE id = old_id;
  END IF;
END $$;

WITH catalog(name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat) AS (
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
),
upserted AS (
  INSERT INTO stock_products (id, name, category, pack_type, units_in_pack, pack_weight_kg, shelf_life_days, unit_price_rub_vat, created_at)
  SELECT
    CONCAT('prod_sync_', SUBSTRING(md5(name) FROM 1 FOR 16)),
    name,
    category,
    pack_type,
    units_in_pack,
    pack_weight_kg,
    shelf_life_days,
    unit_price_rub_vat,
    NOW()
  FROM catalog
  ON CONFLICT (name) DO NOTHING
  RETURNING id
)
UPDATE stock_products AS sp
SET
  category = catalog.category,
  pack_type = catalog.pack_type,
  units_in_pack = catalog.units_in_pack,
  pack_weight_kg = catalog.pack_weight_kg,
  shelf_life_days = catalog.shelf_life_days,
  unit_price_rub_vat = catalog.unit_price_rub_vat
FROM catalog
WHERE sp.name = catalog.name;

DELETE FROM stock_products
WHERE name NOT IN (
  'Йогурт Абрикос 2,5% ПЭТ 480 г',
  'Йогурт Клубника 2,5% ПЭТ 480 г',
  'Биойогурт Малина 3% стак 0,18 кг',
  'Биойогурт Земляника 3% стак 0,18 кг',
  'Биойогурт Персик-Маракуйя 3% стак 0,18 кг',
  'Биойогурт Черника 3% стак 0,18 кг',
  'Биойогурт с бифидобактериями 3,5% стак 0,33 кг',
  'Кефир 1.0% ПЭТ 480 гр.',
  'Кефир 3.2% п/э 0.5 кг',
  'Снежок 2,5% 0,48 кг ПЭТ',
  'Ряженка 3.2% ПЭТ 480 гр.',
  'Молоко 1,5% ПЭТ 930 мл',
  'Молоко 3,2% ПЭТ 930 мл',
  'Молоко 3.2% п/э 0,9 л',
  'Молоко 3.2% ПЭТ 1,4 л',
  'Молоко 2.5% ПЭТ 930 мл',
  'Топленое молоко 3.2% ПЭТ 480 гр.',
  'Сметана 15% ст 0.25 кг',
  'Сметана 20% ст 0.25 кг',
  'Творог 5% фольга 0.2 кг',
  'Масло сливочное 61.5% фольга 0,2кг',
  'Масло сливочное 72.5% фольга 0,2кг',
  'Масло сливочное 82.5% фольга 0,2кг',
  'Творог 5% пакет 0,27кг'
);
