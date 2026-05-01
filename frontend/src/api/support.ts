import { SupportThread, SupportCategory, SupportMessage } from '../types/models';
import { request } from './http';

type ThreadsResponse = { threads: SupportThread[] };
type ThreadResponse = { thread: SupportThread };
type MessageResponse = { message: SupportMessage };

export const supportApi = {
  list: async (token: string): Promise<SupportThread[]> => {
    const result = await request<ThreadsResponse>('/api/support', { token });
    return result.threads;
  },
  create: async (
    token: string,
    payload: { category: SupportCategory; body?: string; photoUrl?: string | null; subject: string },
  ): Promise<SupportThread> => {
    const result = await request<ThreadResponse>('/api/support', { method: 'POST', token, body: payload });
    return result.thread;
  },
  sendMessage: async (
    token: string,
    threadId: string,
    payload: { body?: string; photoUrl?: string | null },
  ): Promise<SupportMessage> => {
    const result = await request<MessageResponse>(`/api/support/${threadId}/messages`, {
      method: 'POST',
      token,
      body: payload,
    });
    return result.message;
  },
};
