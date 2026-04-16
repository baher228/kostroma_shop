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
      displayName: string;
      password: string;
      role: Role;
    },
  ): Promise<ManagedUser> => {
    const result = await request<UserResponse>('/api/users', {
      method: 'POST',
      token,
      body: payload,
    });
    return result.user;
  },
};
