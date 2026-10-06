import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import { notificationsApi } from '../api/notifications';
import { tasksApi } from '../api/tasks';
import { Session, Task } from '../types/models';

const TASK_NOTIFICATION_TYPES = new Set(['task_assigned', 'task_deadline']);
const DEADLINE_NOTIFICATION_TYPE = 'task_deadline';
const DEADLINE_VIBRATION_PATTERN = [0, 1000, 500, 1000, 500, 1000, 500, 1000];

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
      if (Platform.OS === 'android') {
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
      }

      const permissions = await Notifications.getPermissionsAsync();
      const status = permissions.granted
        ? permissions.status
        : (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;

      const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;

      const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      pushTokenRef.current = pushToken;
      await notificationsApi.registerPushToken(session.token, pushToken);
    };

    void register().catch(() => undefined);
    const tokenSubscription = Notifications.addPushTokenListener(({ data }) => {
      pushTokenRef.current = data;
      void notificationsApi.registerPushToken(session.token, data).catch(() => undefined);
    });
    return () => tokenSubscription.remove();
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
    const pushToken = pushTokenRef.current;
    if (!isTaskAssignee || !pushToken) return;
    await notificationsApi.removePushToken(session.token, pushToken).catch(() => undefined);
    pushTokenRef.current = null;
  }, [isTaskAssignee, session.token]);

  return { hasUnreadTasks, markTasksViewed, taskNotificationVersion, unregisterPushToken };
};
