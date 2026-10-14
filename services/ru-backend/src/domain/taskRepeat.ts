export const TASK_WEEKDAY_REPEATS = [
  'every_monday',
  'every_tuesday',
  'every_wednesday',
  'every_thursday',
  'every_friday',
  'every_saturday',
  'every_sunday',
] as const;

export const TASK_REPEATS = ['daily', 'every_2_days', 'weekly', ...TASK_WEEKDAY_REPEATS] as const;

export type TaskRepeat = (typeof TASK_REPEATS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

// Weekday repeats are weekly: the dashboard puts the first deadline on the chosen weekday.
export const TASK_REPEAT_INTERVAL_MS: Record<TaskRepeat, number> = {
  daily: DAY_MS,
  every_2_days: 2 * DAY_MS,
  weekly: 7 * DAY_MS,
  ...Object.fromEntries(TASK_WEEKDAY_REPEATS.map((repeat) => [repeat, 7 * DAY_MS])) as Record<
    (typeof TASK_WEEKDAY_REPEATS)[number],
    number
  >,
};

// The next occurrence appears once the previous deadline has passed. Occurrences missed while the
// backend was down are skipped, so a series never produces a burst of already-overdue tasks.
export const dueTaskOccurrence = (
  nextDeadlineMs: number,
  repeat: TaskRepeat,
  nowMs: number,
): { deadlineMs: number; followingDeadlineMs: number } | null => {
  const interval = TASK_REPEAT_INTERVAL_MS[repeat];
  if (nowMs < nextDeadlineMs - interval) return null;
  let deadlineMs = nextDeadlineMs;
  while (deadlineMs <= nowMs) deadlineMs += interval;
  return { deadlineMs, followingDeadlineMs: deadlineMs + interval };
};
