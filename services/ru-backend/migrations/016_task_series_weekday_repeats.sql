ALTER TABLE task_series DROP CONSTRAINT IF EXISTS task_series_repeat_check;

ALTER TABLE task_series
  ADD CONSTRAINT task_series_repeat_check CHECK (
    repeat IN (
      'daily',
      'every_2_days',
      'weekly',
      'every_monday',
      'every_tuesday',
      'every_wednesday',
      'every_thursday',
      'every_friday',
      'every_saturday',
      'every_sunday'
    )
  );
