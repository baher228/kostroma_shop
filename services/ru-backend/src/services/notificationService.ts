import { config } from '../config/config';
import { Task } from '../domain/types';
import { deletePushToken, listPushTokens, savePushToken } from '../repositories/notificationRepository';

const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

type ExpoPushTicket = {
  status: 'ok' | 'error';
  details?: { error?: string };
};

type ExpoPushResponse = { data?: ExpoPushTicket[] };

export const registerTaskAssigneePushToken = (userId: string, token: string) => savePushToken(userId, token);

export const removeTaskAssigneePushToken = (userId: string, token: string) => deletePushToken(userId, token);

export const notifyTaskAssigneeOfNewTask = async (task: Task) => {
  const tokens = await listPushTokens(task.assigneeId);
  for (let start = 0; start < tokens.length; start += 100) {
    const batch = tokens.slice(start, start + 100);
    const response = await fetch(expoPushUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(config.expoPushAccessToken ? { Authorization: `Bearer ${config.expoPushAccessToken}` } : {}),
      },
      body: JSON.stringify(
        batch.map((to) => ({
          to,
          title: 'Новая задача',
          body: task.title,
          sound: 'default',
          priority: 'high',
          channelId: 'tasks',
          data: { type: 'task_assigned', taskId: task.id },
        })),
      ),
    });
    if (!response.ok) continue;

    const result = (await response.json().catch(() => ({}))) as ExpoPushResponse;
    await Promise.all(
      (result.data ?? []).map((ticket, index) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
          ? deletePushToken(task.assigneeId, batch[index])
          : undefined,
      ),
    );
  }
};
