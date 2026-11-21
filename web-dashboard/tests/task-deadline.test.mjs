import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { resolveTaskDeadlineAtSubmission } from '../../shared/task-deadline.ts';

test('a «Сейчас» deadline uses the submission time, not the selection time', () => {
  const submittedAt = new Date('2026-11-18T17:49:30.000Z');
  const selectedEarlier = '2026-11-18T17:40:00.000Z';

  assert.equal(
    resolveTaskDeadlineAtSubmission(true, selectedEarlier, submittedAt),
    submittedAt.toISOString(),
  );
});

test('scheduled and unset deadlines keep their existing meanings', () => {
  const submittedAt = new Date('2026-11-18T17:49:30.000Z');
  const selectedDeadline = '2026-11-19T09:00:00.000Z';

  assert.equal(
    resolveTaskDeadlineAtSubmission(false, selectedDeadline, submittedAt),
    selectedDeadline,
  );
  assert.equal(resolveTaskDeadlineAtSubmission(false, null, submittedAt), null);
  assert.equal(resolveTaskDeadlineAtSubmission(false, 'invalid', submittedAt), null);
});

test('dashboard and tablet resolve the deadline when creating the task', async () => {
  const dashboard = await readFile(new URL('../src/panels/tasks/TasksPanel.tsx', import.meta.url), 'utf8');
  const tablet = await readFile(new URL('../../frontend/src/components/TasksPanel.tsx', import.meta.url), 'utf8');

  assert.match(dashboard, /resolveTaskDeadlineAtSubmission\(deadlineNow, scheduledDeadlineAt\)/);
  assert.match(tablet, /resolveTaskDeadlineAtSubmission\(\s*deadlineNow,\s*buildDeadlineIso\(deadlineDate, deadlineTime\)/);
});
