import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { formatTaskDuration, groupTasksByUrgency, taskDueLabel, taskGroupKey } from '../../shared/task-timeline.ts';

const now = new Date('2026-10-06T10:40:00Z').getTime();
const task = (id, status, deadlineAt, completedAt = null) => ({ id, status, deadlineAt, completedAt });

test('tasks are grouped by deadline urgency in a fixed order', () => {
  const groups = groupTasksByUrgency([
    task('later', 'open', '2026-10-06T13:00:00Z'),
    task('done', 'done', '2026-10-06T09:00:00Z', '2026-10-06T09:30:00Z'),
    task('none', 'open', null),
    task('soon', 'open', '2026-10-06T11:00:00Z'),
    task('late2', 'open', '2026-10-06T10:30:00Z'),
    task('late1', 'open', '2026-10-06T10:00:00Z'),
  ], now);

  assert.deepEqual(groups.map((group) => group.key), ['overdue', 'soon', 'later', 'noDeadline', 'done']);
  assert.deepEqual(groups[0].tasks.map((item) => item.id), ['late1', 'late2']);
  assert.equal(taskGroupKey(task('x', 'open', '2026-10-06T11:40:00Z'), now), 'soon');
  assert.equal(taskGroupKey(task('x', 'open', '2026-10-06T11:41:00Z'), now), 'later');
});

test('due labels show lateness or time left', () => {
  assert.equal(taskDueLabel(task('a', 'open', '2026-10-06T10:00:00Z'), now), 'Опоздание 40 мин');
  assert.equal(taskDueLabel(task('b', 'open', '2026-10-06T11:00:00Z'), now), 'Через 20 мин');
  assert.equal(taskDueLabel(task('c', 'done', '2026-10-06T10:00:00Z'), now), '');
  assert.equal(taskDueLabel(task('d', 'open', null), now), '');
  assert.equal(formatTaskDuration(90 * 60 * 1000), '1 ч 30 мин');
  assert.equal(formatTaskDuration(50 * 60 * 60 * 1000), '2 дн.');
});

test('task cards hide the creation date; only the admin dashboard can delete tasks', async () => {
  for (const path of ['../src/panels/tasks/TasksPanel.tsx', '../../frontend/src/components/TasksPanel.tsx']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Создана/);
    assert.match(source, /groupTasksByUrgency\((?:tasks|taskCards), now\)/);
  }
  const dashboard = await readFile(new URL('../src/panels/tasks/TasksPanel.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /className="task-delete"/);
  assert.match(dashboard, /window\.confirm\(question/);
  assert.match(dashboard, /card\.members\.map\(\(member\) => member\.id\)/);
  const tablet = await readFile(new URL('../../frontend/src/components/TasksPanel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(tablet, /Удалить/);
});

test('dashboard tasks do not fail the page when shop labels are unavailable', async () => {
  const source = await readFile(new URL('../src/panels/tasks/TasksPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /api\.shops\.list\(session\.token\)\.catch/);
  assert.match(source, /tablet\.shopName/);
});
