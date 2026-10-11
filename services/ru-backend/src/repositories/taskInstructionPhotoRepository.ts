import { randomUUID } from 'node:crypto';
import { personalDb } from '../db/personalDb';

const maxInstructionPhotoBytes = 5 * 1024 * 1024;

// Instruction photos are stored in Postgres (not the temp photo dir) because they must outlive
// container restarts and are shared by every shop and every repeat of the task.
export const saveTaskInstructionPhoto = async (photoDataUrl: string): Promise<string> => {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(photoDataUrl);
  if (!match) throw new Error('Invalid photo payload.');
  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (data.length === 0 || data.length > maxInstructionPhotoBytes) {
    throw new Error('Photo must be between 1 byte and 5 MB.');
  }
  const id = `instr_${Date.now()}_${randomUUID()}`;
  await personalDb.query(
    'INSERT INTO task_instruction_photos (id, mime_type, data) VALUES ($1, $2, $3);',
    [id, mimeType, data],
  );
  return id;
};

export const findTaskInstructionPhoto = async (
  taskId: string,
): Promise<{ assigneeId: string; mimeType: string; data: Buffer } | null> => {
  const result = await personalDb.query<{ assignee_id: string; mime_type: string; data: Buffer }>(
    `
      SELECT t.assignee_id, p.mime_type, p.data
      FROM tasks t
      JOIN task_instruction_photos p ON p.id = t.instruction_photo_id
      WHERE t.id = $1;
    `,
    [taskId],
  );
  const row = result.rows[0];
  return row ? { assigneeId: row.assignee_id, mimeType: row.mime_type, data: row.data } : null;
};
