WITH desired_order(name, sort_index) AS (
  VALUES
    ('Премиум Ф', 0),
    ('Шоколадное Ф', 1),
    ('Боговарово Ф', 2),
    ('Малыш Вохма', 3),
    ('Российский Вохма', 4),
    ('Золотое кольцо', 5),
    ('Амстердам Мант', 6),
    ('Гауда Мант', 7),
    ('Голландский Мант', 8),
    ('Костромской Вохм', 9),
    ('Пошехонский Мант', 10),
    ('Тильзитер Мант', 11),
    ('Эдам Мант', 12)
)
UPDATE stock_products AS product
SET created_at = TIMESTAMPTZ '2026-08-09 12:41:00+00' + desired_order.sort_index * INTERVAL '1 second'
FROM desired_order
WHERE product.business_category = 'Сыр'
  AND product.name = desired_order.name;
