UPDATE stock_products
SET
  category = 'Йогурты',
  pack_type = 'стакан',
  units_in_pack = 12,
  pack_weight_kg = 3.96,
  shelf_life_days = 14,
  unit_price_rub_vat = 35.86
WHERE name IN (
  'Биойогурт с бифидобактериями 3,5% с. 0,33 кг',
  'Биойогурт с бифидобактериями 3,5% стак 0,33 кг'
);
