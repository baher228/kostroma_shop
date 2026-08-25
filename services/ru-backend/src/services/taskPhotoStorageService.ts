import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const photoDirectory = process.env.TASK_PHOTO_DIR || path.join(process.cwd(), 'tmp', 'task-photos');
const maxPhotoBytes = 5 * 1024 * 1024;
const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const safePath = (fileName: string) => path.join(photoDirectory, path.basename(fileName));

export const saveTaskPhoto = async (photoDataUrl: string): Promise<{ fileName: string; mimeType: string }> => {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(photoDataUrl);
  if (!match) {
    throw new Error('Invalid photo payload.');
  }

  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (data.length === 0 || data.length > maxPhotoBytes) {
    throw new Error('Photo must be between 1 byte and 5 MB.');
  }

  await mkdir(photoDirectory, { recursive: true });
  const fileName = `${Date.now()}_${randomUUID()}.${mimeExtensions[mimeType] ?? 'jpg'}`;
  await writeFile(safePath(fileName), data, { flag: 'wx' });
  return { fileName, mimeType };
};

export const readTaskPhoto = async (fileName: string): Promise<Buffer | null> => {
  const filePath = safePath(fileName);
  try {
    await access(filePath, fsConstants.R_OK);
    return await readFile(filePath);
  } catch {
    return null;
  }
};

export const deleteTaskPhotoFile = async (fileName: string): Promise<void> => {
  try {
    await unlink(safePath(fileName));
  } catch {
    // The DB cleanup is authoritative; missing temp files can be ignored.
  }
};
