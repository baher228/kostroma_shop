import {
  attachTaskPhoto,
  createTask,
  deleteTask,
  detachExpiredTaskPhotos,
  getTaskPhotoFile,
  listTasks,
  reviewTaskPhoto,
  updateTaskStatus,
} from '../repositories/taskRepository';
import { SessionUser, Task } from '../domain/types';
import { createTaskSeries } from '../repositories/taskSeriesRepository';
import { findTaskInstructionPhoto, saveTaskInstructionPhoto } from '../repositories/taskInstructionPhotoRepository';
import { nextTaskDeadline } from '../domain/taskRepeat';
import { findStoreTabletById } from '../repositories/userRepository';
import { createTaskSchema, reviewTaskPhotoSchema, updateTaskStatusSchema, uploadTaskPhotoSchema } from '../http/validation';
import { deleteTaskPhotoFile, readTaskPhoto, saveTaskPhoto } from './taskPhotoStorageService';
import { z } from 'zod';

export const getVisibleTasks = async (user: SessionUser) => {
  void cleanupExpiredTaskPhotos().catch((error) => {
    console.error('Failed to clean up expired task photos:', error);
  });
  const tasks = await listTasks();
  return user.role === 'manager' ? tasks : tasks.filter((task) => task.assigneeId === user.id);
};

