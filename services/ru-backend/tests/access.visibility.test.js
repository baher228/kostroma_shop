const assert = require('node:assert/strict');
const test = require('node:test');

const threadRows = [
  {
    id: 'thread_worker_a',
    category: 'technical_failure',
    subject: 'A issue',
    created_by_id: 'worker_a',
    created_by_display_name: 'Worker A',
    status: 'open',
    created_at: '2026-05-13T10:00:00.000Z',
    updated_at: '2026-05-13T10:00:00.000Z',
  },
  {
    id: 'thread_worker_b',
    category: 'client_conflict',
    subject: 'B issue',
    created_by_id: 'worker_b',
    created_by_display_name: 'Worker B',
    status: 'open',
    created_at: '2026-05-13T11:00:00.000Z',
    updated_at: '2026-05-13T11:00:00.000Z',
  },
];

const messageRows = [
  {
    id: 'msg_a',
    thread_id: 'thread_worker_a',
    author_id: 'worker_a',
    author_display_name: 'Worker A',
    body: 'A message',
    photo_url: null,
    created_at: '2026-05-13T10:00:00.000Z',
  },
  {
    id: 'msg_b',
    thread_id: 'thread_worker_b',
    author_id: 'worker_b',
    author_display_name: 'Worker B',
    body: 'B message',
    photo_url: null,
    created_at: '2026-05-13T11:00:00.000Z',
  },
];

test('support list can be scoped to the requesting worker', async () => {
  const personalDbPath = require.resolve('../dist/db/personalDb');
  require.cache[personalDbPath] = {
    id: personalDbPath,
    filename: personalDbPath,
    loaded: true,
    exports: {
      personalDb: {
        query: async (sql, params = []) => {
          if (sql.includes('FROM support_threads')) {
            return {
              rows: params[0]
                ? threadRows.filter((thread) => thread.created_by_id === params[0])
                : threadRows,
            };
          }
          if (sql.includes('FROM support_messages')) {
            const threadIds = params[0];
            return { rows: messageRows.filter((message) => threadIds.includes(message.thread_id)) };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/supportRepository')];
  const { listSupportThreads } = require('../dist/repositories/supportRepository');

  const workerThreads = await listSupportThreads('worker_a');
  assert.deepEqual(workerThreads.map((thread) => thread.id), ['thread_worker_a']);
  assert.deepEqual(workerThreads[0].messages.map((message) => message.id), ['msg_a']);

  const managerThreads = await listSupportThreads();
  assert.deepEqual(managerThreads.map((thread) => thread.id), ['thread_worker_a', 'thread_worker_b']);
});

