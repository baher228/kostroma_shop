export const TASK_WEEKDAY_REPEATS = [
  'every_monday',
  'every_tuesday',
  'every_wednesday',
  'every_thursday',
  'every_friday',
  'every_saturday',
  'every_sunday',
] as const;

// 'weekdays' repeats on a chosen set of weekdays (e.g. Monday and Tuesday).
export const TASK_REPEATS = ['daily', 'every_2_days', 'weekly', 'weekdays', ...TASK_WEEKDAY_REPEATS] as const;

export type TaskRepeat = (typeof TASK_REPEATS)[number];

// weekdays use JS getDay() numbering (0 = Sunday) in the manager's local time, which is
// utcOffsetMinutes east of UTC.
export type TaskRepeatSchedule = {
  weekdays: number[] | null;
  utcOffsetMinutes: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Single-weekday repeats are weekly: the dashboard puts the first deadline on the chosen weekday.
export const TASK_REPEAT_INTERVAL_MS: Record<Exclude<TaskRepeat, 'weekdays'>, number> = {
  daily: DAY_MS,
  every_2_days: 2 * DAY_MS,
  weekly: 7 * DAY_MS,
  ...Object.fromEntries(TASK_WEEKDAY_REPEATS.map((repeat) => [repeat, 7 * DAY_MS])) as Record<
    (typeof TASK_WEEKDAY_REPEATS)[number],
    number
  >,
};

const stepTaskDeadline = (
  deadlineMs: number,
  repeat: TaskRepeat,
  schedule: TaskRepeatSchedule | undefined,
  direction: 1 | -1,
) => {
  if (repeat !== 'weekdays') return deadlineMs + direction * TASK_REPEAT_INTERVAL_MS[repeat];
  const weekdays = new Set(schedule?.weekdays ?? []);
  if (weekdays.size === 0) return deadlineMs + direction * 7 * DAY_MS;
  const offsetMs = (schedule?.utcOffsetMinutes ?? 0) * 60 * 1000;
  let candidate = deadlineMs;
  for (let step = 0; step < 7; step += 1) {
    candidate += direction * DAY_MS;
    if (weekdays.has(new Date(candidate + offsetMs).getUTCDay())) return candidate;
  }
  return candidate;
};

export const nextTaskDeadline = (deadlineMs: number, repeat: TaskRepeat, schedule?: TaskRepeatSchedule) =>
  stepTaskDeadline(deadlineMs, repeat, schedule, 1);

// The next occurrence appears once the previous deadline has passed. Occurrences missed while the
// backend was down are skipped, so a series never produces a burst of already-overdue tasks.
export const dueTaskOccurrence = (
  nextDeadlineMs: number,
  repeat: TaskRepeat,
  nowMs: number,
  schedule?: TaskRepeatSchedule,
): { deadlineMs: number; followingDeadlineMs: number } | null => {
  if (nowMs < stepTaskDeadline(nextDeadlineMs, repeat, schedule, -1)) return null;
  let deadlineMs = nextDeadlineMs;
  while (deadlineMs <= nowMs) deadlineMs = nextTaskDeadline(deadlineMs, repeat, schedule);
  return { deadlineMs, followingDeadlineMs: nextTaskDeadline(deadlineMs, repeat, schedule) };
};
