ALTER TABLE seller_orders
  ADD COLUMN IF NOT EXISTS order_date DATE NULL;

CREATE INDEX IF NOT EXISTS seller_orders_order_date_idx
  ON seller_orders (order_date DESC, shop_id);
