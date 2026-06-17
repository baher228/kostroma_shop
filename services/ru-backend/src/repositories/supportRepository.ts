import { personalDb } from '../db/personalDb';
import { SupportCategory, SupportMessage, SupportThread } from '../domain/types';

type ThreadRow = {
  id: string;
  category: SupportCategory;
  subject: string;
  created_by_id: string;
  created_by_display_name: string;
  status: 'open' | 'resolved';
  created_at: Date | string;
  updated_at: Date | string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  author_id: string;
  author_display_name: string;
  body: string;
  photo_url: string | null;
  created_at: Date | string;
};

const toIso = (value: Date | string) => new Date(value).toISOString();

const mapMessage = (row: MessageRow): SupportMessage => ({
  id: row.id,
  threadId: row.thread_id,
  authorId: row.author_id,
  authorDisplayName: row.author_display_name,
  body: row.body,
  photoUrl: row.photo_url,
  createdAt: toIso(row.created_at),
});

const mapThread = (row: ThreadRow, messages: SupportMessage[]): SupportThread => ({
  id: row.id,
  category: row.category,
  subject: row.subject,
  createdById: row.created_by_id,
  createdByDisplayName: row.created_by_display_name,
  status: row.status,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  messages,
});

const mapThreadsWithMessages = (threads: ThreadRow[], messages: MessageRow[]): SupportThread[] =>
  threads.map((thread) =>
    mapThread(thread, messages.filter((message) => message.thread_id === thread.id).map(mapMessage)),
  );

export const listSupportThreads = async (createdById?: string): Promise<SupportThread[]> => {
  const threads = await personalDb.query<ThreadRow>(
    `
      SELECT *
      FROM support_threads
      ${createdById ? 'WHERE created_by_id = $1' : ''}
      ORDER BY updated_at DESC, created_at DESC;
    `,
    createdById ? [createdById] : [],
  );
  if (!threads.rows.length) {
    return [];
  }
  const messages = await personalDb.query<MessageRow>(
    `
      SELECT *
      FROM support_messages
      WHERE thread_id = ANY($1::text[])
      ORDER BY created_at ASC;
    `,
    [threads.rows.map((thread: ThreadRow) => thread.id)],
  );
  return mapThreadsWithMessages(threads.rows, messages.rows);
};

export const getSupportThread = async (threadId: string): Promise<SupportThread | null> => {
  const threads = await personalDb.query<ThreadRow>('SELECT * FROM support_threads WHERE id = $1 LIMIT 1;', [threadId]);
  if (!threads.rows[0]) {
    return null;
  }
  const messages = await personalDb.query<MessageRow>(
    'SELECT * FROM support_messages WHERE thread_id = $1 ORDER BY created_at ASC;',
    [threadId],
  );
  return threads.rows.map((thread: ThreadRow) =>
    mapThread(thread, messages.rows.filter((message: MessageRow) => message.thread_id === thread.id).map(mapMessage)),
  )[0];
};

export const createSupportThread = async (input: {
  category: SupportCategory;
  subject: string;
  body?: string;
  photoUrl?: string | null;
  createdById: string;
  createdByDisplayName: string;
}): Promise<SupportThread> => {
  const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await personalDb.query('BEGIN;');
  try {
    const threadResult = await personalDb.query<ThreadRow>(
      `INSERT INTO support_threads (id, category, subject, created_by_id, created_by_display_name, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'open',NOW(),NOW()) RETURNING *;`,
      [threadId, input.category, input.subject.trim(), input.createdById, input.createdByDisplayName],
    );
    const messageResult = await personalDb.query<MessageRow>(
      `INSERT INTO support_messages (id, thread_id, author_id, author_display_name, body, photo_url, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *;`,
      [messageId, threadId, input.createdById, input.createdByDisplayName, input.body?.trim() || '', input.photoUrl ?? null],
    );
    await personalDb.query('COMMIT;');
    return mapThread(threadResult.rows[0], [mapMessage(messageResult.rows[0])]);
  } catch (error) {
    await personalDb.query('ROLLBACK;');
    throw error;
  }
};

export const addSupportMessage = async (threadId: string, input: {
  authorId: string;
  authorDisplayName: string;
  body?: string;
  photoUrl?: string | null;
}): Promise<SupportMessage | null> => {
  const exists = await personalDb.query<ThreadRow>('SELECT * FROM support_threads WHERE id = $1 LIMIT 1;', [threadId]);
  if (!exists.rows[0]) return null;
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const result = await personalDb.query<MessageRow>(
    `INSERT INTO support_messages (id, thread_id, author_id, author_display_name, body, photo_url, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *;`,
    [messageId, threadId, input.authorId, input.authorDisplayName, input.body?.trim() || '', input.photoUrl ?? null],
  );
  await personalDb.query('UPDATE support_threads SET updated_at = NOW() WHERE id = $1;', [threadId]);
  return mapMessage(result.rows[0]);
};
