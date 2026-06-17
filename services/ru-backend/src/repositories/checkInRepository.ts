import { personalDb } from '../db/personalDb';
import { CheckInStats, DailyCheckInSummary, WorkerCheckInEvent, WorkerCheckInStatus, WorkerCheckInSummary } from '../domain/types';

const EXPECTED_START_TIME = '10:00';

type WorkerCheckInStatusRow = {
  worker_id: string;
  worker_display_name: string;
  status: 'in' | 'out' | null;
  last_changed_at: Date | string | null;
};

type WorkerCheckInEventRow = {
  id: string;
  worker_id: string;
  worker_display_name: string;
  status: 'in' | 'out';
  event_at: Date | string;
};

const mapStatus = (row: WorkerCheckInStatusRow): WorkerCheckInStatus => ({
  workerId: row.worker_id,
  workerDisplayName: row.worker_display_name,
  status: row.status ?? 'out',
  lastChangedAt: row.last_changed_at ? new Date(row.last_changed_at).toISOString() : '',
});

const mapEvent = (row: WorkerCheckInEventRow): WorkerCheckInEvent => ({
  id: row.id,
  workerId: row.worker_id,
  workerDisplayName: row.worker_display_name,
  status: row.status,
  eventAt: new Date(row.event_at).toISOString(),
});

const toDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (raw: string): Date => {
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
};

const shiftDateKey = (raw: string, days: number): string => {
  const date = parseDateKey(raw);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
};

const dateRange = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let current = from; current <= to; current = shiftDateKey(current, 1)) {
    dates.push(current);
  }
  return dates;
};

const eventDateKey = (eventAt: string): string => eventAt.slice(0, 10);

