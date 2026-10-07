import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Vibration } from 'react-native';
import { notificationsApi } from '../api/notifications';
import { tasksApi } from '../api/tasks';
import { Session, Task } from '../types/models';

const TASK_NOTIFICATION_TYPES = new Set(['task_assigned', 'task_deadline']);
const DEADLINE_NOTIFICATION_TYPE = 'task_deadline';
const DEADLINE_VIBRATION_PATTERN = [0, 1000, 500, 1000, 500, 1000, 500, 1000];
const DEADLINE_ALARM_CHANNEL_ID = 'task-deadline-alarm';
const DEADLINE_ALARM_SOUND = 'deadline_alarm.wav';
// APKs from versionCode 2 bundle res/raw/deadline_alarm; older installs only get OTA JS.
const DEADLINE_ALARM_MIN_BUILD = 2;

const nativeApplication =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<{ nativeBuildVersion?: string | null }>('ExpoApplication')
    : null;
const hasDeadlineAlarmSound = Number(nativeApplication?.nativeBuildVersion ?? 0) >= DEADLINE_ALARM_MIN_BUILD;
const deadlineChannelId = hasDeadlineAlarmSound ? DEADLINE_ALARM_CHANNEL_ID : 'task-deadlines';

// The APKs have no FCM config, so remote pushes never arrive; deadline reminders are scheduled on the device.
const LOCAL_REMINDER_PREFIX = 'local-deadline:';
const LOCAL_REMINDER_REFRESH_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;
const localReminderTitles = {
  hour_before: 'Через 1 час срок задачи',
  deadline: 'Срок задачи истёк',
} as const;

type LocalDeadlineReminder = {
  id: string;
  taskId: string;
  kind: keyof typeof localReminderTitles;
  body: string;
  at: number;
};

export const plannedDeadlineReminders = (tasks: Task[]): LocalDeadlineReminder[] =>
  tasks.flatMap((task) => {
    if (task.status !== 'open' || !task.deadlineAt) return [];
    const deadline = Date.parse(task.deadlineAt);
    if (!Number.isFinite(deadline)) return [];
    return (['hour_before', 'deadline'] as const)
      .map((kind) => ({ kind, at: kind === 'hour_before' ? deadline - HOUR_MS : deadline }))
      .map(({ kind, at }) => ({
        id: `${LOCAL_REMINDER_PREFIX}${task.id}:${kind}:${deadline}`,
        taskId: task.id,
        kind,
        body: task.title,
        at,
      }));
  });

const listLocalReminderIds = async () =>
  (await Notifications.getAllScheduledNotificationsAsync())
    .map((request) => request.identifier)
    .filter((identifier) => identifier.startsWith(LOCAL_REMINDER_PREFIX));

const syncLocalDeadlineReminders = async (tasks: Task[]) => {
  const planned = plannedDeadlineReminders(tasks);
  const plannedIds = new Set(planned.map((reminder) => reminder.id));
  const scheduledIds = new Set(await listLocalReminderIds());
  // Android may deliver an alarm after its time, so only cancel reminders whose task or deadline changed.
  for (const identifier of scheduledIds) {
    if (!plannedIds.has(identifier)) await Notifications.cancelScheduledNotificationAsync(identifier);
  }
  const now = Date.now();
  for (const reminder of planned) {
    if (scheduledIds.has(reminder.id) || reminder.at <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: localReminderTitles[reminder.kind],
        body: reminder.body,
        sound: hasDeadlineAlarmSound ? DEADLINE_ALARM_SOUND : 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: DEADLINE_VIBRATION_PATTERN,
        data: { type: DEADLINE_NOTIFICATION_TYPE, kind: reminder.kind, taskId: reminder.taskId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.at,
        channelId: deadlineChannelId,
      },
    });
  }
};

const cancelLocalDeadlineReminders = async () => {
  await Promise.all(
    (await listLocalReminderIds()).map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)),
  );
};

let androidChannelsReady: Promise<void> | null = null;

const ensureAndroidChannels = () => {
  if (Platform.OS !== 'android') return Promise.resolve();
  androidChannelsReady ??= createAndroidChannels().catch((error) => {
    androidChannelsReady = null;
    throw error;
  });
  return androidChannelsReady;
};

