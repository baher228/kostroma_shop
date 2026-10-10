import { personalDb } from '../db/personalDb';
import { TaskSeries } from '../domain/types';
import { TaskRepeat } from '../domain/taskRepeat';

type TaskSeriesDbRow = {
  id: string;
  title: string;
  assignee_ids: string[];
  created_by_id: string;
  created_by_display_name: string;
  requires_photo_confirmation: boolean;
  repeat: TaskRepeat;
  next_deadline_at: Date | string;
  instruction_photo_id: string | null;
  active: boolean;
  created_at: Date | string;
};

const toIso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

const mapSeries = (row: TaskSeriesDbRow): TaskSeries => ({
  id: row.id,
  title: row.title,
  assigneeIds: row.assignee_ids,
  createdById: row.created_by_id,
  createdByDisplayName: row.created_by_display_name,
  requiresPhotoConfirmation: row.requires_photo_confirmation,
  repeat: row.repeat,
  nextDeadlineAt: toIso(row.next_deadline_at),
  instructionPhotoId: row.instruction_photo_id ?? null,
  active: row.active,
  createdAt: toIso(row.created_at),
});

const selectFields = `
  id, title, assignee_ids, created_by_id, created_by_display_name,
  requires_photo_confirmation, repeat, next_deadline_at, instruction_photo_id, active, created_at
`;

export const createTaskSeries = async (input: {
  title: string;
  assigneeIds: string[];
  createdById: string;
  createdByDisplayName: string;
  requiresPhotoConfirmation: boolean;
  repeat: TaskRepeat;
  nextDeadlineAt: string;
  instructionPhotoId: string | null;
}): Promise<TaskSeries> => {
  const id = `series_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await personalDb.query<TaskSeriesDbRow>(
    `
      INSERT INTO task_series (
        id, title, assignee_ids, created_by_id, created_by_display_name,
        requires_photo_confirmation, repeat, next_deadline_at, instruction_photo_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING ${selectFields};
    `,
    [
      id,
      input.title,
      input.assigneeIds,
      input.createdById,
      input.createdByDisplayName,
      input.requiresPhotoConfirmation,
      input.repeat,
      input.nextDeadlineAt,
      input.instructionPhotoId,
    ],
  );
  return mapSeries(result.rows[0]);
};

export const listActiveTaskSeries = async (): Promise<TaskSeries[]> => {
  const result = await personalDb.query<TaskSeriesDbRow>(
    `SELECT ${selectFields} FROM task_series WHERE active ORDER BY created_at DESC;`,
  );
  return result.rows.map(mapSeries);
};

export const advanceTaskSeries = async (
  id: string,
  expectedNextDeadlineAt: string,
  nextDeadlineAt: string,
): Promise<boolean> => {
  const result = await personalDb.query(
    `
      UPDATE task_series
      SET next_deadline_at = $3
      WHERE id = $1 AND active AND next_deadline_at = $2;
    `,
    [id, expectedNextDeadlineAt, nextDeadlineAt],
  );
  return (result.rowCount ?? 0) > 0;
};

export const stopTaskSeries = async (id: string): Promise<boolean> => {
  const result = await personalDb.query(
    `UPDATE task_series SET active = FALSE, stopped_at = NOW() WHERE id = $1 AND active;`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
};
