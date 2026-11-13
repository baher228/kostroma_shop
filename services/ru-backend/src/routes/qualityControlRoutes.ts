import { Express, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { AuthorizedRequest, requireAuth, requireRole } from '../auth/middleware';
import { toValidationMessage } from '../http/http';
import { qcConfig } from '../quality-control/config';
import { MinioQcStorage } from '../quality-control/storage';
import { QcError } from '../quality-control/types';
import { QualityControlRepository } from '../repositories/qualityControlRepository';
import { QualityControlService } from '../services/qualityControlService';

const identifier = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
const timestamp = z.iso.datetime({ offset: true });
const paramsSchema = z.object({ id: identifier });
const createSchema = z.object({
  shopId: identifier, sellerId: identifier.nullable().optional(), shiftId: identifier.nullable().optional(),
  externalSessionId: z.string().min(1).max(200).nullable().optional(),
  startedAt: timestamp, endedAt: timestamp.nullable().optional(),
}).strict().refine(input => !input.endedAt || Date.parse(input.endedAt) >= Date.parse(input.startedAt), {
  message: 'endedAt must not precede startedAt.', path: ['endedAt'],
});
const filterDate = z.union([timestamp, z.iso.date()]);
const filtersSchema = z.object({
  from: filterDate.optional(), to: filterDate.optional(), shopId: identifier.optional(),
  sellerId: identifier.optional(), shiftId: identifier.optional(),
  qualityClass: z.enum(['good', 'neutral', 'bad']).optional(), interval: z.enum(['day', 'week', 'month']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict().refine(input => !input.from || !input.to || Date.parse(input.from) <= Date.parse(input.to), {
  message: 'from must not follow to.', path: ['to'],
}).transform(input => {
  const from = input.from?.length === 10 ? `${input.from}T00:00:00.000Z` : input.from;
  let to = input.to;
  if (to?.length === 10) {
    const end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    to = end.toISOString();
  }
  return { ...input, from, to };
});
const processSchema = z.object({ idempotencyKey: z.string().min(1).max(200).optional() }).strict();
const pinSchema = z.object({ pinned: z.boolean() }).strict();

export const handleQualityControlError = (error: unknown, res: Response) => {
  if (error instanceof ZodError) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: toValidationMessage(error) });
  } else if (error instanceof QcError) {
    res.status(error.status).json({ code: error.code, message: error.message });
  } else if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      code: error.code === 'LIMIT_FILE_SIZE' ? 'MEDIA_TOO_LARGE' : 'MEDIA_INVALID',
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Audio exceeds the upload size limit.' : 'Upload exactly one audio file in the file field.',
    });
  } else {
    // Never send/log raw provider, database or storage errors (they can contain personal data).
    res.status(500).json({ code: 'PROCESSING_INTERNAL_ERROR', message: 'Quality Control request failed.' });
  }
};

export const createQualityControlService = () => new QualityControlService(new QualityControlRepository(), new MinioQcStorage({
  endpoint: qcConfig.storageEndpoint, accessKey: qcConfig.storageAccessKey, secretKey: qcConfig.storageSecretKey,
  bucket: qcConfig.storageBucket, region: qcConfig.storageRegion, maxAudioBytes: qcConfig.maxUploadBytes,
  timeoutMs: qcConfig.storageTimeoutMs,
}), qcConfig.maxUploadBytes, qcConfig.retentionStandardHours * 60 * 60 * 1000);

