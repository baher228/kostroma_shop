import { db } from './db';
import { Task, TaskStatus } from './types';

type TaskDbRow = {
  id: string;
  title: string;
  assignee_id: string;
  assignee_display_name: string;
  created_by_id: string;
  created_by_display_name: string;
  status: TaskStatus;
  created_at: Date | string;
  completed_at: Date | string | null;
};

const normalizeTitle = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 240);

const toIso = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

const mapTask = (row: TaskDbRow): Task => ({
  id: row.id,
  title: normalizeTitle(row.title),
  assigneeId: row.assignee_id,
  assigneeDisplayName: row.assignee_display_name,
  createdById: row.created_by_id,
  createdByDisplayName: row.created_by_display_name,
  status: row.status,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  completedAt: toIso(row.completed_at),
});

export const listTasks = async (): Promise<Task[]> => {
  const result = await db.query<TaskDbRow>(
    `
      SELECT
        id,
        title,
        assignee_id,
        assignee_display_name,
        created_by_id,
        created_by_display_name,
        status,
        created_at,
        completed_at
      FROM tasks
      ORDER BY created_at DESC, id DESC;
    `,
  );
  return result.rows.map(mapTask);
};

export const createTask = async (input: {
  title: string;
  assigneeId: string;
  assigneeDisplayName: string;
  createdById: string;
  createdByDisplayName: string;
}): Promise<Task> => {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await db.query<TaskDbRow>(
    `
      INSERT INTO tasks (
        id,
        title,
        assignee_id,
        assignee_display_name,
        created_by_id,
        created_by_display_name,
        status,
        created_at,
        completed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'open',NOW(),NULL)
      RETURNING
        id,
        title,
        assignee_id,
        assignee_display_name,
        created_by_id,
        created_by_display_name,
        status,
        created_at,
        completed_at;
    `,
    [id, normalizeTitle(input.title), input.assigneeId, input.assigneeDisplayName, input.createdById, input.createdByDisplayName],
  );
  return mapTask(result.rows[0]);
};

export const updateTaskStatus = async (id: string, status: TaskStatus): Promise<Task | null> => {
  const result = await db.query<TaskDbRow>(
    `
      UPDATE tasks
      SET
        status = $2,
        completed_at = CASE WHEN $2 = 'done' THEN NOW() ELSE NULL END
      WHERE id = $1
      RETURNING
        id,
        title,
        assignee_id,
        assignee_display_name,
        created_by_id,
        created_by_display_name,
        status,
        created_at,
        completed_at;
    `,
    [id, status],
  );
  if (result.rowCount === 0) {
    return null;
  }
  return mapTask(result.rows[0]);
};

export const deleteTask = async (id: string): Promise<boolean> => {
  const result = await db.query('DELETE FROM tasks WHERE id = $1;', [id]);
  return (result.rowCount ?? 0) > 0;
};
