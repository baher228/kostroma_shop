import { audioQcApi, AudioQcApiError } from './audioQcApi';
import { AudioQcRecording, AudioQcRecordingStatus } from './audioQcTypes';
import {
  listAudioQcRecordings,
  patchAudioQcRecording,
  requeueRetryableAudioQcRecordings,
  upsertAudioQcRecording,
} from './audioQcStorage';

const MAX_ATTEMPTS = 10;
const QUEUE_BATCH_LIMIT = 3;

const candidateStatuses = new Set<AudioQcRecordingStatus>([
  'recorded',
  'waiting_network',
  'creating_ml_session',
  'uploading_audio',
  'audio_uploaded',
  'starting_processing',
  'failed_retryable',
]);

const uploadFinishedStatuses = new Set<AudioQcRecordingStatus>([
  'audio_uploaded',
  'starting_processing',
  'processing_started',
  'completed',
]);

const terminalProcessingStatuses = new Set(['completed', 'complete', 'succeeded', 'success', 'done']);
const retryableServerErrorCodes = new Set([
  'STORAGE_ERROR', 'STORAGE_TIMEOUT', 'NEXARA_TIMEOUT', 'NEXARA_RATE_LIMIT', 'NEXARA_ERROR', 'NEXARA_UNAVAILABLE',
  'GIGACHAT_TIMEOUT', 'GIGACHAT_RATE_LIMIT', 'GIGACHAT_ERROR', 'GIGACHAT_UNAVAILABLE',
  'PROCESSING_INTERNAL_ERROR', 'PROCESSING_LEASE_EXPIRED',
]);

type ProcessAudioQcQueueOptions = {
  token: string;
  shopId: string | null;
  onRecordingChanged?: (recording: AudioQcRecording) => void | Promise<void>;
};

type ProcessAudioQcQueueResult = {
  attempted: number;
  processed: number;
  lastError: string | null;
};

const nextRetryDelayMs = (attemptCount: number): number | null => {
  if (attemptCount >= MAX_ATTEMPTS) {
    return null;
  }
  if (attemptCount <= 1) return 60_000;
  if (attemptCount === 2) return 5 * 60_000;
  if (attemptCount === 3) return 15 * 60_000;
  return 60 * 60_000;
};

