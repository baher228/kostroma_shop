import { config } from '../config/config';
import { Task } from '../domain/types';
import { deletePushToken, listPushTokens, savePushToken } from '../repositories/notificationRepository';
import { claimTaskDeadlineReminders, TaskDeadlineReminderKind } from '../repositories/taskRepository';

const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

type ExpoPushTicket = {
  status: 'ok' | 'error';
  details?: { error?: string };
};

type ExpoPushResponse = { data?: ExpoPushTicket[] };

type PushMessage = {
  title: string;
  body: string;
  channelId: string;
  alarmChannelId?: string;
  data: Record<string, string>;
};

const deadlineAlarmSound = 'deadline_alarm.wav';

export const registerTaskAssigneePushToken = (userId: string, token: string, alarmSound: boolean) =>
  savePushToken(userId, token, alarmSound);

export const removeTaskAssigneePushToken = (userId: string, token: string) =>
  deletePushToken(userId, token);

const sendPushToUser = async (userId: string, message: PushMessage) => {
  const tokens = await listPushTokens(userId);
  for (let start = 0; start < tokens.length; start += 100) {
    const batch = tokens.slice(start, start + 100);
    const response = await fetch(expoPushUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(config.expoPushAccessToken
          ? { Authorization: `Bearer ${config.expoPushAccessToken}` }
          : {}),
      },
      body: JSON.stringify(
        batch.map(({ token: to, alarmSound }) => {
          const alarmChannelId = alarmSound ? message.alarmChannelId : undefined;
          return {
            to,
            title: message.title,
            body: message.body,
            sound: alarmChannelId ? deadlineAlarmSound : 'default',
            priority: 'high',
            channelId: alarmChannelId ?? message.channelId,
            data: message.data,
          };
        }),
      ),
    });
    if (!response.ok) continue;

    const result = (await response.json().catch(() => ({}))) as ExpoPushResponse;
    await Promise.all(
      (result.data ?? []).map((ticket, index) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
          ? deletePushToken(userId, batch[index].token)
          : undefined,
      ),
    );
  }
};

export const notifyTaskAssigneeOfNewTask = (task: Task) =>
  sendPushToUser(task.assigneeId, {
    title: 'Новая задача',
    body: task.title,
    channelId: 'tasks',
    data: { type: 'task_assigned', taskId: task.id },
  });

const deadlineReminderTitles: Record<TaskDeadlineReminderKind, string> = {
  hour_before: 'Через 1 час срок задачи',
  deadline: 'Срок задачи истёк',
};

export const sendTaskDeadlineReminders = async () => {
  for (const kind of ['hour_before', 'deadline'] as const) {
    const tasks = await claimTaskDeadlineReminders(kind);
    await Promise.all(
      tasks.map((task) =>
        sendPushToUser(task.assigneeId, {
          title: deadlineReminderTitles[kind],
          body: task.title,
          channelId: 'task-deadlines',
          alarmChannelId: 'task-deadline-alarm',
          data: { type: 'task_deadline', kind, taskId: task.id },
        }).catch((error) => {
          console.error(`Failed to send ${kind} reminder for task ${task.id}:`, error);
        }),
      ),
    );
  }
};
