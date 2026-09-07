import { createHash, randomUUID } from 'node:crypto';
import { SessionUser } from '../domain/types';
import { QualityControlRepository } from '../repositories/qualityControlRepository';
import { CreateSessionInput, QcError, QcFilters, QcMedia, QcStorage } from '../quality-control/types';

export type QcUpload = { originalname: string; mimetype: string; buffer: Buffer; size: number };
export type QualityControlData = Pick<QualityControlRepository,
  'createSession' | 'getSession' | 'listSessions' | 'attachAudio' | 'enqueue' | 'getStatus' |
  'getTranscript' | 'getAnalysis' | 'analytics'>;

const formats: Record<string, { extension: string; mime: string; valid: (buffer: Buffer) => boolean }> = {
  wav: { extension: 'wav', mime: 'audio/wav', valid: b => b.length > 44 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE' },
  mp4: { extension: 'm4a', mime: 'audio/mp4', valid: b => b.length > 16 && b.toString('ascii', 4, 8) === 'ftyp' },
  webm: { extension: 'webm', mime: 'audio/webm', valid: b => b.length > 16 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  mpeg: { extension: 'mp3', mime: 'audio/mpeg', valid: b => b.length > 16 && (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) },
  ogg: { extension: 'ogg', mime: 'audio/ogg', valid: b => b.length > 28 && b.toString('ascii', 0, 4) === 'OggS' },
  flac: { extension: 'flac', mime: 'audio/flac', valid: b => b.length > 16 && b.toString('ascii', 0, 4) === 'fLaC' },
  aac: { extension: 'aac', mime: 'audio/aac', valid: b => b.length > 16 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0 },
  '3gpp': { extension: '3gp', mime: 'audio/3gpp', valid: b => b.length > 16 && b.toString('ascii', 4, 8) === 'ftyp' && b.toString('ascii', 8, 11) === '3gp' },
};
const mimeAliases: Record<string, string> = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'mp4', 'audio/m4a': 'mp4', 'audio/x-m4a': 'mp4',
  'audio/webm': 'webm', 'audio/mpeg': 'mpeg', 'audio/mp3': 'mpeg',
  'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/aac': 'aac', 'audio/3gpp': '3gpp',
};

export const validateQcAudio = (file: QcUpload | undefined, maxAudioBytes: number) => {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size === 0 || file.buffer.length === 0) {
    throw new QcError('MEDIA_INVALID', 'A non-empty audio file is required.', 400);
  }
  if (file.size !== file.buffer.length) throw new QcError('MEDIA_INVALID', 'Audio size metadata is invalid.', 400);
  if (file.size > maxAudioBytes) throw new QcError('MEDIA_TOO_LARGE', 'Audio exceeds the upload size limit.', 413);
  const format = formats[mimeAliases[file.mimetype.toLowerCase().split(';')[0].trim()]];
  if (!format || !format.valid(file.buffer)) {
    throw new QcError('MEDIA_UNSUPPORTED', 'Unsupported audio format or invalid audio signature.', 415);
  }
  // Original names are display metadata only; object paths never contain client filenames.
  const originalFilename = file.originalname.replace(/\\/g, '/').split('/').pop()?.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || `audio.${format.extension}`;
  return { ...format, originalFilename };
};

export class QualityControlService {
  constructor(readonly repository: QualityControlData, readonly storage: QcStorage, readonly maxAudioBytes: number) {}

  createSession(user: SessionUser, input: CreateSessionInput) { return this.repository.createSession(user, input); }
  getSession(user: SessionUser, id: string) { return this.repository.getSession(user, id); }
  listSessions(user: SessionUser, filters: QcFilters) { return this.repository.listSessions(user, filters); }

  async uploadAudio(user: SessionUser, id: string, file: QcUpload | undefined) {
    const session = await this.repository.getSession(user, id);
    const format = validateQcAudio(file, this.maxAudioBytes);
    const audio = file!;
    const sha256 = createHash('sha256').update(audio.buffer).digest('hex');
    const media: QcMedia = {
      id: randomUUID(), sessionId: id, type: 'audio',
      storageKey: `quality-control/shops/${session.shopId}/sessions/${id}/audio/${sha256}.${format.extension}`,
      storageBucket: this.storage.bucket, originalFilename: format.originalFilename,
      mimeType: format.mime, size: audio.buffer.length, duration: null, sha256,
    };
    await this.storage.put(media.storageKey, audio.buffer, media.mimeType);
    // A failed/ambiguous DB commit must not delete an object another retry already attached.
    // Repeating the upload uses the same key; repository enforces one immutable audio per session.
    try {
      return await this.repository.attachAudio(user, id, media);
    } catch (error) {
      // A domain rejection happens before commit, so this newly written key is
      // unreferenced. Unknown database errors can be ambiguous and retain the
      // deterministic object for a safe retry instead of risking data loss.
      if (error instanceof QcError) await this.storage.remove(media.storageKey).catch(() => undefined);
      throw error;
    }
  }

  enqueue(user: SessionUser, id: string, reanalyze = false, key?: string) { return this.repository.enqueue(user, id, reanalyze, key); }
  getStatus(user: SessionUser, id: string) { return this.repository.getStatus(user, id); }
  getTranscript(user: SessionUser, id: string) { return this.repository.getTranscript(user, id); }
  getAnalysis(user: SessionUser, id: string, history = false) { return this.repository.getAnalysis(user, id, history); }
  analytics(user: SessionUser, kind: 'overview' | 'trends' | 'criteria' | 'sellers' | 'shops', filters: QcFilters) {
    return this.repository.analytics(user, kind, filters);
  }
}
