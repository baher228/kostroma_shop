UPDATE stock_products
SET units_in_pack = 6
WHERE business_category = 'Молоко'
  AND category = 'Молоко'
  AND units_in_pack = 20
  AND LOWER(name) LIKE '%молоко%'
  AND (name LIKE '%1,4%' OR name LIKE '%1.4%');
