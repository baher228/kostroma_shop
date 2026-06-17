import { createTask, deleteTask, listTasks, updateTaskStatus } from '../repositories/taskRepository';
import { SessionUser, Task } from '../domain/types';
import { findWorkerById } from '../repositories/userRepository';
import { createTaskSchema, updateTaskStatusSchema } from '../http/validation';
import { z } from 'zod';

export const getVisibleTasks = async (user: SessionUser) => {
  const tasks = await listTasks();
  return user.role === 'manager' ? tasks : tasks.filter((task) => task.assigneeId === user.id);
};

export const createManagedTask = async (
  manager: SessionUser,
  payload: z.infer<typeof createTaskSchema>,
) => {
  const assignee = await findWorkerById(payload.assigneeId);
  if (!assignee) {
    return null;
  }
  return createTask({
    title: payload.title,
    assigneeId: assignee.id,
    assigneeDisplayName: assignee.fullName,
    createdById: manager.id,
    createdByDisplayName: manager.fullName,
    deadlineAt: payload.deadlineAt ?? null,
    requiresPhotoConfirmation: payload.requiresPhotoConfirmation ?? false,
  });
};

export const changeTaskStatus = async (
  user: SessionUser,
  taskId: string,
  payload: z.infer<typeof updateTaskStatusSchema>,
): Promise<
  | { status: 'updated'; task: Task }
  | { status: 'not_found' | 'forbidden' | 'photo_required' }
> => {
  const tasks = await listTasks();
  const target = tasks.find((task) => task.id === taskId);
  if (!target) {
    return { status: 'not_found' };
  }
  if (user.role === 'worker' && target.assigneeId !== user.id) {
    return { status: 'forbidden' };
  }
  if (user.role === 'worker' && payload.status === 'open') {
    return { status: 'forbidden' };
  }
  if (payload.status === 'done' && target.requiresPhotoConfirmation && !payload.photoConfirmationUrl && !target.photoConfirmationUrl) {
    return { status: 'photo_required' };
  }

  const task = await updateTaskStatus(taskId, payload.status, payload.photoConfirmationUrl);
  if (!task) {
    return { status: 'not_found' };
  }
  return { status: 'updated', task };
};

export const removeTask = (taskId: string) => deleteTask(taskId);
