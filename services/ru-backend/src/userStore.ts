import { personalDb } from './personalDb';
import { Role, SessionUser, UserRecord } from './types';

type UserDbRow = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  password_hash: string;
  shop_id: string | null;
  shop_name: string | null;
};

const userSelect = `
  SELECT
    u.id,
    u.username,
    u.first_name,
    u.last_name,
    u.role,
    u.password_hash,
    u.shop_id,
    NULL::text AS shop_name
  FROM users u
`;

const composeFullName = (firstName: string, lastName: string): string => `${firstName} ${lastName}`.trim();

const mapUser = (row: UserDbRow): UserRecord => ({
  id: row.id,
  username: row.username,
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: composeFullName(row.first_name, row.last_name),
  role: row.role,
  passwordHash: row.password_hash,
  shopId: row.shop_id,
  shopName: row.shop_name,
});

const mapSessionUser = (row: UserDbRow): SessionUser => ({
  id: row.id,
  username: row.username,
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: composeFullName(row.first_name, row.last_name),
  role: row.role,
  shopId: row.shop_id,
  shopName: row.shop_name,
});

export const findUserByUsername = async (username: string): Promise<UserRecord | null> => {
  const result = await personalDb.query<UserDbRow>(
    `
      ${userSelect}
      WHERE u.username = $1
      LIMIT 1;
    `,
    [username.trim().toLowerCase()],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
};

export const findUserById = async (id: string): Promise<SessionUser | null> => {
  const result = await personalDb.query<UserDbRow>(
    `
      ${userSelect}
      WHERE u.id = $1
      LIMIT 1;
    `,
    [id],
  );
  return result.rows[0] ? mapSessionUser(result.rows[0]) : null;
};

export const findWorkerById = async (id: string): Promise<SessionUser | null> => {
  const result = await personalDb.query<UserDbRow>(
    `
      ${userSelect}
      WHERE u.id = $1 AND u.role = 'worker'
      LIMIT 1;
    `,
    [id],
  );
  return result.rows[0] ? mapSessionUser(result.rows[0]) : null;
};

export const listWorkers = async (): Promise<SessionUser[]> => {
  const result = await personalDb.query<UserDbRow>(
    `
      ${userSelect}
      WHERE u.role = 'worker'
      ORDER BY u.last_name ASC, u.first_name ASC, u.username ASC;
    `,
  );
  return result.rows.map(mapSessionUser);
};

export const listUsers = async (): Promise<SessionUser[]> => {
  const result = await personalDb.query<UserDbRow>(
    `
      ${userSelect}
      ORDER BY u.created_at ASC, u.last_name ASC, u.first_name ASC, u.username ASC;
    `,
  );
  return result.rows.map(mapSessionUser);
};

const generateUserId = (): string =>
  `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const createUser = async (input: {
  username: string;
  firstName: string;
  lastName: string;
  role: Role;
  passwordHash: string;
  shopId?: string | null;
}): Promise<SessionUser> => {
  const id = generateUserId();
  const result = await personalDb.query<UserDbRow>(
    `
      INSERT INTO users (id, username, first_name, last_name, role, password_hash, shop_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, username, first_name, last_name, role, password_hash, shop_id, NULL::text AS shop_name;
    `,
    [
      id,
      input.username.trim().toLowerCase(),
      input.firstName.trim(),
      input.lastName.trim(),
      input.role,
      input.passwordHash,
      input.shopId ?? null,
    ],
  );

  const created = result.rows[0];
  if (!created.shop_id) {
    return mapSessionUser(created);
  }
  const resolved = await personalDb.query<UserDbRow>(
    `
      ${userSelect}
      WHERE u.id = $1
      LIMIT 1;
    `,
    [created.id],
  );
  return mapSessionUser(resolved.rows[0]);
};

export const assignUserShop = async (userId: string, shopId: string | null): Promise<SessionUser | null> => {
  await personalDb.query(
    `
      UPDATE users
      SET shop_id = $1
      WHERE id = $2;
    `,
    [shopId, userId],
  );
  const result = await personalDb.query<UserDbRow>(
    `
      ${userSelect}
      WHERE u.id = $1
      LIMIT 1;
    `,
    [userId],
  );
  return result.rows[0] ? mapSessionUser(result.rows[0]) : null;
};
