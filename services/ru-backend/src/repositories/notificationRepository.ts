import { personalDb } from '../db/personalDb';

export type PushTokenRecord = { token: string; alarmSound: boolean };

export const savePushToken = async (userId: string, token: string, alarmSound: boolean) => {
  await personalDb.query(
    `
      INSERT INTO user_push_tokens (token, user_id, alarm_sound, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (token) DO UPDATE
      SET user_id = EXCLUDED.user_id, alarm_sound = EXCLUDED.alarm_sound, updated_at = NOW();
    `,
    [token, userId, alarmSound],
  );
};

export const listPushTokens = async (userId: string): Promise<PushTokenRecord[]> => {
  const result = await personalDb.query<{ token: string; alarm_sound: boolean }>(
    'SELECT token, alarm_sound FROM user_push_tokens WHERE user_id = $1 ORDER BY updated_at DESC;',
    [userId],
  );
  return result.rows.map((row: { token: string; alarm_sound: boolean }) => ({
    token: row.token,
    alarmSound: row.alarm_sound,
  }));
};

export const deletePushToken = async (userId: string, token: string) => {
  await personalDb.query('DELETE FROM user_push_tokens WHERE user_id = $1 AND token = $2;', [userId, token]);
};
