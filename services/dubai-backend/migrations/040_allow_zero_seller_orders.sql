ALTER TABLE seller_orders
  DROP CONSTRAINT IF EXISTS seller_orders_requested_packs_check,
  DROP CONSTRAINT IF EXISTS seller_orders_requested_units_check;

ALTER TABLE seller_orders
  ADD CONSTRAINT seller_orders_requested_packs_check CHECK (requested_packs >= 0),
  ADD CONSTRAINT seller_orders_requested_units_check CHECK (requested_units >= 0);
