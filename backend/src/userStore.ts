import { db } from './db';
import { Role, SessionUser, UserRecord } from './types';

type UserDbRow = {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  password_hash: string;
};

const mapUser = (row: UserDbRow): UserRecord => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  passwordHash: row.password_hash,
});

const mapSessionUser = (row: UserDbRow): SessionUser => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
});

export const findUserByUsername = async (username: string): Promise<UserRecord | null> => {
  const result = await db.query<UserDbRow>(
    `
      SELECT id, username, display_name, role, password_hash
      FROM users
      WHERE username = $1
      LIMIT 1;
    `,
    [username.trim().toLowerCase()],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
};

export const findWorkerById = async (id: string): Promise<SessionUser | null> => {
  const result = await db.query<UserDbRow>(
    `
      SELECT id, username, display_name, role, password_hash
      FROM users
      WHERE id = $1 AND role = 'worker'
      LIMIT 1;
    `,
    [id],
  );
  return result.rows[0] ? mapSessionUser(result.rows[0]) : null;
};

export const listWorkers = async (): Promise<SessionUser[]> => {
  const result = await db.query<UserDbRow>(
    `
      SELECT id, username, display_name, role, password_hash
      FROM users
      WHERE role = 'worker'
      ORDER BY display_name ASC, username ASC;
    `,
  );
  return result.rows.map(mapSessionUser);
};

export const listUsers = async (): Promise<SessionUser[]> => {
  const result = await db.query<UserDbRow>(
    `
      SELECT id, username, display_name, role, password_hash
      FROM users
      ORDER BY created_at ASC, username ASC;
    `,
  );
  return result.rows.map(mapSessionUser);
};

export const createUser = async (input: {
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
}): Promise<SessionUser> => {
  const id = `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const result = await db.query<UserDbRow>(
    `
      INSERT INTO users (id, username, display_name, role, password_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, username, display_name, role, password_hash;
    `,
    [id, input.username.trim().toLowerCase(), input.displayName.trim(), input.role, input.passwordHash],
  );
  return mapSessionUser(result.rows[0]);
};
