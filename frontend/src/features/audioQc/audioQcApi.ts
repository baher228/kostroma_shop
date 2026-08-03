import { request } from '../../api/http';
import {
  AudioQcHeartbeatPayload,
  AudioQcPolicy,
  AudioQcPolicyWithHeartbeat,
  AudioQcRecording,
} from './audioQcTypes';

const ML_API_BASE_URL = (process.env.EXPO_PUBLIC_ML_API_URL || process.env.ML_API_BASE_URL || '').replace(/\/+$/, '');
const ML_REQUEST_TIMEOUT_MS = 30_000;

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

const getMlApiBaseUrl = (): string => {
  if (!ML_API_BASE_URL) {
    throw new AudioQcApiError('ML_API_BASE_URL is not configured.', 0);
  }
  return ML_API_BASE_URL;
};

const fetchWithTimeout = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AudioQcApiError('ML service did not respond in time.', 0);
    }
    throw new AudioQcApiError(error instanceof Error ? error.message : 'Network error while calling ML service.', 0);
  } finally {
    clearTimeout(timeout);
  }
};

const parseJson = async (response: Response): Promise<JsonObject> => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return {};
  }
};

const requestMlJson = async <T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: JsonObject;
  } = {},
): Promise<T> => {
  const response = await fetchWithTimeout(`${getMlApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const parsed = await parseJson(response);
  if (!response.ok) {
    throw new AudioQcApiError(typeof parsed.message === 'string' ? parsed.message : 'ML service request failed.', response.status);
  }
  return parsed as T;
};

const buildMlSessionBody = (recording: AudioQcRecording, includeClientMetadata: boolean): JsonObject => ({
  shopId: recording.shopId,
  sellerId: recording.sellerId,
  shiftId: recording.shiftId,
  deviceId: recording.deviceId,
  startedAt: recording.startedAt,
  endedAt: recording.endedAt ?? new Date().toISOString(),
  ...(includeClientMetadata
    ? {
        appVersion: recording.appVersion,
        timezone: recording.timezone,
        recordingMode: recording.recordingMode,
        ...(recording.vad ? { vad: recording.vad } : {}),
      }
    : {}),
});

const extractSessionId = (response: MlSessionResponse): string => {
  const sessionId = response.sessionId ?? response.id ?? response.session?.sessionId ?? response.session?.id;
  if (!sessionId) {
    throw new AudioQcApiError('ML service did not return a session id.', 502);
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

const uploadAudio = async (sessionId: string, fileUri: string): Promise<void> => {
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

  const response = await fetchWithTimeout(`${getMlApiBaseUrl()}/api/ml/sessions/${encodeURIComponent(sessionId)}/audio`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });
  const parsed = await parseJson(response);
  if (!response.ok) {
    throw new AudioQcApiError(typeof parsed.message === 'string' ? parsed.message : 'ML audio upload failed.', response.status);
  }
};

export const audioQcApi = {
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

  createMlSession: async (recording: AudioQcRecording): Promise<string> => {
    try {
      const response = await requestMlJson<MlSessionResponse>('/api/ml/sessions', {
        method: 'POST',
        body: buildMlSessionBody(recording, true),
      });
      return extractSessionId(response);
    } catch (error) {
      if (error instanceof AudioQcApiError && (error.status === 400 || error.status === 422)) {
        const response = await requestMlJson<MlSessionResponse>('/api/ml/sessions', {
          method: 'POST',
          body: buildMlSessionBody(recording, false),
        });
        return extractSessionId(response);
      }
      throw error;
    }
  },

  uploadAudio,

  startProcessing: async (sessionId: string): Promise<{ jobId: string | null; status: string | null }> => {
    const response = await requestMlJson<MlProcessResponse>(`/api/ml/sessions/${encodeURIComponent(sessionId)}/process`, {
      method: 'POST',
      body: { pipeline: 'audio_mvp' },
    });
    return { jobId: extractJobId(response), status: response.status ?? response.job?.status ?? null };
  },

  getMlStatus: async (sessionId: string): Promise<JsonObject> =>
    requestMlJson<JsonObject>(`/api/ml/sessions/${encodeURIComponent(sessionId)}/status`),
};
