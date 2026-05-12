ALTER TABLE stock_values
  DROP CONSTRAINT IF EXISTS stock_values_value_check;

ALTER TABLE stock_values
  ADD CONSTRAINT stock_values_value_check
  CHECK (value >= 0 AND value <= 50);
