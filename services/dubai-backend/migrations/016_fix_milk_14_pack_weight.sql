UPDATE stock_products
SET
  units_in_pack = 6,
  pack_weight_kg = 8.4
WHERE business_category = 'Молоко'
  AND category = 'Молоко'
  AND LOWER(name) LIKE '%молоко%'
  AND (name LIKE '%1,4%' OR name LIKE '%1.4%')
  AND (units_in_pack IS DISTINCT FROM 6 OR pack_weight_kg IS DISTINCT FROM 8.4);