export const registerQualityControlRoutes = (app: Express, options: {
  service?: QualityControlService; auth?: RequestHandler; enabled?: boolean;
} = {}) => {
  const service = options.service ?? createQualityControlService();
  const auth = options.auth ?? requireAuth;
  const enabled = options.enabled ?? qcConfig.enabled;
  const base = '/api/quality-control';
  const guard: RequestHandler = (_req, res, next) => {
    if (!enabled) { res.status(503).json({ code: 'QC_DISABLED', message: 'Quality Control is not enabled.' }); return; }
    next();
  };
  const user = (req: Request) => (req as AuthorizedRequest).user;
  const id = (req: Request) => paramsSchema.parse(req.params).id;
  const handle = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => async (req, res) => {
    try { await fn(req, res); } catch (error) { handleQualityControlError(error, res); }
  };

  app.post(`${base}/sessions`, auth, guard, handle(async (req, res) => {
    const input = createSchema.parse(req.body);
    // Older tablet builds can still have cached manual controls. Refuse their
    // manual sessions even before they fetch the VAD-only policy.
    if (user(req).role === 'store_tablet' && !input.externalSessionId?.startsWith('aqc_vad_')) {
      throw new QcError('MANUAL_RECORDING_DISABLED', 'Only automatic VAD recordings are supported.', 400);
    }
    res.status(201).json({ session: await service.createSession(user(req), input) });
  }));
  app.get(`${base}/sessions`, auth, guard, handle(async (req, res) => {
    res.json({ sessions: await service.listSessions(user(req), filtersSchema.parse(req.query)) });
  }));
  app.get(`${base}/sessions/:id`, auth, guard, handle(async (req, res) => {
    res.json({ session: await service.getSession(user(req), id(req)) });
  }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: service.maxAudioBytes, files: 1, fields: 0, parts: 2 } }).single('file');
  let activeUploads = 0;
  app.post(`${base}/sessions/:id/audio`, auth, guard, handle(async (req, res) => {
    const sessionId = id(req);
    // Authorize before accepting/buffering personal media.
    await service.getSession(user(req), sessionId);
    if (!req.is('multipart/form-data')) throw new QcError('MEDIA_INVALID', 'Use multipart/form-data with one file field.', 415);
    if (activeUploads >= 2) throw new QcError('UPLOAD_BUSY', 'Audio upload capacity reached; retry shortly.', 429, true);
    activeUploads += 1;
    try {
      await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
      const result = await service.uploadAudio(user(req), sessionId, req.file);
      res.status(202).json(result);
    } finally { activeUploads -= 1; }
  }));

  app.get(`${base}/sessions/:id/audio-info`, auth, guard, requireRole('manager'), handle(async (req, res) => {
    const media = await service.getAudioInfo(user(req), id(req));
    res.json({ audio: {
      available: !media.deletedAt, mimeType: media.mimeType, size: media.size, duration: media.duration,
      retentionClass: media.retentionClass, retentionReason: media.retentionReason, expiresAt: media.expiresAt,
      pinnedAt: media.pinnedAt, deletedAt: media.deletedAt,
    } });
  }));

  let activeDownloads = 0;
  app.get(`${base}/sessions/:id/audio`, auth, guard, requireRole('manager'), handle(async (req, res) => {
    if (activeDownloads >= 2) throw new QcError('DOWNLOAD_BUSY', 'Audio download capacity reached; retry shortly.', 429, true);
    activeDownloads += 1;
    try {
      const sessionId = id(req);
      const { media, audio } = await service.downloadAudio(user(req), sessionId);
      const extension = ({ 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
        'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/3gpp': '3gp' } as Record<string, string>)[media.mimeType] ?? 'audio';
      res.set({
        'Content-Type': media.mimeType, 'Content-Length': String(audio.length),
        'Content-Disposition': `attachment; filename="quality-control-${sessionId}.${extension}"`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      });
      res.send(audio);
    } finally { activeDownloads -= 1; }
  }));

  app.put(`${base}/sessions/:id/audio-retention`, auth, guard, requireRole('manager'), handle(async (req, res) => {
    const media = await service.setAudioPinned(user(req), id(req), pinSchema.parse(req.body).pinned);
    res.json({ audio: {
      available: !media.deletedAt, mimeType: media.mimeType, size: media.size, duration: media.duration,
      retentionClass: media.retentionClass, retentionReason: media.retentionReason, expiresAt: media.expiresAt,
      pinnedAt: media.pinnedAt, deletedAt: media.deletedAt,
    } });
  }));

  for (const action of ['process', 'reanalyze'] as const) {
    app.post(`${base}/sessions/:id/${action}`, auth, guard, ...(action === 'reanalyze' ? [requireRole('manager')] : []), handle(async (req, res) => {
      const body = processSchema.parse(req.body ?? {});
      const header = req.get('Idempotency-Key');
      const key = z.string().min(1).max(200).optional().parse(header ?? body.idempotencyKey);
      if (action === 'reanalyze' && !key) throw new QcError('IDEMPOTENCY_KEY_REQUIRED', 'Reanalysis requires an Idempotency-Key.', 400);
      const job = await service.enqueue(user(req), id(req), action === 'reanalyze', key);
      res.status(202).json({ job });
    }));
  }
  app.get(`${base}/sessions/:id/status`, auth, guard, handle(async (req, res) => {
    res.json(await service.getStatus(user(req), id(req)));
  }));
  app.get(`${base}/sessions/:id/transcript`, auth, guard, handle(async (req, res) => {
    const transcript = await service.getTranscript(user(req), id(req));
    if (!transcript) throw new QcError('TRANSCRIPT_NOT_READY', 'Transcript is not available yet.', 404);
    res.json(transcript);
  }));
  app.get(`${base}/sessions/:id/analysis`, auth, guard, handle(async (req, res) => {
    const query = z.object({ history: z.enum(['true', 'false']).optional() }).strict().parse(req.query);
    const analysis = await service.getAnalysis(user(req), id(req), query.history === 'true');
    if (!analysis) throw new QcError('ANALYSIS_NOT_READY', 'Analysis is not available yet.', 404);
    res.json(query.history === 'true' ? { analyses: analysis } : { analysis });
  }));
  for (const projection of ['scorecard', 'recommendations'] as const) {
    app.get(`${base}/sessions/:id/${projection}`, auth, guard, handle(async (req, res) => {
      const result = await service.getAnalysis(user(req), id(req));
      if (!result || Array.isArray(result)) throw new QcError('ANALYSIS_NOT_READY', 'Analysis is not available yet.', 404);
      const structured = result.structuredResult;
      res.json(projection === 'recommendations'
        ? { recommendations: structured.recommendations }
        : { scorecard: structured.quality.criteria, overallScore: result.overallScore, qualityClass: result.qualityClass });
    }));
  }
  for (const kind of ['overview', 'trends', 'criteria', 'sellers', 'shops'] as const) {
    app.get(`${base}/analytics/${kind}`, auth, guard, requireRole('manager'), handle(async (req, res) => {
      res.json(await service.analytics(user(req), kind, filtersSchema.parse(req.query)));
    }));
  }
};
