const assert = require('node:assert/strict');
const test = require('node:test');

test('check-in update writes current status and event history', async () => {
  const calls = [];
  const personalDbPath = require.resolve('../dist/db/personalDb');

  require.cache[personalDbPath] = {
    id: personalDbPath,
    filename: personalDbPath,
    loaded: true,
    exports: {
      personalDb: {
        query: async (sql, params = []) => {
          calls.push({ sql, params });
          if (sql === 'BEGIN;' || sql === 'COMMIT;' || sql === 'ROLLBACK;') {
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO worker_checkin_status')) {
            return {
              rows: [{
                worker_id: params[0],
                worker_display_name: params[1],
                status: params[2],
                last_changed_at: '2026-05-17T07:55:00.000Z',
              }],
            };
          }
          if (sql.includes('INSERT INTO worker_checkin_events')) {
            return {
              rows: [{
                id: params[0],
                worker_id: params[1],
                worker_display_name: params[2],
                status: params[3],
                event_at: '2026-05-17T07:55:00.000Z',
              }],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/checkInRepository')];
  const { upsertWorkerCheckInStatus } = require('../dist/repositories/checkInRepository');

  const status = await upsertWorkerCheckInStatus({
    workerId: 'worker_1',
    workerDisplayName: 'Worker One',
    status: 'in',
  });

  assert.equal(status.status, 'in');
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO worker_checkin_status')), true);
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO worker_checkin_events')), true);
  assert.equal(calls.some((call) => call.sql === 'COMMIT;'), true);
});

test('check-in stats calculate hours, late and missing days', async () => {
  const personalDbPath = require.resolve('../dist/db/personalDb');

  require.cache[personalDbPath] = {
    id: personalDbPath,
    filename: personalDbPath,
    loaded: true,
    exports: {
      personalDb: {
        query: async (sql) => {
          if (sql.includes('FROM users u')) {
            return {
              rows: [
                {
                  worker_id: 'worker_a',
                  worker_display_name: 'Worker A',
                  status: 'out',
                  last_changed_at: '2026-05-17T16:00:00.000Z',
                },
                {
                  worker_id: 'worker_b',
                  worker_display_name: 'Worker B',
                  status: null,
                  last_changed_at: null,
                },
              ],
            };
          }
          if (sql.includes('FROM worker_checkin_events')) {
            return {
              rows: [
                {
                  id: 'event_1',
                  worker_id: 'worker_a',
                  worker_display_name: 'Worker A',
                  status: 'in',
                  event_at: '2026-05-17T09:30:00.000Z',
                },
                {
                  id: 'event_2',
                  worker_id: 'worker_a',
                  worker_display_name: 'Worker A',
                  status: 'out',
                  event_at: '2026-05-17T16:00:00.000Z',
                },
                {
                  id: 'event_3',
                  worker_id: 'worker_b',
                  worker_display_name: 'Worker B',
                  status: 'in',
                  event_at: '2026-05-17T10:30:00.000Z',
                },
              ],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/checkInRepository')];
  const { getCheckInStats } = require('../dist/repositories/checkInRepository');

  const stats = await getCheckInStats('2026-05-17', '2026-05-17');

  assert.equal(stats.totalCheckIns, 2);
  assert.equal(stats.lateCount, 1);
  assert.equal(stats.missingCount, 0);
  assert.equal(stats.workers.find((worker) => worker.workerId === 'worker_a').workedMinutes, 390);
  assert.equal(stats.workers.find((worker) => worker.workerId === 'worker_b').lateDays, 1);
  assert.equal(stats.daily[0].checkIns, 2);
});

test('check-in stats cap shifts without check-out at the end of their day', async () => {
  const personalDbPath = require.resolve('../dist/db/personalDb');
  const event = (id, workerId, status, eventAt) => ({ id, worker_id: workerId, worker_display_name: workerId, status, event_at: eventAt });

  require.cache[personalDbPath] = {
    id: personalDbPath,
    filename: personalDbPath,
    loaded: true,
    exports: {
      personalDb: {
        query: async (sql) => {
          if (sql.includes('FROM users u')) {
            return {
              rows: [
                { worker_id: 'worker_a', worker_display_name: 'Worker A', status: 'out', last_changed_at: '2026-05-19T17:00:00.000Z' },
                { worker_id: 'worker_b', worker_display_name: 'Worker B', status: 'in', last_changed_at: '2026-05-20T08:00:00.000Z' },
              ],
            };
          }
          if (sql.includes('FROM worker_checkin_events')) {
            return {
              rows: [
                event('event_1', 'worker_a', 'in', '2026-05-17T09:00:00.000Z'),
                event('event_2', 'worker_a', 'in', '2026-05-19T09:00:00.000Z'),
                event('event_3', 'worker_a', 'out', '2026-05-19T17:00:00.000Z'),
                event('event_4', 'worker_b', 'in', '2026-05-20T08:00:00.000Z'),
              ],
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      },
    },
  };

  delete require.cache[require.resolve('../dist/repositories/checkInRepository')];
  const { getCheckInStats } = require('../dist/repositories/checkInRepository');

  const stats = await getCheckInStats('2026-05-17', '2026-05-23', undefined, new Date('2026-05-20T12:00:00.000Z'));
  const workerA = stats.workers.find((worker) => worker.workerId === 'worker_a');
  const workerB = stats.workers.find((worker) => worker.workerId === 'worker_b');

  assert.equal(workerA.workedMinutes, 15 * 60 + 8 * 60);
  assert.equal(workerA.missingCheckOuts, 1);
  assert.equal(workerA.days[0].missingCheckOut, true);
  assert.equal(workerA.days[0].workedMinutes, 15 * 60);
  assert.equal(workerA.days[2].workedMinutes, 8 * 60);
  assert.equal(workerA.days[2].lastOutAt, '2026-05-19T17:00:00.000Z');
  assert.equal(workerB.workedMinutes, 4 * 60);
  assert.equal(workerB.missingCheckOuts, 0);
  assert.equal(stats.missingCheckOuts, 1);
  assert.equal(stats.daily[0].workedMinutes, 15 * 60);
  assert.equal(workerA.days.length, 7);
});