const isDue = (recording: AudioQcRecording, nowMs: number): boolean => {
  if (!candidateStatuses.has(recording.status)) {
    return false;
  }
  if (recording.status === 'failed_retryable' && !recording.nextRetryAt) {
    return false;
  }
  if (!recording.nextRetryAt) {
    return true;
  }
  const dueAt = Date.parse(recording.nextRetryAt);
  return Number.isNaN(dueAt) || dueAt <= nowMs;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown Audio QC upload error.';

const classifyFailureStatus = (error: unknown, attemptCount: number): AudioQcRecordingStatus => {
  if (error instanceof AudioQcApiError && error.status === 0) {
    return 'waiting_network';
  }
  if (
    error instanceof AudioQcApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return 'failed_permanent';
  }
  return attemptCount >= MAX_ATTEMPTS ? 'failed_permanent' : 'failed_retryable';
};

const shouldUploadAudio = (recording: AudioQcRecording): boolean => !uploadFinishedStatuses.has(recording.status);

export const processAudioQcQueue = async (
  options: ProcessAudioQcQueueOptions,
): Promise<ProcessAudioQcQueueResult> => {
  if (!options.token || !options.shopId) return { attempted: 0, processed: 0, lastError: null };
  const nowMs = Date.now();
  const recordings = await listAudioQcRecordings();
  const candidates = recordings
    .filter((recording) => recording.shopId === options.shopId && isDue(recording, nowMs))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, QUEUE_BATCH_LIMIT);

  let attempted = 0;
  let processed = 0;
  let lastError: string | null = null;

  // Upload acknowledgement only starts the server pipeline. Poll until analysis finishes.
  for (const pending of recordings.filter(recording => recording.shopId === options.shopId && recording.status === 'processing_started' && recording.mlSessionId).slice(0, QUEUE_BATCH_LIMIT)) {
    try {
      const remote = await audioQcApi.getMlStatus(options.token, pending.mlSessionId!);
      const status = typeof remote.status === 'string' ? remote.status : '';
      const failed = status === 'transcription_failed' || status === 'analysis_failed';
      if (terminalProcessingStatuses.has(status) || failed) {
        const latestJob = remote.latestJob as { errorCode?: string; errorMessage?: string } | undefined;
        const failedStatus: AudioQcRecordingStatus = latestJob?.errorCode && retryableServerErrorCodes.has(latestJob.errorCode)
          ? 'failed_retryable'
          : 'failed_permanent';
        const patch: Partial<AudioQcRecording> = {
          status: failed ? failedStatus : 'completed',
          lastError: failed ? latestJob?.errorMessage || 'Quality Control processing failed.' : null,
          nextRetryAt: null, updatedAt: new Date().toISOString(),
        };
        await patchAudioQcRecording(pending.localRecordingId, patch);
        await options.onRecordingChanged?.({ ...pending, ...patch });
        if (failed) lastError = patch.lastError ?? null;
      }
    } catch (error) {
      lastError = toErrorMessage(error);
      // Old standalone ML session IDs have no record in RU; re-upload the retained local file.
      if (error instanceof AudioQcApiError && error.status === 404) {
        const patch: Partial<AudioQcRecording> = { mlSessionId: null, jobId: null, status: 'recorded', nextRetryAt: null };
        await patchAudioQcRecording(pending.localRecordingId, patch);
        await options.onRecordingChanged?.({ ...pending, ...patch });
      }
    }
  }

  for (const candidate of candidates) {
    attempted += 1;
    let current: AudioQcRecording = {
      ...candidate,
      attemptCount: candidate.attemptCount + 1,
      status: candidate.mlSessionId ? candidate.status : 'creating_ml_session',
      lastError: null,
      updatedAt: new Date().toISOString(),
    };

    const save = async (patch: Partial<AudioQcRecording>) => {
      current = {
        ...current,
        ...patch,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      await upsertAudioQcRecording(current);
      await options.onRecordingChanged?.(current);
    };

    try {
      if (!current.localFileUri) {
        throw new AudioQcApiError('Recorded audio file URI is missing.', 400);
      }

      await save({ status: current.mlSessionId ? current.status : 'creating_ml_session' });

      let sessionId = current.mlSessionId;
      if (!sessionId) {
        sessionId = await audioQcApi.createMlSession(options.token, current);
        await save({ mlSessionId: sessionId, status: 'uploading_audio' });
      }

      if (shouldUploadAudio(current)) {
        await save({ status: 'uploading_audio' });
        await audioQcApi.uploadAudio(options.token, sessionId, current.localFileUri);
        await save({ status: 'audio_uploaded' });
      }

      await save({ status: 'starting_processing' });
      const processResult = await audioQcApi.startProcessing(options.token, sessionId);
      await save({
        jobId: processResult.jobId,
        // A completed transcription job still has a following analysis job.
        status: 'processing_started',
        nextRetryAt: null,
        lastError: null,
      });
      processed += 1;
    } catch (error) {
      const message = toErrorMessage(error);
      lastError = message;
      const status = classifyFailureStatus(error, current.attemptCount);
      const delay = status === 'failed_permanent' ? null : nextRetryDelayMs(current.attemptCount);
      await patchAudioQcRecording(current.localRecordingId, {
        status: error instanceof AudioQcApiError && error.status === 404 && current.mlSessionId ? 'recorded' : status,
        ...(error instanceof AudioQcApiError && error.status === 404 && current.mlSessionId ? { mlSessionId: null, jobId: null } : {}),
        lastError: message,
        nextRetryAt: delay === null ? null : new Date(Date.now() + delay).toISOString(),
      });
      const refreshed = await listAudioQcRecordings();
      const changed = refreshed.find((recording) => recording.localRecordingId === current.localRecordingId);
      if (changed) {
        await options.onRecordingChanged?.(changed);
      }
    }
  }

  return { attempted, processed, lastError };
};

export const retryAudioQcQueueNow = async (
  options: ProcessAudioQcQueueOptions,
): Promise<ProcessAudioQcQueueResult> => {
  const recordings = await requeueRetryableAudioQcRecordings();
  for (const recording of recordings) {
    await options.onRecordingChanged?.(recording);
  }
  return processAudioQcQueue(options);
};
