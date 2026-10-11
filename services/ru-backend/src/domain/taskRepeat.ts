export type TaskRepeat = 'daily' | 'every_2_days' | 'weekly';

const DAY_MS = 24 * 60 * 60 * 1000;

export const TASK_REPEAT_INTERVAL_MS: Record<TaskRepeat, number> = {
  daily: DAY_MS,
  every_2_days: 2 * DAY_MS,
  weekly: 7 * DAY_MS,
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
