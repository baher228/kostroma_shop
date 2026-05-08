import { personalDb } from './personalDb';
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
  deadline_at: Date | string | null;
  requires_photo_confirmation: boolean;
  photo_confirmation_url: string | null;
  photo_confirmed_at: Date | string | null;
};

const normalizeTitle = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 240);

const toIso = (value: Date | string | null): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

const isOverdue = (row: TaskDbRow): boolean => {
  if (row.status === 'done' || !row.deadline_at) return false;
  const deadline = new Date(row.deadline_at);
  return !Number.isNaN(deadline.valueOf()) && deadline.getTime() < Date.now();
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
  deadlineAt: toIso(row.deadline_at),
  requiresPhotoConfirmation: row.requires_photo_confirmation,
  photoConfirmationUrl: row.photo_confirmation_url,
  photoConfirmedAt: toIso(row.photo_confirmed_at),
  overdue: isOverdue(row),
});

const selectFields = `
  id,
  title,
  assignee_id,
  assignee_display_name,
  created_by_id,
  created_by_display_name,
  status,
  created_at,
  completed_at,
  deadline_at,
  requires_photo_confirmation,
  photo_confirmation_url,
  photo_confirmed_at
`;

export const listTasks = async (): Promise<Task[]> => {
  const result = await personalDb.query<TaskDbRow>(`SELECT ${selectFields} FROM tasks ORDER BY created_at DESC, id DESC;`);
  return result.rows.map(mapTask);
};

export const createTask = async (input: {
  title: string;
  assigneeId: string;
  assigneeDisplayName: string;
  createdById: string;
  createdByDisplayName: string;
  deadlineAt?: string | null;
  requiresPhotoConfirmation?: boolean;
}): Promise<Task> => {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await personalDb.query<TaskDbRow>(
    `
      INSERT INTO tasks (
        id, title, assignee_id, assignee_display_name, created_by_id, created_by_display_name,
        status, created_at, completed_at, deadline_at, requires_photo_confirmation,
        photo_confirmation_url, photo_confirmed_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'open',NOW(),NULL,$7,$8,NULL,NULL,NOW())
      RETURNING ${selectFields};
    `,
    [
      id,
      normalizeTitle(input.title),
      input.assigneeId,
      input.assigneeDisplayName,
      input.createdById,
      input.createdByDisplayName,
      input.deadlineAt ?? null,
      input.requiresPhotoConfirmation ?? false,
    ],
  );
  return mapTask(result.rows[0]);
};

export const updateTaskStatus = async (
  id: string,
  status: TaskStatus,
  photoConfirmationUrl?: string | null,
): Promise<Task | null> => {
  const result = await personalDb.query<TaskDbRow>(
    `
      UPDATE tasks
      SET
        status = $2,
        completed_at = CASE WHEN $2 = 'done' THEN NOW() ELSE NULL END,
        photo_confirmation_url = COALESCE($3, photo_confirmation_url),
        photo_confirmed_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE photo_confirmed_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${selectFields};
    `,
    [id, status, photoConfirmationUrl ?? null],
  );
  if (result.rowCount === 0) return null;
  return mapTask(result.rows[0]);
};

export const deleteTask = async (id: string): Promise<boolean> => {
  const result = await personalDb.query('DELETE FROM tasks WHERE id = $1;', [id]);
  return (result.rowCount ?? 0) > 0;
};
