import { StoreTablet, Task, TaskStatus } from '../types/models';
import { request } from './http';

type TasksResponse = { tasks: Task[] };
type TaskResponse = { task: Task };
type StoreTabletsResponse = { storeTablets: StoreTablet[] };

export const tasksApi = {
  list: async (token: string): Promise<Task[]> => {
    const result = await request<TasksResponse>('/api/tasks', { token });
    return result.tasks;
  },
  listStoreTablets: async (token: string): Promise<StoreTablet[]> => {
    const result = await request<StoreTabletsResponse>('/api/store-tablets', { token });
    return result.storeTablets;
  },
  create: async (
    token: string,
    title: string,
    assigneeId: string,
    deadlineAt?: string | null,
    requiresPhotoConfirmation?: boolean,
  ): Promise<Task> => {
    const result = await request<TaskResponse>('/api/tasks', {
      method: 'POST',
      token,
      body: { title, assigneeId, deadlineAt: deadlineAt ?? null, requiresPhotoConfirmation: !!requiresPhotoConfirmation },
    });
    return result.task;
  },
  updateStatus: async (
    token: string,
    taskId: string,
    status: TaskStatus,
    photoConfirmationUrl?: string | null,
  ): Promise<Task> => {
    const result = await request<TaskResponse>(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      token,
      body: { status, photoConfirmationUrl: photoConfirmationUrl ?? null },
    });
    return result.task;
  },
  remove: async (token: string, taskId: string): Promise<void> => {
    await request(`/api/tasks/${taskId}`, { method: 'DELETE', token });
  },
};
