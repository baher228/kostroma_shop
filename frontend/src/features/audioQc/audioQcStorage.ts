import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { AudioQcQueueSummary, AudioQcRecording } from './audioQcTypes';

const RECORDINGS_KEY = 'audio_qc_recordings_v1';
const DEVICE_ID_KEY = 'audio_qc_device_id_v1';
const AUDIO_QC_DIRECTORY = 'audio-qc';

const queuedStatuses = new Set<AudioQcRecording['status']>([
  'recorded',
  'waiting_network',
  'creating_ml_session',
  'uploading_audio',
  'audio_uploaded',
  'starting_processing',
  'failed_retryable',
]);

const uploadedStatuses = new Set<AudioQcRecording['status']>(['processing_started', 'completed']);

const safeParseRecordings = (raw: string | null): AudioQcRecording[] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is AudioQcRecording => {
      const candidate = item as Partial<AudioQcRecording>;
      return (
        typeof candidate.localRecordingId === 'string' &&
        typeof candidate.status === 'string' &&
        (!candidate.recordingMode || candidate.recordingMode === 'manual' || candidate.recordingMode === 'vad_auto')
      );
    }).map((recording) => ({ ...recording, recordingMode: recording.recordingMode ?? 'manual' }));
  } catch {
    return [];
  }
};

const writeRecordings = async (recordings: AudioQcRecording[]): Promise<void> => {
  const sorted = [...recordings].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(sorted));
};

export const listAudioQcRecordings = async (): Promise<AudioQcRecording[]> => {
  const raw = await AsyncStorage.getItem(RECORDINGS_KEY);
  return safeParseRecordings(raw);
};

export const upsertAudioQcRecording = async (recording: AudioQcRecording): Promise<AudioQcRecording[]> => {
  const recordings = await listAudioQcRecordings();
  const next = recordings.filter((item) => item.localRecordingId !== recording.localRecordingId);
  next.push(recording);
  await writeRecordings(next);
  return next;
};

export const patchAudioQcRecording = async (
  localRecordingId: string,
  patch: Partial<AudioQcRecording>,
): Promise<AudioQcRecording | null> => {
  const recordings = await listAudioQcRecordings();
  let patched: AudioQcRecording | null = null;
  const next = recordings.map((recording) => {
    if (recording.localRecordingId !== localRecordingId) {
      return recording;
    }
    patched = { ...recording, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
    return patched;
  });
  if (patched) {
    await writeRecordings(next);
  }
  return patched;
};

export const requeueRetryableAudioQcRecordings = async (): Promise<AudioQcRecording[]> => {
  const now = new Date().toISOString();
  const recordings = await listAudioQcRecordings();
  const next = recordings.map((recording) => {
    if (recording.status !== 'failed_retryable' && recording.status !== 'waiting_network') {
      return recording;
    }
    return {
      ...recording,
      status: 'recorded' as const,
      nextRetryAt: null,
      lastError: null,
      updatedAt: now,
    };
  });
  await writeRecordings(next);
  return next;
};

export const buildAudioQcQueueSummary = (recordings: AudioQcRecording[]): AudioQcQueueSummary => {
  const queued = recordings.filter((recording) => queuedStatuses.has(recording.status));
  const failures = recordings.filter((recording) => recording.lastError);
  const uploaded = recordings
    .filter((recording) => uploadedStatuses.has(recording.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    queueSize: queued.length,
    retryableFailures: recordings.filter((recording) => recording.status === 'failed_retryable').length,
    permanentFailures: recordings.filter((recording) => recording.status === 'failed_permanent').length,
    lastError: failures[0]?.lastError ?? null,
    lastUploadAt: uploaded[0]?.updatedAt ?? null,
  };
};

export const getAudioQcDeviceId = async (): Promise<string> => {
  const saved = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (saved) {
    return saved;
  }
  const next = `audioqc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, next);
  return next;
};

const ensureAudioQcDirectory = (): Directory => {
  const directory = new Directory(Paths.document, AUDIO_QC_DIRECTORY);
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
};

const extensionFromUri = (uri: string): string => {
  const match = uri.match(/\.[a-z0-9]+(?:\?.*)?$/i);
  return match ? match[0].replace(/\?.*$/, '') : '.m4a';
};

export const persistAudioQcRecordingFile = (sourceUri: string, localRecordingId: string): string => {
  const directory = ensureAudioQcDirectory();
  if (sourceUri.includes(`/${AUDIO_QC_DIRECTORY}/`)) {
    return sourceUri;
  }
  const source = new File(sourceUri);
  if (!source.exists) {
    throw new Error('Recorded audio file was not found.');
  }
  const target = new File(directory, `${localRecordingId}${extensionFromUri(sourceUri)}`);
  source.move(target);
  return target.uri;
};

export const getAudioQcFileSize = (fileUri: string): number | null => {
  try {
    const info = new File(fileUri).info();
    return info.exists ? info.size ?? null : null;
  } catch {
    return null;
  }
};
