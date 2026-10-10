ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS group_id TEXT NULL;

CREATE INDEX IF NOT EXISTS tasks_group_id_idx ON tasks (group_id);
