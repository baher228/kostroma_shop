import { request } from './http';

export const notificationsApi = {
  registerPushToken: (token: string, pushToken: string, alarmSound: boolean) =>
    request('/api/notifications/push-token', {
      method: 'PUT',
      token,
      body: { pushToken, alarmSound },
    }),
  removePushToken: (token: string, pushToken: string) =>
    request('/api/notifications/push-token', {
      method: 'DELETE',
      token,
      body: { pushToken },
    }),
};
