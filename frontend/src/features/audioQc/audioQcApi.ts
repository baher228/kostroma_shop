import { ApiError, request } from '../../api/http';
import {
  AudioQcHeartbeatPayload,
  AudioQcManagedRecording,
  AudioQcPolicy,
  AudioQcPolicyWithHeartbeat,
  AudioQcRecording,
} from './audioQcTypes';

type JsonObject = Record<string, unknown>;

type MlSessionResponse = {
  sessionId?: string;
  id?: string;
  session?: {
    id?: string;
    sessionId?: string;
  };
};

type MlProcessResponse = {
  jobId?: string;
  id?: string;
  status?: string;
  job?: {
    id?: string;
    jobId?: string;
    status?: string;
  };
};

export class AudioQcApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const requestQc = async <T>(
  token: string,
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: JsonObject;
    formData?: FormData;
  } = {},
): Promise<T> => {
  try {
    return await request<T>(`/api/quality-control${path}`, { ...options, token, timeoutMs: options.formData ? 90_000 : 30_000 });
  } catch (error) {
    throw new AudioQcApiError(error instanceof Error ? error.message : 'Quality Control request failed.', error instanceof ApiError ? error.status : 0);
  }
};

const buildQcSessionBody = (recording: AudioQcRecording): JsonObject => ({
  shopId: recording.shopId,
  sellerId: recording.sellerId,
  shiftId: recording.shiftId,
  externalSessionId: recording.localRecordingId,
  startedAt: recording.startedAt,
  endedAt: recording.endedAt ?? new Date().toISOString(),
});

const extractSessionId = (response: MlSessionResponse): string => {
  const sessionId = response.sessionId ?? response.id ?? response.session?.sessionId ?? response.session?.id;
  if (!sessionId) {
    throw new AudioQcApiError('Quality Control did not return a session id.', 502);
  }
  return sessionId;
};

const extractJobId = (response: MlProcessResponse): string | null =>
  response.jobId ?? response.id ?? response.job?.jobId ?? response.job?.id ?? null;

const guessAudioMimeType = (fileUri: string): string => {
  const normalized = fileUri.toLowerCase();
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.webm')) return 'audio/webm';
  if (normalized.endsWith('.3gp')) return 'audio/3gpp';
  return 'audio/mp4';
};

const fileNameFromUri = (fileUri: string, fallback: string): string => {
  const lastSegment = fileUri.split('/').filter(Boolean).pop();
  return lastSegment || fallback;
};

const uploadAudio = async (token: string, sessionId: string, fileUri: string): Promise<void> => {
  const formData = new FormData();
  const name = fileNameFromUri(fileUri, `${sessionId}.m4a`);
  formData.append(
    'file',
    {
      uri: fileUri,
      name,
      type: guessAudioMimeType(fileUri),
    } as unknown as Blob,
    name,
  );

  await requestQc(token, `/sessions/${encodeURIComponent(sessionId)}/audio`, {
    method: 'POST',
    formData,
  });
};

export const audioQcApi = {
  listRecordings: async (token: string, shopId?: string): Promise<AudioQcManagedRecording[]> => {
    const params = new URLSearchParams({ limit: '200' });
    if (shopId) params.set('shopId', shopId);
    const result = await request<{ recordings: AudioQcManagedRecording[] }>(
      `/api/audio-qc/recordings?${params.toString()}`,
      { token },
    );
    return result.recordings;
  },

  syncRecording: async (token: string, recording: AudioQcRecording): Promise<void> => {
    await request<{}>('/api/audio-qc/tablet/recordings', {
      method: 'PUT',
      token,
      body: {
        localRecordingId: recording.localRecordingId,
        mlSessionId: recording.mlSessionId,
        jobId: recording.jobId,
        shopId: recording.shopId,
        sellerId: recording.sellerId,
        shiftId: recording.shiftId,
        deviceId: recording.deviceId,
        startedAt: recording.startedAt,
        endedAt: recording.endedAt,
        appVersion: recording.appVersion,
        timezone: recording.timezone,
        recordingMode: recording.recordingMode,
        durationSec: recording.durationSec,
        fileSizeBytes: recording.fileSizeBytes,
        status: recording.status,
        lastError: recording.lastError,
      },
    });
  },

  listPolicies: async (token: string): Promise<AudioQcPolicyWithHeartbeat[]> => {
    const result = await request<{ policies: AudioQcPolicyWithHeartbeat[] }>('/api/audio-qc/policies', { token });
    return result.policies;
  },

  upsertPolicy: async (
    token: string,
    shopId: string,
    policy: Partial<AudioQcPolicy>,
  ): Promise<AudioQcPolicyWithHeartbeat> => {
    const result = await request<{ policy: AudioQcPolicyWithHeartbeat }>(
      `/api/audio-qc/shops/${encodeURIComponent(shopId)}/policy`,
      {
        method: 'PUT',
        token,
        body: {
          enabled: policy.enabled,
          mode: policy.mode,
          maxSegmentDurationSec: policy.maxSegmentDurationSec,
          silenceToStopSec: policy.silenceToStopSec,
          preRollSec: policy.preRollSec,
          uploadImmediately: policy.uploadImmediately,
        },
      },
    );
    return result.policy;
  },

  getTabletPolicy: async (token: string): Promise<AudioQcPolicy> => {
    const result = await request<{ policy: AudioQcPolicy }>('/api/audio-qc/tablet/policy', { token });
    return result.policy;
  },

  sendHeartbeat: async (token: string, heartbeat: AudioQcHeartbeatPayload): Promise<void> => {
    await request<{}>('/api/audio-qc/tablet/heartbeat', {
      method: 'POST',
      token,
      body: heartbeat,
    });
  },

  createMlSession: async (token: string, recording: AudioQcRecording): Promise<string> => {
    const response = await requestQc<MlSessionResponse>(token, '/sessions', {
      method: 'POST', body: buildQcSessionBody(recording),
    });
    return extractSessionId(response);
  },

  uploadAudio,

  startProcessing: async (token: string, sessionId: string): Promise<{ jobId: string | null; status: string | null }> => {
    const response = await requestQc<MlProcessResponse>(token, `/sessions/${encodeURIComponent(sessionId)}/process`, {
      method: 'POST',
      body: {},
    });
    return { jobId: extractJobId(response), status: response.status ?? response.job?.status ?? null };
  },

  getMlStatus: async (token: string, sessionId: string): Promise<JsonObject> =>
    requestQc<JsonObject>(token, `/sessions/${encodeURIComponent(sessionId)}/status`),
};
