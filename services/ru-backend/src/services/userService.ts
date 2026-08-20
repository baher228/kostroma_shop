import bcrypt from 'bcryptjs';
import { SessionUser } from '../domain/types';
import {
  assignUserShop,
  createUser,
  deleteUser,
  listStoreTablets,
  listUsers,
  listWorkers,
  updateUser,
  updateUserPassword,
} from '../repositories/userRepository';
import {
  assignUserShopSchema,
  createUserSchema,
  updateUserPasswordSchema,
  updateUserSchema,
} from '../http/validation';
import { z } from 'zod';

export const getWorkers = () => listWorkers();

export const getStoreTablets = () => listStoreTablets();

export const getUsers = () => listUsers();

export const createManagedUser = async (payload: z.infer<typeof createUserSchema>) => {
  const passwordHash = await bcrypt.hash(payload.password, 12);
  return createUser({
    username: payload.username,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: payload.role,
    passwordHash,
    shopId: payload.role === 'manager' ? null : payload.shopId ?? null,
  });
};

export const assignManagedUserShop = (
  userId: string,
  payload: z.infer<typeof assignUserShopSchema>,
) => assignUserShop(userId, payload.shopId);

export const updateManagedUser = (
  userId: string,
  payload: z.infer<typeof updateUserSchema>,
) => updateUser(userId, {
  ...payload,
  ...(payload.role === 'manager' ? { shopId: null } : {}),
});

export const resetManagedUserPassword = async (
  userId: string,
  payload: z.infer<typeof updateUserPasswordSchema>,
) => updateUserPassword(userId, await bcrypt.hash(payload.password, 12));

export const deleteManagedUser = async (
  currentUser: SessionUser,
  userId: string,
): Promise<'deleted' | 'self' | 'not_found'> => {
  if (userId === currentUser.id) {
    return 'self';
  }
  return (await deleteUser(userId)) ? 'deleted' : 'not_found';
};
