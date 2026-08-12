import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { notificationsApi } from '../api/notifications';
import { tasksApi } from '../api/tasks';
import { Session, Task } from '../types/models';

const TASK_NOTIFICATION_TYPE = 'task_assigned';

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

const isTaskNotification = (notification: Notifications.Notification) =>
  notification.request.content.data.type === TASK_NOTIFICATION_TYPE;

export const useTaskNotifications = (session: Session, onOpenTasks: () => void) => {
  const [hasUnreadTasks, setHasUnreadTasks] = useState(false);
  const [taskNotificationVersion, setTaskNotificationVersion] = useState(0);
  const pushTokenRef = useRef<string | null>(null);
  const unreadVersionRef = useRef(0);
  const viewedVersionRef = useRef(0);
  const storageKey = unreadStorageKey(session.user.id);
  const viewedKey = viewedStorageKey(session.user.id);
  const isWorker = session.user.role === 'worker';

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
    if (!isWorker) return;
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
  }, [isWorker, markUnreadTasks, session.token, viewedKey]);

  useEffect(() => {
    if (!isWorker || Platform.OS === 'web') return;

    const register = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('tasks', {
          name: 'Задачи',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 250, 150, 250],
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
  }, [isWorker, session.token]);

  useEffect(() => {
    if (!isWorker || Platform.OS === 'web') return;

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (isTaskNotification(notification)) markUnreadTasks();
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
  }, [isWorker, markUnreadTasks, onOpenTasks]);

  const unregisterPushToken = useCallback(async () => {
    const pushToken = pushTokenRef.current;
    if (!isWorker || !pushToken) return;
    await notificationsApi.removePushToken(session.token, pushToken).catch(() => undefined);
    pushTokenRef.current = null;
  }, [isWorker, session.token]);

  return { hasUnreadTasks, markTasksViewed, taskNotificationVersion, unregisterPushToken };
};
