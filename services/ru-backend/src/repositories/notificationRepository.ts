import { personalDb } from '../db/personalDb';

export const savePushToken = async (userId: string, token: string) => {
  await personalDb.query(
    `
      INSERT INTO user_push_tokens (token, user_id, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (token) DO UPDATE
      SET user_id = EXCLUDED.user_id, updated_at = NOW();
    `,
    [token, userId],
  );
};

export const listPushTokens = async (userId: string): Promise<string[]> => {
  const result = await personalDb.query<{ token: string }>(
    'SELECT token FROM user_push_tokens WHERE user_id = $1 ORDER BY updated_at DESC;',
    [userId],
  );
  return result.rows.map((row: { token: string }) => row.token);
};

export const deletePushToken = async (userId: string, token: string) => {
  await personalDb.query('DELETE FROM user_push_tokens WHERE user_id = $1 AND token = $2;', [userId, token]);
};
