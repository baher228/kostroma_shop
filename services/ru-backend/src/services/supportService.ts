import { addSupportMessage, createSupportThread, getSupportThread, listSupportThreads } from '../repositories/supportRepository';
import { SessionUser } from '../domain/types';
import { createSupportMessageSchema, createSupportThreadSchema } from '../http/validation';
import { z } from 'zod';

export const getVisibleSupportThreads = (user: SessionUser) =>
  listSupportThreads(user.role === 'manager' ? undefined : user.id);

export const createUserSupportThread = (
  user: SessionUser,
  payload: z.infer<typeof createSupportThreadSchema>,
) => createSupportThread({
  category: payload.category,
  subject: payload.subject,
  body: payload.body,
  photoUrl: payload.photoUrl,
  createdById: user.id,
  createdByDisplayName: user.fullName,
});

export const addUserSupportMessage = async (
  user: SessionUser,
  threadId: string,
  payload: z.infer<typeof createSupportMessageSchema>,
): Promise<'not_found' | 'forbidden' | { message: NonNullable<Awaited<ReturnType<typeof addSupportMessage>>> }> => {
  const thread = await getSupportThread(threadId);
  if (!thread) {
    return 'not_found';
  }
  if (user.role !== 'manager' && thread.createdById !== user.id) {
    return 'forbidden';
  }
  const message = await addSupportMessage(threadId, {
    authorId: user.id,
    authorDisplayName: user.fullName,
    body: payload.body,
    photoUrl: payload.photoUrl,
  });
  return message ? { message } : 'not_found';
};
