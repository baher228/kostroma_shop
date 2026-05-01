import { ManagedUser, Role } from '../types/models';
import { request } from './http';

type UsersResponse = {
  users: ManagedUser[];
};

type UserResponse = {
  user: ManagedUser;
};

export const usersApi = {
  list: async (token: string): Promise<ManagedUser[]> => {
    const result = await request<UsersResponse>('/api/users', { token });
    return result.users;
  },

  create: async (
    token: string,
    payload: {
      username: string;
      firstName: string;
      lastName: string;
      password: string;
      role: Role;
      shopId?: string | null;
    },
  ): Promise<ManagedUser> => {
    const result = await request<UserResponse>('/api/users', {
      method: 'POST',
      token,
      body: payload,
    });
    return result.user;
  },

  assignShop: async (token: string, userId: string, shopId: string | null): Promise<ManagedUser> => {
    const result = await request<UserResponse>(`/api/users/${userId}/shop`, {
      method: 'PATCH',
      token,
      body: { shopId },
    });
    return result.user;
  },
};
