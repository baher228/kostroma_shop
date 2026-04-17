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
  create: async (token: string, payload: { category: SupportCategory; subject: string; body: string }): Promise<SupportThread> => {
    const result = await request<ThreadResponse>('/api/support', { method: 'POST', token, body: payload });
    return result.thread;
  },
  sendMessage: async (token: string, threadId: string, body: string): Promise<SupportMessage> => {
    const result = await request<MessageResponse>(`/api/support/${threadId}/messages`, {
      method: 'POST',
      token,
      body: { body },
    });
    return result.message;
  },
};