const eventMinutesOfDay = (eventAt: string): number => {
  const date = new Date(eventAt);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

const expectedStartMinutes = (): number => {
  const [hours, minutes] = EXPECTED_START_TIME.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const generateEventId = (): string => `checkin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const getWorkerCheckInStatus = async (workerId: string): Promise<WorkerCheckInStatus | null> => {
  const result = await personalDb.query<WorkerCheckInStatusRow>(
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

export const listWorkerCheckInStatuses = async (): Promise<WorkerCheckInStatus[]> => {
  const result = await personalDb.query<WorkerCheckInStatusRow>(
    `
      SELECT
        u.id AS worker_id,
        CONCAT(u.first_name, ' ', u.last_name) AS worker_display_name,
        s.status,
        s.last_changed_at
      FROM users u
      LEFT JOIN worker_checkin_status s ON s.worker_id = u.id
      WHERE u.role = 'worker'
      ORDER BY u.last_name ASC, u.first_name ASC, u.username ASC;
    `,
  );
  return result.rows.map(mapStatus);
};

export const listWorkerCheckInEvents = async (from: string, to: string): Promise<WorkerCheckInEvent[]> => {
  const result = await personalDb.query<WorkerCheckInEventRow>(
    `
      SELECT id, worker_id, worker_display_name, status, event_at
      FROM worker_checkin_events
      WHERE event_at >= $1::date
        AND event_at < ($2::date + INTERVAL '1 day')
      ORDER BY event_at DESC, id DESC;
    `,
    [from, to],
  );
  return result.rows.map(mapEvent);
};

export const upsertWorkerCheckInStatus = async (input: {
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
}): Promise<WorkerCheckInStatus> => {
  const recorded = await recordWorkerCheckIn(input);
  return recorded.status;
};

export const recordWorkerCheckIn = async (input: {
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
}): Promise<{ status: WorkerCheckInStatus; event: WorkerCheckInEvent }> => {
  await personalDb.query('BEGIN;');
  try {
    const statusResult = await personalDb.query<WorkerCheckInStatusRow>(
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

    const eventResult = await personalDb.query<WorkerCheckInEventRow>(
      `
        INSERT INTO worker_checkin_events (id, worker_id, worker_display_name, status, event_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, worker_id, worker_display_name, status, event_at;
      `,
      [generateEventId(), input.workerId, input.workerDisplayName, input.status],
    );

    await personalDb.query('COMMIT;');
    return { status: mapStatus(statusResult.rows[0]), event: mapEvent(eventResult.rows[0]) };
  } catch (error) {
    await personalDb.query('ROLLBACK;').catch(() => {});
    throw error;
  }
};

const workedMinutesForEvents = (events: WorkerCheckInEvent[], rangeEnd: string): number => {
  const sorted = [...events].sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt));
  const rangeEndDate = parseDateKey(shiftDateKey(rangeEnd, 1));
  let openIn: Date | null = null;
  let minutes = 0;

  for (const event of sorted) {
    const eventTime = new Date(event.eventAt);
    if (event.status === 'in') {
      openIn = eventTime;
    } else if (event.status === 'out' && openIn) {
      minutes += Math.max(0, Math.round((eventTime.getTime() - openIn.getTime()) / 60000));
      openIn = null;
    }
  }

  if (openIn) {
    minutes += Math.max(0, Math.round((rangeEndDate.getTime() - openIn.getTime()) / 60000));
  }

  return minutes;
};

export const getCheckInStats = async (from: string, to: string): Promise<CheckInStats> => {
  const [statuses, events] = await Promise.all([listWorkerCheckInStatuses(), listWorkerCheckInEvents(from, to)]);
  const dates = dateRange(from, to);
  const startMinutes = expectedStartMinutes();

  const eventsByWorker = new Map<string, WorkerCheckInEvent[]>();
  const eventsByDate = new Map<string, WorkerCheckInEvent[]>();
  for (const event of events) {
    const workerEvents = eventsByWorker.get(event.workerId) ?? [];
    workerEvents.push(event);
    eventsByWorker.set(event.workerId, workerEvents);

    const dateKey = eventDateKey(event.eventAt);
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    dayEvents.push(event);
    eventsByDate.set(dateKey, dayEvents);
  }

  const workers: WorkerCheckInSummary[] = statuses.map((status) => {
    const workerEvents = eventsByWorker.get(status.workerId) ?? [];
    const inEvents = workerEvents.filter((event) => event.status === 'in');
    const presentDates = new Set(inEvents.map((event) => eventDateKey(event.eventAt)));
    let lateDays = 0;

    for (const date of dates) {
      const firstIn = inEvents
        .filter((event) => eventDateKey(event.eventAt) === date)
        .sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt))[0];
      if (firstIn && eventMinutesOfDay(firstIn.eventAt) > startMinutes) {
        lateDays += 1;
      }
    }

    return {
      ...status,
      totalCheckIns: inEvents.length,
      daysPresent: presentDates.size,
      workedMinutes: workedMinutesForEvents(workerEvents, to),
      lateDays,
      missingDays: Math.max(0, dates.length - presentDates.size),
    };
  });

  const daily: DailyCheckInSummary[] = dates.map((date) => {
    const dayEvents = eventsByDate.get(date) ?? [];
    const dayInEvents = dayEvents.filter((event) => event.status === 'in');
    const presentWorkers = new Set(dayInEvents.map((event) => event.workerId));
    let lateCount = 0;
    for (const worker of statuses) {
      const firstIn = dayInEvents
        .filter((event) => event.workerId === worker.workerId)
        .sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt))[0];
      if (firstIn && eventMinutesOfDay(firstIn.eventAt) > startMinutes) {
        lateCount += 1;
      }
    }
    return {
      date,
      checkIns: dayInEvents.length,
      workedMinutes: workedMinutesForEvents(dayEvents, date),
      lateCount,
      missingCount: Math.max(0, statuses.length - presentWorkers.size),
    };
  });

  return {
    from,
    to,
    expectedStartTime: EXPECTED_START_TIME,
    currentlyIn: statuses.filter((status) => status.status === 'in').length,
    currentlyOut: statuses.filter((status) => status.status === 'out').length,
    totalCheckIns: workers.reduce((sum, worker) => sum + worker.totalCheckIns, 0),
    workedMinutes: workers.reduce((sum, worker) => sum + worker.workedMinutes, 0),
    lateCount: workers.reduce((sum, worker) => sum + worker.lateDays, 0),
    missingCount: workers.reduce((sum, worker) => sum + worker.missingDays, 0),
    workers,
    daily,
    events,
  };
};
