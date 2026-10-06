export type TimelineTask = {
  status: 'open' | 'done';
  deadlineAt: string | null;
  completedAt: string | null;
};

export type TaskGroupKey = 'overdue' | 'soon' | 'later' | 'noDeadline' | 'done';

export const TASK_GROUP_ORDER: TaskGroupKey[] = ['overdue', 'soon', 'later', 'noDeadline', 'done'];

export const TASK_GROUP_LABELS: Record<TaskGroupKey, string> = {
  overdue: 'Просрочено',
  soon: 'В ближайший час',
  later: 'Позже',
  noDeadline: 'Без дедлайна',
  done: 'Выполнено',
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const timeOf = (iso: string | null): number | null => {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : null;
};

export const taskGroupKey = (task: TimelineTask, now: number): TaskGroupKey => {
  if (task.status === 'done') return 'done';
  const deadline = timeOf(task.deadlineAt);
  if (deadline === null) return 'noDeadline';
  if (deadline < now) return 'overdue';
  if (deadline - now <= HOUR_MS) return 'soon';
  return 'later';
};

export type TaskGroup<T> = { key: TaskGroupKey; label: string; tasks: T[] };

export const groupTasksByUrgency = <T extends TimelineTask>(tasks: T[], now: number): TaskGroup<T>[] => {
  const buckets: Record<TaskGroupKey, T[]> = { overdue: [], soon: [], later: [], noDeadline: [], done: [] };
  tasks.forEach((task) => buckets[taskGroupKey(task, now)].push(task));
  const byDeadline = (a: T, b: T) => (timeOf(a.deadlineAt) ?? 0) - (timeOf(b.deadlineAt) ?? 0);
  buckets.overdue.sort(byDeadline);
  buckets.soon.sort(byDeadline);
  buckets.later.sort(byDeadline);
  buckets.done.sort((a, b) => (timeOf(b.completedAt) ?? 0) - (timeOf(a.completedAt) ?? 0));
  return TASK_GROUP_ORDER
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: TASK_GROUP_LABELS[key], tasks: buckets[key] }));
};

export const formatTaskDuration = (ms: number): string => {
  const totalMinutes = Math.max(1, Math.round(ms / MINUTE_MS));
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  if (totalMinutes >= DAY_MS / MINUTE_MS) return `${Math.floor(totalMinutes / (24 * 60))} дн.`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
};

export const taskDueLabel = (task: TimelineTask, now: number): string => {
  const deadline = timeOf(task.deadlineAt);
  if (task.status === 'done' || deadline === null) return '';
  return deadline < now
    ? `Опоздание ${formatTaskDuration(now - deadline)}`
    : `Через ${formatTaskDuration(deadline - now)}`;
};

const pad = (value: number) => String(value).padStart(2, '0');

const startOfLocalDay = (time: number) => {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

export const taskTimeParts = (iso: string | null, now: number): { time: string; day: string } => {
  const time = timeOf(iso);
  if (time === null) return { time: '—', day: 'без срока' };
  const date = new Date(time);
  const dayDiff = Math.round((startOfLocalDay(time) - startOfLocalDay(now)) / DAY_MS);
  const day = dayDiff === 0
    ? 'сегодня'
    : dayDiff === 1
      ? 'завтра'
      : dayDiff === -1
        ? 'вчера'
        : `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  return { time: `${pad(date.getHours())}:${pad(date.getMinutes())}`, day };
};
