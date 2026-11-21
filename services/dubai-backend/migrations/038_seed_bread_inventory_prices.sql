CREATE TEMP TABLE inventory_price_updates (
  product_name TEXT PRIMARY KEY,
  inventory_price_rub NUMERIC(12, 2) NOT NULL
) ON COMMIT DROP;

INSERT INTO inventory_price_updates (product_name, inventory_price_rub)
VALUES
  ('Батон Нарезной 0.350 нарезка', 56),
  ('Батон Нарезной 0.175 нарезка', 33),
  ('Батон с отрубями 0.300 нарезка', 55),
  ('Батон Горчичный 0.350 нарезка', 61),
  ('Батон Зерновой 0.350 нарезка', 66),
  ('Хлеб Дарницкий 0.300 нарезка', 34),
  ('Хлеб Дарницкий 0.600 нарезка', 59),
  ('Хлеб Красносельский 0.400 нарезка', 59),
  ('Хлеб Тостовый 0.430 нарезка', 80),
  ('Хлеб Тостовый с отрубями 0.430 нарезка', 80),
  ('Хлеб Гречишный на меду 0,4 нарезка', 77),
  ('Хлеб Тостовый Бородинский 0.430 нарезка', 80),
  ('Рулет с изюмом 0.300', 54),
  ('Багет простой 0.250', 51),
  ('Хлеб Пшеничный на закваске 0.400 нарезка', 106),
  ('Хлеб Мультизерновой на закваске 0.400 нарезка', 115),
  ('Хлеб Фермерский на закваске 0,4 нарезка', 104),
  ('Хлеб Сибирский 0.300 нарезка', 68),
  ('Хлеб Семечко 0.300 нарезка', 70),
  ('Лепёшка с сыром 0.100', 40),
  ('Плюшка Новомосковская 0.150', 35),
  ('Чиабаттини пшеничная 0,130', 37),
  ('Штрудель с абрикосом 0.080', 44),
  ('Пирожное Безе', 517),
  ('Пирожное заварное Эклер', 486),
  ('Пирожное Паутинка', 580),
  ('Пирожное Корж Новинка', 400),
  ('Пирожное Сочни с творогом', 507),
  ('Пирожное Кексики бисквитные', 408);

DO $$
DECLARE
  matched_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO matched_count
  FROM inventory_price_updates prices
  JOIN stock_products products
    ON products.name = prices.product_name
   AND products.business_category = 'Хлеб';

  IF matched_count <> 29 THEN
    RAISE EXCEPTION 'Expected 29 bread inventory prices to match, found %', matched_count;
  END IF;
END $$;

UPDATE stock_products products
SET inventory_price_rub = prices.inventory_price_rub
FROM inventory_price_updates prices
WHERE products.name = prices.product_name
  AND products.business_category = 'Хлеб';
