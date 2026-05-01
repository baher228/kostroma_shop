import { db } from './db';
import { WorkerCheckInStatus } from './types';

type WorkerCheckInStatusRow = {
  worker_id: string;
  worker_display_name: string;
  status: 'in' | 'out';
  last_changed_at: Date | string;
};

const mapStatus = (row: WorkerCheckInStatusRow): WorkerCheckInStatus => ({
  workerId: row.worker_id,
  workerDisplayName: row.worker_display_name,
  status: row.status,
  lastChangedAt: new Date(row.last_changed_at).toISOString(),
});

export const getWorkerCheckInStatus = async (workerId: string): Promise<WorkerCheckInStatus | null> => {
  const result = await db.query<WorkerCheckInStatusRow>(
    `
      SELECT worker_id, worker_display_name, status, last_changed_at
      FROM worker_checkin_status
      WHERE worker_id = $1
      LIMIT 1;
    `,
    [workerId],
  );
  return result.rows[0] ? mapStatus(result.rows[0]) : null;
};

export const upsertWorkerCheckInStatus = async (input: {
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
}): Promise<WorkerCheckInStatus> => {
  const result = await db.query<WorkerCheckInStatusRow>(
    `
      INSERT INTO worker_checkin_status (worker_id, worker_display_name, status, last_changed_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (worker_id)
      DO UPDATE SET
        worker_display_name = EXCLUDED.worker_display_name,
        status = EXCLUDED.status,
        last_changed_at = NOW()
      RETURNING worker_id, worker_display_name, status, last_changed_at;
    `,
    [input.workerId, input.workerDisplayName, input.status],
  );
  return mapStatus(result.rows[0]);
};
