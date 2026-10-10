ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminder_hour_before_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reminder_deadline_sent_at TIMESTAMPTZ NULL;