const createAndroidChannels = async () => {
  await Notifications.setNotificationChannelAsync('tasks', {
    name: 'Задачи',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 150, 250],
  });
  await Notifications.setNotificationChannelAsync('task-deadlines', {
    name: 'Сроки задач',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: DEADLINE_VIBRATION_PATTERN,
    enableVibrate: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  if (hasDeadlineAlarmSound) {
    await Notifications.setNotificationChannelAsync(DEADLINE_ALARM_CHANNEL_ID, {
      name: 'Сроки задач (сигнал)',
      importance: Notifications.AndroidImportance.MAX,
      sound: DEADLINE_ALARM_SOUND,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
      vibrationPattern: DEADLINE_VIBRATION_PATTERN,
      enableVibrate: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const unreadStorageKey = (userId: string) => `unread_task_notification:${userId}`;
const viewedStorageKey = (userId: string) => `viewed_task_created_at:${userId}`;

const notificationType = (notification: Notifications.Notification) =>
  String(notification.request.content.data?.type ?? '');

const isTaskNotification = (notification: Notifications.Notification) =>
  TASK_NOTIFICATION_TYPES.has(notificationType(notification));

const isDeadlineNotification = (notification: Notifications.Notification) =>
  notificationType(notification) === DEADLINE_NOTIFICATION_TYPE;

export const useTaskNotifications = (session: Session, onOpenTasks: () => void) => {
  const [hasUnreadTasks, setHasUnreadTasks] = useState(false);
  const [taskNotificationVersion, setTaskNotificationVersion] = useState(0);
  const pushTokenRef = useRef<string | null>(null);
  const unreadVersionRef = useRef(0);
  const viewedVersionRef = useRef(0);
  const storageKey = unreadStorageKey(session.user.id);
  const viewedKey = viewedStorageKey(session.user.id);
  const isTaskAssignee = session.user.role === 'store_tablet';

  const markUnreadTasks = useCallback(() => {
    unreadVersionRef.current += 1;
    setHasUnreadTasks(true);
    setTaskNotificationVersion((current) => current + 1);
    void AsyncStorage.setItem(storageKey, '1');
  }, [storageKey]);

  const clearUnreadTasks = useCallback(() => {
    unreadVersionRef.current += 1;
    setHasUnreadTasks(false);
    void AsyncStorage.removeItem(storageKey);
  }, [storageKey]);

  const markTasksViewed = useCallback((tasks: Task[]) => {
    viewedVersionRef.current += 1;
    clearUnreadTasks();
    const latestCreatedAt = tasks.reduce(
      (latest, task) => (task.createdAt > latest ? task.createdAt : latest),
      '',
    );
    void AsyncStorage.setItem(viewedKey, latestCreatedAt || new Date().toISOString());
  }, [clearUnreadTasks, viewedKey]);

  useEffect(() => {
    let active = true;
    const unreadVersion = unreadVersionRef.current;
    setHasUnreadTasks(false);
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (active && unreadVersionRef.current === unreadVersion) setHasUnreadTasks(value === '1');
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!isTaskAssignee) return;
    let active = true;
    const viewedVersion = viewedVersionRef.current;
    void Promise.all([AsyncStorage.getItem(viewedKey), tasksApi.list(session.token)])
      .then(([viewedAt, tasks]) => {
        const hasNewOpenTask = tasks.some(
          (task) => task.status === 'open' && (!viewedAt || task.createdAt > viewedAt),
        );
        if (active && viewedVersionRef.current === viewedVersion && hasNewOpenTask) markUnreadTasks();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isTaskAssignee, markUnreadTasks, session.token, viewedKey]);

  useEffect(() => {
    if (!isTaskAssignee || Platform.OS === 'web') return;

    const register = async () => {
      await ensureAndroidChannels();

      const permissions = await Notifications.getPermissionsAsync();
      const status = permissions.granted
        ? permissions.status
        : (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;

      const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;

      const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      pushTokenRef.current = pushToken;
      await notificationsApi.registerPushToken(session.token, pushToken, hasDeadlineAlarmSound);
    };

    void register().catch(() => undefined);
    const tokenSubscription = Notifications.addPushTokenListener(({ data }) => {
      pushTokenRef.current = data;
      void notificationsApi.registerPushToken(session.token, data, hasDeadlineAlarmSound).catch(() => undefined);
    });
    return () => tokenSubscription.remove();
  }, [isTaskAssignee, session.token]);

  useEffect(() => {
    if (!isTaskAssignee || Platform.OS === 'web') return;
    let active = true;
    let running = false;

    const refreshReminders = async () => {
      if (running) return;
      running = true;
      try {
        await ensureAndroidChannels();
        if (!(await Notifications.getPermissionsAsync()).granted) return;
        const tasks = await tasksApi.list(session.token);
        if (active) await syncLocalDeadlineReminders(tasks);
      } catch (error) {
        console.warn('Failed to schedule task deadline reminders', error);
      } finally {
        running = false;
      }
    };

    void refreshReminders();
    const interval = setInterval(() => void refreshReminders(), LOCAL_REMINDER_REFRESH_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshReminders();
    });
    return () => {
      active = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [isTaskAssignee, session.token]);

  useEffect(() => {
    if (!isTaskAssignee || Platform.OS === 'web') return;

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (!isTaskNotification(notification)) return;
      markUnreadTasks();
      if (isDeadlineNotification(notification)) Vibration.vibrate(DEADLINE_VIBRATION_PATTERN);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!isTaskNotification(response.notification)) return;
      markUnreadTasks();
      onOpenTasks();
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !isTaskNotification(response.notification)) return;
      markUnreadTasks();
      onOpenTasks();
      void Notifications.clearLastNotificationResponseAsync();
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [isTaskAssignee, markUnreadTasks, onOpenTasks]);

  const unregisterPushToken = useCallback(async () => {
    if (!isTaskAssignee) return;
    if (Platform.OS !== 'web') await cancelLocalDeadlineReminders().catch(() => undefined);
    const pushToken = pushTokenRef.current;
    if (!pushToken) return;
    await notificationsApi.removePushToken(session.token, pushToken).catch(() => undefined);
    pushTokenRef.current = null;
  }, [isTaskAssignee, session.token]);

  return { hasUnreadTasks, markTasksViewed, taskNotificationVersion, unregisterPushToken };
};
