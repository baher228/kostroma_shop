import { personalDb } from '../db/personalDb';
import { Task, TaskPhotoReviewStatus, TaskStatus } from '../domain/types';

type TaskDbRow = {
  id: string;
  group_id: string | null;
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
  photo_confirmation_file_name: string | null;
  photo_confirmation_mime_type: string | null;
  photo_confirmation_uploaded_at: Date | string | null;
  photo_confirmed_at: Date | string | null;
  photo_review_status: TaskPhotoReviewStatus;
  photo_reviewed_at: Date | string | null;
  photo_deletes_at: Date | string | null;
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
  groupId: row.group_id ?? null,
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
  photoConfirmationUrl: row.photo_confirmation_file_name ? `/api/tasks/${encodeURIComponent(row.id)}/photo` : row.photo_confirmation_url,
  photoConfirmedAt: toIso(row.photo_confirmed_at),
  photoReviewStatus: row.photo_review_status,
  photoReviewedAt: toIso(row.photo_reviewed_at),
  photoDeletesAt: toIso(row.photo_deletes_at),
  overdue: isOverdue(row),
});

const selectFields = `
  id,
  group_id,
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
  photo_confirmation_file_name,
  photo_confirmation_mime_type,
  photo_confirmation_uploaded_at,
  photo_confirmed_at,
  photo_review_status,
  photo_reviewed_at,
  photo_deletes_at
`;

export const listTasks = async (): Promise<Task[]> => {
  const result = await personalDb.query<TaskDbRow>(`SELECT ${selectFields} FROM tasks ORDER BY created_at DESC, id DESC;`);
  return result.rows.map(mapTask);
};

export const createTask = async (input: {
  groupId?: string | null;
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
        photo_confirmation_url, photo_confirmation_file_name, photo_confirmation_mime_type,
        photo_confirmation_uploaded_at, photo_confirmed_at, photo_review_status,
        photo_reviewed_at, photo_deletes_at, updated_at, group_id
      ) VALUES ($1,$2,$3,$4,$5,$6,'open',NOW(),NULL,$7,$8,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,NOW(),$9)
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
      input.groupId ?? null,
    ],
  );
  return mapTask(result.rows[0]);
};

export const updateTaskStatus = async (
  id: string,
  status: TaskStatus,
): Promise<Task | null> => {
  const result = await personalDb.query<TaskDbRow>(
    `
      UPDATE tasks
      SET
        status = $2,
        completed_at = CASE WHEN $2 = 'done' THEN NOW() ELSE NULL END,
        photo_review_status = CASE
          WHEN $2 = 'open' THEN 'none'
          ELSE photo_review_status
        END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${selectFields};
    `,
    [id, status],
  );
  if (result.rowCount === 0) return null;
  return mapTask(result.rows[0]);
};

export const attachTaskPhoto = async (
  id: string,
  fileName: string,
  mimeType: string,
): Promise<Task | null> => {
  const result = await personalDb.query<TaskDbRow>(
    `
      UPDATE tasks
      SET
        status = 'done',
        completed_at = COALESCE(completed_at, NOW()),
        photo_confirmation_url = NULL,
        photo_confirmation_file_name = $2,
        photo_confirmation_mime_type = $3,
        photo_confirmation_uploaded_at = NOW(),
        photo_confirmed_at = NOW(),
        photo_review_status = 'pending',
        photo_reviewed_at = NULL,
        photo_deletes_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${selectFields};
    `,
    [id, fileName, mimeType],
  );
  if (result.rowCount === 0) return null;
  return mapTask(result.rows[0]);
};

