UPDATE stock_products
SET units_in_pack = 20
WHERE business_category = 'Молоко'
  AND category = 'Творог'
  AND name ILIKE 'Масло сливочное%'
  AND (
    name ~ '(^|[^0-9])0[,.]18([^0-9]|$)'
    OR name ~ '(^|[^0-9])0[,.]2([^0-9]|$)'
  )
  AND name NOT ILIKE '%вес%';

UPDATE stock_products
SET units_in_pack = 10
WHERE business_category = 'Молоко'
  AND category = 'Творог'
  AND name ILIKE 'Масло сливочное%'
  AND name ILIKE '%вес%';
