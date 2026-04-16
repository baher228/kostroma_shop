import { Session, SessionUser } from '../types/models';
import { request } from './http';

type LoginResponse = {
  token: string;
  user: SessionUser;
};

type MeResponse = {
  user: SessionUser;
};

export const authApi = {
  login: async (username: string, password: string): Promise<Session> => {
    const result = await request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username: username.trim().toLowerCase(), password },
    });
    return { token: result.token, user: result.user };
  },

  me: async (token: string): Promise<SessionUser> => {
    const result = await request<MeResponse>('/api/auth/me', { token });
    return result.user;
  },
};
