import { Task, TaskStatus, Worker } from '../types/models';
import { request } from './http';

type TasksResponse = {
  tasks: Task[];
};

type TaskResponse = {
  task: Task;
};

type WorkersResponse = {
  workers: Worker[];
};

export const tasksApi = {
  list: async (token: string): Promise<Task[]> => {
    const result = await request<TasksResponse>('/api/tasks', { token });
    return result.tasks;
  },

  listWorkers: async (token: string): Promise<Worker[]> => {
    const result = await request<WorkersResponse>('/api/workers', { token });
    return result.workers;
  },

  create: async (token: string, title: string, assigneeId: string): Promise<Task> => {
    const result = await request<TaskResponse>('/api/tasks', {
      method: 'POST',
      token,
      body: {
        title,
        assigneeId,
      },
    });
    return result.task;
  },

  updateStatus: async (token: string, taskId: string, status: TaskStatus): Promise<Task> => {
    const result = await request<TaskResponse>(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      token,
      body: {
        status,
      },
    });
    return result.task;
  },

  remove: async (token: string, taskId: string): Promise<void> => {
    await request(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      token,
    });
  },
};