export const reviewTaskPhoto = async (
  id: string,
  decision: 'approve' | 'decline',
): Promise<Task | null> => {
  const nextStatus: TaskStatus = decision === 'approve' ? 'done' : 'open';
  const nextPhotoReviewStatus: TaskPhotoReviewStatus = decision === 'approve' ? 'approved' : 'declined';
  const result = await personalDb.query<TaskDbRow>(
    `
      UPDATE tasks
      SET
        status = $2,
        completed_at = CASE WHEN $2 = 'done' THEN completed_at ELSE NULL END,
        photo_review_status = $3,
        photo_reviewed_at = NOW(),
        photo_deletes_at = NOW() + INTERVAL '1 hour',
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${selectFields};
    `,
    [id, nextStatus, nextPhotoReviewStatus],
  );
  if (result.rowCount === 0) return null;
  return mapTask(result.rows[0]);
};

export const getTaskPhotoFile = async (id: string): Promise<{
  fileName: string;
  mimeType: string;
} | null> => {
  const result = await personalDb.query<Pick<TaskDbRow, 'photo_confirmation_file_name' | 'photo_confirmation_mime_type'>>(
    `
      SELECT photo_confirmation_file_name, photo_confirmation_mime_type
      FROM tasks
      WHERE id = $1 AND photo_confirmation_file_name IS NOT NULL;
    `,
    [id],
  );
  const row = result.rows[0];
  if (!row?.photo_confirmation_file_name) return null;
  return {
    fileName: row.photo_confirmation_file_name,
    mimeType: row.photo_confirmation_mime_type || 'application/octet-stream',
  };
};

export const detachExpiredTaskPhotos = async (): Promise<string[]> => {
  const result = await personalDb.query<Pick<TaskDbRow, 'photo_confirmation_file_name'>>(
    `
      UPDATE tasks
      SET
        photo_confirmation_file_name = NULL,
        photo_confirmation_mime_type = NULL,
        photo_confirmation_uploaded_at = NULL,
        photo_confirmation_url = NULL,
        photo_deletes_at = NULL,
        updated_at = NOW()
      WHERE photo_confirmation_file_name IS NOT NULL
        AND photo_deletes_at IS NOT NULL
        AND photo_deletes_at <= NOW()
      RETURNING photo_confirmation_file_name;
    `,
  );
  const rows = result.rows as Array<Pick<TaskDbRow, 'photo_confirmation_file_name'>>;
  return rows
    .map((row: Pick<TaskDbRow, 'photo_confirmation_file_name'>) => row.photo_confirmation_file_name)
    .filter((fileName: string | null): fileName is string => Boolean(fileName));
};

export const deleteTask = async (id: string): Promise<boolean> => {
  const result = await personalDb.query('DELETE FROM tasks WHERE id = $1;', [id]);
  return (result.rowCount ?? 0) > 0;
};

export type TaskDeadlineReminderKind = 'hour_before' | 'deadline';

const REMINDER_SEND_WINDOW = "INTERVAL '10 minutes'";

const reminderClaimConditions: Record<TaskDeadlineReminderKind, { column: string; condition: string }> = {
  hour_before: {
    column: 'reminder_hour_before_sent_at',
    condition: `
      created_at <= deadline_at - INTERVAL '1 hour'
      AND NOW() >= deadline_at - INTERVAL '1 hour'
      AND NOW() < deadline_at - INTERVAL '1 hour' + ${REMINDER_SEND_WINDOW}
    `,
  },
  deadline: {
    column: 'reminder_deadline_sent_at',
    condition: `
      NOW() >= deadline_at
      AND NOW() < deadline_at + ${REMINDER_SEND_WINDOW}
    `,
  },
};

export const claimTaskDeadlineReminders = async (kind: TaskDeadlineReminderKind): Promise<Task[]> => {
  const { column, condition } = reminderClaimConditions[kind];
  const result = await personalDb.query<TaskDbRow>(
    `
      UPDATE tasks
      SET ${column} = NOW()
      WHERE status = 'open'
        AND deadline_at IS NOT NULL
        AND ${column} IS NULL
        AND ${condition}
      RETURNING ${selectFields};
    `,
  );
  return result.rows.map(mapTask);
};
