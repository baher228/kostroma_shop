import Constants from 'expo-constants';
import {
  RecordingOptions,
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { audioQcApi } from './audioQcApi';
import { processAudioQcQueue, retryAudioQcQueueNow } from './audioQcQueue';
import { createDefaultAudioQcPolicy, normalizeAudioQcPolicy } from './audioQcPolicy';
import {
  buildAudioQcQueueSummary,
  getAudioQcDeviceId,
  getAudioQcFileSize,
  listAudioQcRecordings,
  persistAudioQcRecordingFile,
  upsertAudioQcRecording,
} from './audioQcStorage';
import {
  AudioQcActivityStatus,
  AudioQcControllerValue,
  AudioQcPolicy,
  AudioQcPolicyWithHeartbeat,
  AudioQcRecording,
} from './audioQcTypes';
import { Session } from '../../types/models';

const POLICY_POLL_MS = 45_000;
const HEARTBEAT_MS = 30_000;
const QUEUE_POLL_MS = 20_000;

const AUDIO_QC_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    extension: '.m4a',
    sampleRate: 16000,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: '.m4a',
    sampleRate: 16000,
  },
  web: {
    ...RecordingPresets.HIGH_QUALITY.web,
    mimeType: 'audio/webm',
    bitsPerSecond: 64000,
  },
};

const sortRecordings = (recordings: AudioQcRecording[]): AudioQcRecording[] =>
  [...recordings].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

const mergeRecording = (recordings: AudioQcRecording[], recording: AudioQcRecording): AudioQcRecording[] =>
  sortRecordings([...recordings.filter((item) => item.localRecordingId !== recording.localRecordingId), recording]);

