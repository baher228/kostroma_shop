CREATE TABLE IF NOT EXISTS stock_rows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pack_count VARCHAR(5) NOT NULL DEFAULT '',
  stock_tue VARCHAR(5) NOT NULL DEFAULT '',
  order_thu VARCHAR(5) NOT NULL DEFAULT '',
  stock_wed VARCHAR(5) NOT NULL DEFAULT '',
  stock_thu VARCHAR(5) NOT NULL DEFAULT '',
  order_sat VARCHAR(5) NOT NULL DEFAULT '',
  stock_fri VARCHAR(5) NOT NULL DEFAULT '',
  stock_sun VARCHAR(5) NOT NULL DEFAULT '',
  order_tue VARCHAR(5) NOT NULL DEFAULT '',
  stock_mon VARCHAR(5) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_rows_created_at_idx ON stock_rows (created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  assignee_display_name TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON tasks (created_at DESC);

INSERT INTO stock_rows (
  id,
  name,
  pack_count,
  stock_tue,
  order_thu,
  stock_wed,
  stock_thu,
  order_sat,
  stock_fri,
  stock_sun,
  order_tue,
  stock_mon
)
SELECT * FROM (
  VALUES
    ('1', 'Йогурт Абрикос 2,5% ПЭТ 480 г', '6', '', '', '', '', '', '', '', '', ''),
    ('2', 'Йогурт Клубника 2,5% ПЭТ 480 г', '6', '', '', '', '', '', '', '', '', ''),
    ('3', 'Биойогурт Малина 3% стак 0,18 кг', '12', '', '', '', '', '', '', '', '', ''),
    ('4', 'Биойогурт Земляника 3% стак 0,18 кг', '12', '', '', '', '', '', '', '', '', ''),
    ('5', 'Биойогурт Персик-Маракуйя 3% стак 0,18 кг', '12', '', '', '', '', '', '', '', '', ''),
    ('6', 'Биойогурт Черника 3% стак 0,18 кг', '12', '', '', '', '', '', '', '', '', ''),
    ('7', 'Биойогурт с бифидобактериями 3,5% с. 0,33 кг', '12', '', '', '', '', '', '', '', '', '')
) AS seed_rows (
  id,
  name,
  pack_count,
  stock_tue,
  order_thu,
  stock_wed,
  stock_thu,
  order_sat,
  stock_fri,
  stock_sun,
  order_tue,
  stock_mon
)
WHERE NOT EXISTS (SELECT 1 FROM stock_rows);
