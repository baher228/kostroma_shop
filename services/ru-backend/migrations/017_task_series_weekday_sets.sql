ALTER TABLE task_series
  ADD COLUMN IF NOT EXISTS weekdays SMALLINT[] NULL,
  ADD COLUMN IF NOT EXISTS utc_offset_minutes INTEGER NULL;

ALTER TABLE task_series DROP CONSTRAINT IF EXISTS task_series_repeat_check;

ALTER TABLE task_series
  ADD CONSTRAINT task_series_repeat_check CHECK (
    repeat IN (
      'daily',
      'every_2_days',
      'weekly',
      'weekdays',
      'every_monday',
      'every_tuesday',
      'every_wednesday',
      'every_thursday',
      'every_friday',
      'every_saturday',
      'every_sunday'
    )
  );

ALTER TABLE task_series DROP CONSTRAINT IF EXISTS task_series_weekdays_check;

ALTER TABLE task_series
  ADD CONSTRAINT task_series_weekdays_check CHECK (
    repeat <> 'weekdays'
    OR (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[] AND utc_offset_minutes IS NOT NULL)
  );
