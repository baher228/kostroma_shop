import { Task } from '../domain/types';
import { dueTaskOccurrence } from '../domain/taskRepeat';
import { createTask } from '../repositories/taskRepository';
import { advanceTaskSeries, listActiveTaskSeries, stopTaskSeries } from '../repositories/taskSeriesRepository';
import { findStoreTabletById } from '../repositories/userRepository';
import { notifyTaskAssigneeOfNewTask } from './notificationService';

export const getActiveTaskSeries = () => listActiveTaskSeries();

export const stopManagedTaskSeries = (seriesId: string) => stopTaskSeries(seriesId);

export const createDueTaskSeriesOccurrences = async (now = Date.now()): Promise<Task[]> => {
  const created: Task[] = [];
  for (const series of await listActiveTaskSeries()) {
    const due = dueTaskOccurrence(Date.parse(series.nextDeadlineAt), series.repeat, now, series);
    if (!due) continue;
    const claimed = await advanceTaskSeries(series.id, series.nextDeadlineAt, new Date(due.followingDeadlineMs).toISOString());
    if (!claimed) continue;
    const assignees = (await Promise.all(series.assigneeIds.map((id) => findStoreTabletById(id))))
      .filter((assignee): assignee is NonNullable<typeof assignee> => Boolean(assignee));
    if (assignees.length === 0) {
      await stopTaskSeries(series.id);
      continue;
    }
    const groupId = assignees.length > 1 ? `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : null;
    for (const assignee of assignees) {
      const task = await createTask({
        groupId,
        seriesId: series.id,
        instructionPhotoId: series.instructionPhotoId,
        title: series.title,
        assigneeId: assignee.id,
        assigneeDisplayName: assignee.fullName,
        createdById: series.createdById,
        createdByDisplayName: series.createdByDisplayName,
        deadlineAt: new Date(due.deadlineMs).toISOString(),
        requiresPhotoConfirmation: series.requiresPhotoConfirmation,
      });
      created.push(task);
      void notifyTaskAssigneeOfNewTask(task).catch((error) => {
        console.error('Failed to send task notification:', error);
      });
    }
  }
  return created;
};
