ALTER TABLE stock_products
  ADD COLUMN IF NOT EXISTS pack_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS units_in_pack INTEGER NULL,
  ADD COLUMN IF NOT EXISTS pack_weight_kg NUMERIC(10, 3) NULL,
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER NULL;

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_units_in_pack_check;
ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_units_in_pack_check
  CHECK (units_in_pack IS NULL OR units_in_pack > 0);

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_pack_weight_kg_check;
ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_pack_weight_kg_check
  CHECK (pack_weight_kg IS NULL OR pack_weight_kg > 0);

ALTER TABLE stock_products
  DROP CONSTRAINT IF EXISTS stock_products_shelf_life_days_check;
ALTER TABLE stock_products
  ADD CONSTRAINT stock_products_shelf_life_days_check
  CHECK (shelf_life_days IS NULL OR shelf_life_days > 0);

WITH reference_data(name, pack_type, units_in_pack, pack_weight_kg, shelf_life_days) AS (
  VALUES
    ('Йогурт Абрикос 2,5% ПЭТ 480 г', 'ПЭТ', 6, 2.88, 21),
    ('Йогурт Клубника 2,5% ПЭТ 480 г', 'ПЭТ', 6, 2.88, 21),
    ('Биойогурт Малина 3% стак 0,18 кг', 'стакан', 12, 2.16, 14),
    ('Биойогурт Земляника 3% стак 0,18 кг', 'стакан', 12, 2.16, 14),
    ('Биойогурт Персик-Маракуйя 3% стак 0,18 кг', 'стакан', 12, 2.16, 14),
    ('Биойогурт Черника 3% стак 0,18 кг', 'стакан', 12, 2.16, 14),
    ('Биойогурт с бифидобактериями 3,5% стак 0,33 кг', 'стакан', 12, 3.96, 14),
    ('Кефир 1.0% ПЭТ 480 гр.', 'ПЭТ', 6, 2.88, 14),
    ('Кефир 3.2% п/э 0.5 кг', 'П/Э', 20, 10, 14),
    ('Снежок 2,5% 0,48 кг ПЭТ', 'ПЭТ', 6, 2.88, 14),
    ('Ряженка 3.2% ПЭТ 480 гр.', 'ПЭТ', 6, 2.88, 14),
    ('Молоко 1,5% ПЭТ 930 мл', 'ПЭТ', 6, 5.58, 14),
    ('Молоко 3,2% ПЭТ 930 мл', 'ПЭТ', 6, 5.58, 14),
    ('Молоко 3.2% п/э 0,9 л', 'П/Э', 20, 18, 14),
    ('Молоко 3.2% ПЭТ 1,4 л', 'П/Э', 20, 18, 14),
    ('Молоко 2.5% ПЭТ 930 мл', 'ПЭТ', 6, 5.58, 14),
    ('Топленое молоко 3.2% ПЭТ 480 гр.', 'ПЭТ', 6, 2.88, 14),
    ('Сметана 15% ст 0.25 кг', 'стакан', 12, 3, 21),
    ('Сметана 20% ст 0.25 кг', 'стакан', 12, 3, 21),
    ('Творог 5% фольга 0.2 кг', 'флоу-пак, фольга', 14, 2.8, 10),
    ('Масло сливочное 72.5% фольга 0,2кг', 'гофротара', 1, 4, 10),
    ('Масло сливочное 82.5% фольга 0,2кг', 'гофротара', 1, 4, 10)
)
UPDATE stock_products AS sp
SET
  pack_type = reference_data.pack_type,
  units_in_pack = reference_data.units_in_pack,
  pack_weight_kg = reference_data.pack_weight_kg,
  shelf_life_days = reference_data.shelf_life_days
FROM reference_data
WHERE sp.name = reference_data.name;