export const createManagedTask = async (
  manager: SessionUser,
  payload: z.infer<typeof createTaskSchema>,
) => {
  const assigneeIds = [...new Set(payload.assigneeIds ?? (payload.assigneeId ? [payload.assigneeId] : []))];
  const assignees = await Promise.all(assigneeIds.map((assigneeId) => findStoreTabletById(assigneeId)));
  if (assignees.length === 0 || assignees.some((assignee) => !assignee)) {
    return null;
  }
  const instructionPhotoId = payload.instructionPhotoDataUrl
    ? await saveTaskInstructionPhoto(payload.instructionPhotoDataUrl)
    : null;
  const repeat = payload.repeat;
  const schedule = repeat === 'weekdays'
    ? { weekdays: [...new Set(payload.repeatWeekdays ?? [])].sort((a, b) => a - b), utcOffsetMinutes: payload.repeatUtcOffsetMinutes ?? 0 }
    : { weekdays: null, utcOffsetMinutes: null };
  const series = repeat !== 'none' && payload.deadlineAt
    ? await createTaskSeries({
      title: payload.title,
      assigneeIds: assignees.map((assignee) => assignee!.id),
      createdById: manager.id,
      createdByDisplayName: manager.fullName,
      requiresPhotoConfirmation: payload.requiresPhotoConfirmation ?? false,
      repeat,
      ...schedule,
      nextDeadlineAt: new Date(nextTaskDeadline(Date.parse(payload.deadlineAt), repeat, schedule)).toISOString(),
      instructionPhotoId,
    })
    : null;
  const groupId = assignees.length > 1 ? `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : null;
  const tasks: Task[] = [];
  for (const assignee of assignees) {
    if (!assignee) continue;
    tasks.push(await createTask({
      groupId,
      seriesId: series?.id ?? null,
      instructionPhotoId,
      title: payload.title,
      assigneeId: assignee.id,
      assigneeDisplayName: assignee.fullName,
      createdById: manager.id,
      createdByDisplayName: manager.fullName,
      deadlineAt: payload.deadlineAt ?? null,
      requiresPhotoConfirmation: payload.requiresPhotoConfirmation ?? false,
    }));
  }
  return tasks;
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
  if (user.role !== 'manager' && target.assigneeId !== user.id) {
    return { status: 'forbidden' };
  }
  if (user.role !== 'manager' && payload.status === 'open') {
    return { status: 'forbidden' };
  }
  if (payload.status === 'done' && target.requiresPhotoConfirmation && target.photoReviewStatus !== 'approved') {
    return { status: 'photo_required' };
  }

  const task = await updateTaskStatus(taskId, payload.status);
  if (!task) {
    return { status: 'not_found' };
  }
  return { status: 'updated', task };
};

export const uploadTaskPhotoConfirmation = async (
  user: SessionUser,
  taskId: string,
  payload: z.infer<typeof uploadTaskPhotoSchema>,
): Promise<
  | { status: 'updated'; task: Task }
  | { status: 'not_found' | 'forbidden' | 'photo_not_required' }
> => {
  const tasks = await listTasks();
  const target = tasks.find((task) => task.id === taskId);
  if (!target) return { status: 'not_found' };
  if (target.assigneeId !== user.id && user.role !== 'manager') return { status: 'forbidden' };
  if (!target.requiresPhotoConfirmation) return { status: 'photo_not_required' };

  const previousPhoto = await getTaskPhotoFile(taskId);
  const saved = await saveTaskPhoto(payload.photoDataUrl);
  const task = await attachTaskPhoto(taskId, saved.fileName, saved.mimeType);
  if (!task) {
    await deleteTaskPhotoFile(saved.fileName);
    return { status: 'not_found' };
  }
  if (previousPhoto && previousPhoto.fileName !== saved.fileName) {
    await deleteTaskPhotoFile(previousPhoto.fileName);
  }
  return { status: 'updated', task };
};

export const reviewTaskPhotoConfirmation = async (
  user: SessionUser,
  taskId: string,
  payload: z.infer<typeof reviewTaskPhotoSchema>,
): Promise<
  | { status: 'updated'; task: Task }
  | { status: 'not_found' | 'forbidden' | 'photo_missing' | 'review_not_ready' }
> => {
  if (user.role !== 'manager') return { status: 'forbidden' };
  const tasks = await listTasks();
  const target = tasks.find((task) => task.id === taskId);
  if (!target) return { status: 'not_found' };
  if (!target.photoConfirmationUrl) return { status: 'photo_missing' };
  if (target.photoReviewStatus !== 'pending') return { status: 'review_not_ready' };

  const task = await reviewTaskPhoto(taskId, payload.decision);
  if (!task) return { status: 'not_found' };
  return { status: 'updated', task };
};

export const readTaskPhotoConfirmation = async (
  user: SessionUser,
  taskId: string,
): Promise<
  | { status: 'found'; photo: Buffer; mimeType: string }
  | { status: 'not_found' | 'forbidden' }
> => {
  const tasks = await listTasks();
  const target = tasks.find((task) => task.id === taskId);
  if (!target) return { status: 'not_found' };
  if (user.role !== 'manager' && target.assigneeId !== user.id) return { status: 'forbidden' };

  const photoFile = await getTaskPhotoFile(taskId);
  if (!photoFile) return { status: 'not_found' };
  const photo = await readTaskPhoto(photoFile.fileName);
  if (!photo) return { status: 'not_found' };
  return { status: 'found', photo, mimeType: photoFile.mimeType };
};

export const readTaskInstructionPhoto = async (
  user: SessionUser,
  taskId: string,
): Promise<{ status: 'found'; photo: Buffer; mimeType: string } | { status: 'not_found' | 'forbidden' }> => {
  const found = await findTaskInstructionPhoto(taskId);
  if (!found) return { status: 'not_found' };
  if (user.role !== 'manager' && found.assigneeId !== user.id) return { status: 'forbidden' };
  return { status: 'found', photo: found.data, mimeType: found.mimeType };
};

export const cleanupExpiredTaskPhotos = async () => {
  const expiredFileNames = await detachExpiredTaskPhotos();
  await Promise.all(expiredFileNames.map((fileName) => deleteTaskPhotoFile(fileName)));
};

export const removeTask = async (taskId: string) => {
  const photoFile = await getTaskPhotoFile(taskId);
  const removed = await deleteTask(taskId);
  if (removed && photoFile) {
    await deleteTaskPhotoFile(photoFile.fileName);
  }
  return removed;
};
