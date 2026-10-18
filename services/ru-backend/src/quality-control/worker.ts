import { qcConfig } from './config';
import { GigaChatAnalysisProvider, NexaraSttProvider } from './providers';
import { MinioQcStorage } from './storage';
import { LlmAnalysisProvider, QcError, QcStorage, SttProvider } from './types';
import { QualityControlRepository } from '../repositories/qualityControlRepository';

export type QualityControlWorkerOptions = {
  repository: QualityControlRepository;
  storage: QcStorage;
  stt: SttProvider;
  analysis: LlmAnalysisProvider;
  maxAttempts: number;
  retryBaseMs: number;
  leaseMs: number;
  pollIntervalMs: number;
  contextWaitMs?: number;
};

const normalizeProcessingError = (error: unknown): QcError => {
  if (error instanceof QcError) return error;
  return new QcError('PROCESSING_INTERNAL_ERROR', 'An internal processing error occurred.', 500, true);
};

export class QualityControlWorker {
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private active: Promise<boolean> | undefined;

  constructor(private readonly options: QualityControlWorkerOptions) {}

  async runOnce(): Promise<boolean> {
    const job = await this.options.repository.claimJob(this.options.maxAttempts, this.options.leaseMs);
    if (!job) return false;
    try {
      if (job.stage === 'transcription') {
        const media = await this.options.repository.getMedia(job.sessionId);
        const audio = await this.options.storage.get(media.storageKey, media.storageBucket);
        const result = await this.options.stt.transcribe({
          sessionId: job.sessionId,
          audio,
          mimeType: media.mimeType,
          filename: media.originalFilename,
          duration: media.duration,
        });
        await this.options.repository.completeTranscription(job, media, result);
      } else {
        if (!job.transcriptId) throw new QcError('PROCESSING_INTERNAL_ERROR', 'Analysis job has no transcript.', 500);
        const transcript = await this.options.repository.readTranscript(job.transcriptId);
        const { context, waiting } = await this.options.repository.readDialogContext(job.sessionId);
        const remaining = (this.options.contextWaitMs ?? 0) - (Date.now() - new Date(job.createdAt).getTime());
        if (waiting && remaining > 0) {
          await this.options.repository.deferAnalysisForContext(job, Math.min(10000, remaining));
          return true;
        }
        const result = await this.options.analysis.analyzeDialog(transcript, context);
        await this.options.repository.completeAnalysis(job, result);
      }
    } catch (error) {
      const safe = normalizeProcessingError(error);
      await this.options.repository.failJob(job, safe, this.options.maxAttempts, this.options.retryBaseMs);
      // Log only identifiers, stage and normalized code. Provider payloads,
      // transcripts, credentials and raw exception messages are intentionally omitted.
      console.warn(`QC job failed jobId=${job.id} stage=${job.stage} code=${safe.code} retryable=${safe.retryable}`);
    }
    return true;
  }

  start() {
    if (this.timer || this.active) return;
    this.stopping = false;
    const tick = async () => {
      if (this.stopping) return;
      try {
        this.active = this.runOnce();
        const processed = await this.active;
        this.active = undefined;
        if (!this.stopping) this.timer = setTimeout(tick, processed ? 0 : this.options.pollIntervalMs);
      } catch {
        this.active = undefined;
        console.warn('QC worker polling failed code=QC_QUEUE_UNAVAILABLE');
        if (!this.stopping) this.timer = setTimeout(tick, this.options.pollIntervalMs);
      }
    };
    this.timer = setTimeout(tick, 0);
  }

  async stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.active;
  }
}

export const createQualityControlWorker = () => {
  const repository = new QualityControlRepository();
  const storage = new MinioQcStorage({
    endpoint: qcConfig.storageEndpoint,
    accessKey: qcConfig.storageAccessKey,
    secretKey: qcConfig.storageSecretKey,
    bucket: qcConfig.storageBucket,
    region: qcConfig.storageRegion,
    maxAudioBytes: qcConfig.maxUploadBytes,
    timeoutMs: qcConfig.storageTimeoutMs,
  });
  return new QualityControlWorker({
    repository,
    storage,
    stt: new NexaraSttProvider({
      apiKey: qcConfig.nexaraApiKey,
      baseUrl: qcConfig.nexaraBaseUrl,
      model: qcConfig.nexaraModel || undefined,
      timeoutMs: qcConfig.nexaraTimeoutMs,
      diarization: true,
    }),
    analysis: new GigaChatAnalysisProvider({
      credentials: qcConfig.gigachatAuthKey,
      scope: qcConfig.gigachatScope,
      baseUrl: qcConfig.gigachatBaseUrl,
      authUrl: qcConfig.gigachatAuthUrl,
      model: qcConfig.gigachatModel,
      timeoutMs: qcConfig.gigachatTimeoutMs,
      caBundlePath: qcConfig.gigachatCaBundlePath || undefined,
      maxTranscriptChars: qcConfig.gigachatMaxTranscriptChars,
      maxTokens: qcConfig.gigachatMaxTokens,
    }),
    maxAttempts: qcConfig.maxAttempts,
    retryBaseMs: qcConfig.retryBaseMs,
    leaseMs: qcConfig.leaseMs,
    pollIntervalMs: qcConfig.pollIntervalMs,
    contextWaitMs: 360000,
  });
};