const createRecordingId = (): string =>
  `aqc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const getAppVersion = (): string => Constants.expoConfig?.version ?? 'unknown';

const getTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Неизвестная ошибка Audio QC.';

const canUseAudioQc = (session: Session): boolean =>
  session.user.role === 'store_tablet' || session.user.role === 'manager';

export const useAudioQcController = (session: Session): AudioQcControllerValue => {
  const [lastRecorderError, setLastRecorderError] = useState<string | null>(null);
  const recorder = useAudioRecorder(AUDIO_QC_RECORDING_OPTIONS, (status) => {
    if (status.hasError) {
      setLastRecorderError(status.error ?? 'Ошибка записи аудио.');
    }
  });
  const recorderState = useAudioRecorderState(recorder, 500);

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AudioQcPolicy | null>(
    session.user.shopId ? createDefaultAudioQcPolicy(session.user.shopId) : null,
  );
  const [policies, setPolicies] = useState<AudioQcPolicyWithHeartbeat[]>([]);
  const [recordings, setRecordings] = useState<AudioQcRecording[]>([]);
  const [queueSummary, setQueueSummary] = useState(buildAudioQcQueueSummary([]));
  const [currentRecording, setCurrentRecording] = useState<AudioQcRecording | null>(null);
  const [isQueueProcessing, setIsQueueProcessing] = useState(false);
  const [isPolicyLoading, setIsPolicyLoading] = useState(false);
  const [isPolicySaving, setIsPolicySaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const currentRecordingRef = useRef<AudioQcRecording | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const queueSummaryRef = useRef(queueSummary);
  const policyRef = useRef<AudioQcPolicy | null>(policy);
  const queueProcessingRef = useRef(false);
  const isPausedRef = useRef(false);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    queueSummaryRef.current = queueSummary;
  }, [queueSummary]);

  useEffect(() => {
    policyRef.current = policy;
  }, [policy]);

  const setCurrentRecordingState = useCallback((recording: AudioQcRecording | null) => {
    currentRecordingRef.current = recording;
    setCurrentRecording(recording);
  }, []);

  const setPausedState = useCallback((paused: boolean) => {
    isPausedRef.current = paused;
    setIsPaused(paused);
  }, []);

  const handleRecordingChanged = useCallback((recording: AudioQcRecording) => {
    setRecordings((current) => {
      const next = mergeRecording(current, recording);
      setQueueSummary(buildAudioQcQueueSummary(next));
      return next;
    });
  }, []);

  const refreshRecordings = useCallback(async () => {
    const next = sortRecordings(await listAudioQcRecordings());
    setRecordings(next);
    setQueueSummary(buildAudioQcQueueSummary(next));
    return next;
  }, []);

  const ensureDeviceId = useCallback(async (): Promise<string> => {
    if (deviceIdRef.current) {
      return deviceIdRef.current;
    }
    const next = await getAudioQcDeviceId();
    deviceIdRef.current = next;
    setDeviceId(next);
    return next;
  }, []);

  const runQueue = useCallback(async () => {
    if (queueProcessingRef.current) {
      return;
    }
    queueProcessingRef.current = true;
    setIsQueueProcessing(true);
    try {
      const result = await processAudioQcQueue({ onRecordingChanged: handleRecordingChanged });
      if (result.lastError) {
        setLastError(result.lastError);
      }
      await refreshRecordings();
    } finally {
      queueProcessingRef.current = false;
      setIsQueueProcessing(false);
    }
  }, [handleRecordingChanged, refreshRecordings]);

  const ensureRecordingPermission = useCallback(async (): Promise<void> => {
    const currentPermission = await getRecordingPermissionsAsync();
    if (!currentPermission.granted) {
      const requestedPermission = await requestRecordingPermissionsAsync();
      if (!requestedPermission.granted) {
        throw new Error('Нет разрешения на микрофон.');
      }
    }
  }, []);

  const startRecording = useCallback(
    async () => {
      if (!canUseAudioQc(session)) {
        throw new Error('Audio QC доступен только manager/store_tablet.');
      }
      if (currentRecordingRef.current || recorder.getStatus().isRecording) {
        return;
      }

      const nextDeviceId = await ensureDeviceId();
      const shopId = session.user.shopId ?? policyRef.current?.shopId;
      if (!shopId) {
        throw new Error('Для Audio QC нужен назначенный магазин.');
      }

      await ensureRecordingPermission();
      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix',
      });

      const now = new Date().toISOString();
      const draft: AudioQcRecording = {
        localRecordingId: createRecordingId(),
        mlSessionId: null,
        jobId: null,
        shopId,
        sellerId: session.user.role === 'worker' ? session.user.id : null,
        shiftId: null,
        deviceId: nextDeviceId,
        startedAt: now,
        endedAt: null,
        appVersion: getAppVersion(),
        timezone: getTimezone(),
        recordingMode: 'manual',
        localFileUri: '',
        durationSec: null,
        fileSizeBytes: null,
        status: 'recording',
        attemptCount: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      };

      await recorder.prepareToRecordAsync(AUDIO_QC_RECORDING_OPTIONS);
      recorder.record();
      setPausedState(false);
      await upsertAudioQcRecording(draft);
      setCurrentRecordingState(draft);
      handleRecordingChanged(draft);
      setLastError(null);
      setLastRecorderError(null);
    },
    [ensureDeviceId, ensureRecordingPermission, handleRecordingChanged, recorder, session, setCurrentRecordingState, setPausedState],
  );

  const stopRecording = useCallback(async () => {
    const draft = currentRecordingRef.current;
    if (!draft) {
      return;
    }

    try {
      await recorder.stop();
      setPausedState(false);
      const sourceUri = recorder.uri ?? recorder.getStatus().url;
      if (!sourceUri) {
        throw new Error('Expo Audio did not return a recording URI.');
      }

      const endedAt = new Date().toISOString();
      const localFileUri = persistAudioQcRecordingFile(sourceUri, draft.localRecordingId);
      const durationSec =
        recorderState.durationMillis > 0
          ? Math.max(1, Math.round(recorderState.durationMillis / 1000))
          : Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(draft.startedAt)) / 1000));
      const finished: AudioQcRecording = {
        ...draft,
        endedAt,
        localFileUri,
        durationSec,
        fileSizeBytes: getAudioQcFileSize(localFileUri),
        status: 'recorded',
        updatedAt: endedAt,
      };

      await upsertAudioQcRecording(finished);
      setCurrentRecordingState(null);
      handleRecordingChanged(finished);
      if (policyRef.current?.uploadImmediately ?? true) {
        void runQueue();
      }
    } catch (error) {
      const message = toErrorMessage(error);
      const failed: AudioQcRecording = {
        ...draft,
        endedAt: new Date().toISOString(),
        status: 'failed_permanent',
        lastError: message,
        updatedAt: new Date().toISOString(),
      };
      await upsertAudioQcRecording(failed);
      setCurrentRecordingState(null);
      setPausedState(false);
      handleRecordingChanged(failed);
      setLastError(message);
      throw error;
    }
  }, [handleRecordingChanged, recorder, recorderState.durationMillis, runQueue, setCurrentRecordingState, setPausedState]);

  const startManualRecording = useCallback(async () => {
    await startRecording();
  }, [startRecording]);

  const pauseRecording = useCallback(async () => {
    if (!currentRecordingRef.current || isPausedRef.current) {
      return;
    }
    recorder.pause();
    setPausedState(true);
  }, [recorder, setPausedState]);

  const resumeRecording = useCallback(async () => {
    if (!currentRecordingRef.current || !isPausedRef.current) {
      return;
    }
    recorder.record();
    setPausedState(false);
  }, [recorder, setPausedState]);

  const retryUpload = useCallback(async () => {
    if (queueProcessingRef.current) {
      return;
    }
    queueProcessingRef.current = true;
    setIsQueueProcessing(true);
    try {
      const result = await retryAudioQcQueueNow({ onRecordingChanged: handleRecordingChanged });
      if (result.lastError) {
        setLastError(result.lastError);
      } else {
        setLastError(null);
      }
      await refreshRecordings();
    } finally {
      queueProcessingRef.current = false;
      setIsQueueProcessing(false);
    }
  }, [handleRecordingChanged, refreshRecordings]);

  const refreshPolicy = useCallback(async () => {
    if (session.user.role !== 'store_tablet' && session.user.role !== 'manager') {
      return;
    }
    if (!session.user.shopId) {
      setPolicy(null);
      return;
    }
    setIsPolicyLoading(true);
    try {
      const nextPolicy = await audioQcApi.getTabletPolicy(session.token);
      setPolicy(normalizeAudioQcPolicy(nextPolicy));
    } catch (error) {
      const message = toErrorMessage(error);
      setLastError(message);
    } finally {
      setIsPolicyLoading(false);
    }
  }, [session.token, session.user.role, session.user.shopId]);

  const refreshPolicies = useCallback(async () => {
    if (session.user.role !== 'manager') {
      return;
    }
    setIsPolicyLoading(true);
    try {
      const nextPolicies = await audioQcApi.listPolicies(session.token);
      setPolicies(
        nextPolicies.map((item) => ({
          ...normalizeAudioQcPolicy(item),
          heartbeat: item.heartbeat,
        })),
      );
    } catch (error) {
      setLastError(toErrorMessage(error));
    } finally {
      setIsPolicyLoading(false);
    }
  }, [session.token, session.user.role]);

  const savePolicy = useCallback(
    async (shopId: string, patch: Partial<AudioQcPolicy>) => {
      setIsPolicySaving(true);
      try {
        const saved = await audioQcApi.upsertPolicy(session.token, shopId, patch);
        const normalized = {
          ...normalizeAudioQcPolicy(saved),
          heartbeat: saved.heartbeat,
        };
        setPolicies((current) => [
          normalized,
          ...current.filter((item) => item.shopId !== normalized.shopId),
        ]);
        if (policyRef.current?.shopId === normalized.shopId) {
          setPolicy(normalized);
        }
        setLastError(null);
        return normalized;
      } finally {
        setIsPolicySaving(false);
      }
    },
    [session.token],
  );

  useEffect(() => {
    void ensureDeviceId();
    void refreshRecordings();
  }, [ensureDeviceId, refreshRecordings]);

  useEffect(() => {
    if (session.user.role !== 'store_tablet') {
      return undefined;
    }
    void refreshPolicy();
    const interval = setInterval(() => {
      void refreshPolicy();
    }, POLICY_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshPolicy, session.user.role]);

  useEffect(() => {
    const interval = setInterval(() => {
      void runQueue();
    }, QUEUE_POLL_MS);
    return () => clearInterval(interval);
  }, [runQueue]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runQueue();
        if (session.user.role === 'store_tablet') {
          void refreshPolicy();
        }
      }
    });
    return () => subscription.remove();
  }, [refreshPolicy, runQueue, session.user.role]);

  useEffect(() => {
    const sendHeartbeat = async () => {
      const nextDeviceId = await ensureDeviceId();
      const currentPolicy = policyRef.current;
      const shopId = session.user.shopId ?? currentPolicy?.shopId;
      if (session.user.role !== 'store_tablet' || !shopId) {
        return;
      }
      await audioQcApi.sendHeartbeat(session.token, {
        deviceId: nextDeviceId,
        shopId,
        appVersion: getAppVersion(),
        currentMode: currentRecordingRef.current?.recordingMode ?? currentPolicy?.mode ?? null,
        queueSize: queueSummaryRef.current.queueSize,
        isRecording: Boolean(currentRecordingRef.current) && !isPausedRef.current,
        lastError: lastRecorderError ?? queueSummaryRef.current.lastError,
        lastUploadAt: queueSummaryRef.current.lastUploadAt,
      });
    };

    if (session.user.role !== 'store_tablet') {
      return undefined;
    }
    void sendHeartbeat().catch((error) => setLastError(toErrorMessage(error)));
    const interval = setInterval(() => {
      void sendHeartbeat().catch((error) => setLastError(toErrorMessage(error)));
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [ensureDeviceId, lastRecorderError, session.token, session.user.role, session.user.shopId]);

  const activityStatus: AudioQcActivityStatus = useMemo(() => {
    if (currentRecording && isPaused) return 'paused';
    if (currentRecording) return 'recording';
    if (isQueueProcessing) return 'uploading';
    if (lastError || lastRecorderError || queueSummary.lastError) return 'error';
    if (queueSummary.queueSize > 0) return 'queued';
    return 'idle';
  }, [currentRecording, isPaused, isQueueProcessing, lastError, lastRecorderError, queueSummary]);

  return {
    session,
    deviceId,
    policy,
    policies,
    recordings,
    queueSummary,
    currentRecording,
    activityStatus,
    isRecording: Boolean(currentRecording) || recorderState.isRecording,
    isPaused,
    isQueueProcessing,
    isPolicyLoading,
    isPolicySaving,
    elapsedSec: currentRecording ? Math.max(0, Math.round(recorderState.durationMillis / 1000)) : 0,
    lastError: lastError ?? lastRecorderError ?? queueSummary.lastError,
    startManualRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    retryUpload,
    refreshPolicy,
    refreshPolicies,
    savePolicy,
  };
};
