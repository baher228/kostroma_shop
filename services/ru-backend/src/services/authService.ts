import bcrypt from 'bcryptjs';
import { getOpsJwks, signOpsToken, signSessionToken } from '../auth/auth';
import { SessionUser } from '../domain/types';
import { findUserByUsername } from '../repositories/userRepository';
import { loginSchema } from '../http/validation';
import { z } from 'zod';

export const getOpsPublicKeys = () => getOpsJwks();

export const loginUser = async (
  payload: z.infer<typeof loginSchema>,
): Promise<{ token: string; user: SessionUser } | null> => {
  const user = await findUserByUsername(payload.username);
  if (!user) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(payload.password, user.passwordHash);
  if (!isPasswordValid) {
    return null;
  }

  const sessionUser: SessionUser = {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    role: user.role,
    shopId: user.shopId,
    shopName: user.shopName,
  };
  return { token: signSessionToken(sessionUser), user: sessionUser };
};

export const createOpsTokenForUser = (user: SessionUser): string =>
  signOpsToken(user.role === 'store_tablet' ? { ...user, role: 'worker' } : user);
