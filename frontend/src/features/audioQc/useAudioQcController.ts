import Constants from 'expo-constants';
import { audioQcVad, AudioQcVadConfig, AudioQcVadSegment } from 'audio-qc-vad';
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
import { AppState, PermissionsAndroid, Platform } from 'react-native';
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
  AudioQcVadStatus,
} from './audioQcTypes';
import { Session } from '../../types/models';

const POLICY_POLL_MS = 45_000;
const HEARTBEAT_MS = 30_000;
const QUEUE_POLL_MS = 20_000;
const SPEECH_START_THRESHOLD_MS = 700;
const MIN_VAD_SEGMENT_DURATION_SEC = 5;

const INITIAL_VAD_STATUS: AudioQcVadStatus = {
  available: Platform.OS === 'android' && audioQcVad.available,
  active: false,
  modelLoaded: false,
  state: 'inactive',
  currentSegmentDurationSec: 0,
  lastSegmentAt: null,
  lastError: null,
};

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
  const [vadStatus, setVadStatus] = useState<AudioQcVadStatus>(INITIAL_VAD_STATUS);

  const currentRecordingRef = useRef<AudioQcRecording | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const queueSummaryRef = useRef(queueSummary);
  const policyRef = useRef<AudioQcPolicy | null>(policy);
  const queueProcessingRef = useRef(false);
  const isPausedRef = useRef(false);
  const vadStatusRef = useRef(vadStatus);
  const appStateRef = useRef(AppState.currentState);
  const vadOperationRef = useRef(false);
  const vadConfigKeyRef = useRef<string | null>(null);
  const vadHandoffRef = useRef(Promise.resolve());

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    queueSummaryRef.current = queueSummary;
  }, [queueSummary]);

  useEffect(() => {
    policyRef.current = policy;
  }, [policy]);

  useEffect(() => {
    vadStatusRef.current = vadStatus;
  }, [vadStatus]);

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

  const ingestVadSegment = useCallback(
    async (segment: AudioQcVadSegment) => {
      try {
        const existing = (await listAudioQcRecordings()).find(
          (recording) => recording.localRecordingId === segment.localRecordingId,
        );
        if (existing) {
          await audioQcVad.acknowledgeSegment(segment.localRecordingId);
          return;
        }

        const recording: AudioQcRecording = {
          localRecordingId: segment.localRecordingId,
          mlSessionId: null,
          jobId: null,
          shopId: segment.shopId,
          sellerId: segment.sellerId,
          shiftId: segment.shiftId,
          deviceId: segment.deviceId,
          startedAt: segment.startedAt,
          endedAt: segment.endedAt,
          appVersion: segment.appVersion,
          timezone: segment.timezone,
          recordingMode: 'vad_auto',
          localFileUri: segment.fileUri,
          durationSec: Math.max(1, Math.round(segment.durationSec)),
          fileSizeBytes: segment.fileSizeBytes,
          vad: {
            preRollSec: segment.preRollSec,
            silenceToStopSec: segment.silenceToStopSec,
            speechStartThresholdMs: segment.speechStartThresholdMs,
            maxSegmentDurationSec: segment.maxSegmentDurationSec,
            vadEngine: segment.vadEngine,
            speechRatio: segment.speechRatio,
          },
          status: 'recorded',
          attemptCount: 0,
          nextRetryAt: null,
          lastError: null,
          createdAt: segment.startedAt,
          updatedAt: segment.endedAt,
        };
        await upsertAudioQcRecording(recording);
        handleRecordingChanged(recording);
        await audioQcVad.acknowledgeSegment(segment.localRecordingId);
        console.info('[AudioQc] VAD queue handoff', segment.localRecordingId, segment.fileUri);
        if (segment.uploadImmediately) void runQueue();
      } catch (error) {
        const message = toErrorMessage(error);
        setLastError(message);
        console.error('[AudioQc] VAD queue handoff failed', message);
      }
    },
    [handleRecordingChanged, runQueue],
  );

  const enqueueVadSegmentHandoff = useCallback(
    (segment: AudioQcVadSegment) => {
      vadHandoffRef.current = vadHandoffRef.current.then(() => ingestVadSegment(segment));
    },
    [ingestVadSegment],
  );

  const ensureRecordingPermission = useCallback(async (): Promise<void> => {
    const currentPermission = await getRecordingPermissionsAsync();
    if (!currentPermission.granted) {
      const requestedPermission = await requestRecordingPermissionsAsync();
      if (!requestedPermission.granted) {
        throw new Error('Нет разрешения на микрофон.');
      }
    }
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
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

      await audioQcVad.stopVad();
      vadConfigKeyRef.current = null;

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
    if (policyRef.current?.enabled && policyRef.current.mode === 'vad_auto') {
      throw new Error('Сначала переключите Audio QC в ручной режим. VAD использует микрофон автоматически.');
    }
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

  const stopVadService = useCallback(async () => {
    if (!audioQcVad.available) return;
    await audioQcVad.stopVad();
    vadConfigKeyRef.current = null;
    const nextStatus = await audioQcVad.getVadStatus();
    setVadStatus(nextStatus);
  }, []);

  const startVadForPolicy = useCallback(
    async (nextPolicy: AudioQcPolicy) => {
      if (vadOperationRef.current || session.user.role !== 'store_tablet' || appStateRef.current !== 'active') return;
      if (!nextPolicy.enabled || nextPolicy.mode !== 'vad_auto') return;
      if (currentRecordingRef.current || recorder.getStatus().isRecording) return;
      if (!audioQcVad.available || Platform.OS !== 'android') {
        setVadStatus({ ...INITIAL_VAD_STATUS, lastError: 'Для VAD требуется новый Android APK с native module.' });
        return;
      }

      const nextDeviceId = await ensureDeviceId();
      const config: AudioQcVadConfig = {
        sampleRate: 16000,
        channels: 1,
        preRollSec: nextPolicy.preRollSec,
        speechStartThresholdMs: SPEECH_START_THRESHOLD_MS,
        silenceToStopSec: nextPolicy.silenceToStopSec,
        minSegmentDurationSec: MIN_VAD_SEGMENT_DURATION_SEC,
        maxSegmentDurationSec: nextPolicy.maxSegmentDurationSec,
        uploadImmediately: nextPolicy.uploadImmediately,
        shopId: nextPolicy.shopId,
        sellerId: null,
        shiftId: null,
        deviceId: nextDeviceId,
        appVersion: getAppVersion(),
        timezone: getTimezone(),
      };
      const configKey = JSON.stringify(config);
      if (vadStatusRef.current.active && vadConfigKeyRef.current === configKey) return;

      vadOperationRef.current = true;
      try {
        await ensureRecordingPermission();
        await requestNotificationPermission();
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
          interruptionMode: 'doNotMix',
        });
        await audioQcVad.startVad(config);
        vadConfigKeyRef.current = configKey;
        setVadStatus((current) => ({
          ...current,
          available: true,
          active: true,
          state: 'loading_model',
          lastError: null,
        }));
      } catch (error) {
        const message = toErrorMessage(error);
        setVadStatus((current) => ({ ...current, active: false, state: 'error', lastError: message }));
        setLastError(message);
      } finally {
        vadOperationRef.current = false;
      }
    },
    [ensureDeviceId, ensureRecordingPermission, recorder, requestNotificationPermission, session.user.role],
  );

  useEffect(() => {
    void ensureDeviceId();
    void refreshRecordings();
  }, [ensureDeviceId, refreshRecordings]);

  useEffect(() => {
    if (session.user.role !== 'store_tablet') return undefined;
    const stateSubscription = audioQcVad.addStateListener((status) => {
      setVadStatus(status);
    });
    const errorSubscription = audioQcVad.addErrorListener(({ message }) => {
      setVadStatus((current) => ({ ...current, active: false, state: 'error', lastError: message }));
      setLastError(message);
    });
    const segmentSubscription = audioQcVad.addSegmentListener(enqueueVadSegmentHandoff);

    void audioQcVad.getVadStatus().then(setVadStatus).catch((error) => setLastError(toErrorMessage(error)));
    void audioQcVad
      .getPendingSegments()
      .then((segments) => segments.forEach(enqueueVadSegmentHandoff))
      .catch((error) => setLastError(toErrorMessage(error)));

    return () => {
      stateSubscription?.remove();
      errorSubscription?.remove();
      segmentSubscription?.remove();
      void audioQcVad.stopVad().catch((error) =>
        console.warn('[AudioQc] Unable to stop VAD during controller cleanup', toErrorMessage(error)),
      );
    };
  }, [enqueueVadSegmentHandoff, session.user.role]);

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
    if (session.user.role !== 'store_tablet') return;
    const currentPolicy = policy;
    const shouldRun =
      appStateRef.current === 'active' &&
      currentPolicy?.enabled === true &&
      currentPolicy.mode === 'vad_auto' &&
      !currentRecording;
    if (shouldRun && currentPolicy) {
      void startVadForPolicy(currentPolicy);
    } else if (vadStatus.active || vadConfigKeyRef.current) {
      void stopVadService().catch((error) => setLastError(toErrorMessage(error)));
    }
  }, [
    currentRecording?.localRecordingId,
    policy?.enabled,
    policy?.maxSegmentDurationSec,
    policy?.mode,
    policy?.preRollSec,
    policy?.shopId,
    policy?.silenceToStopSec,
    policy?.uploadImmediately,
    session.user.role,
    startVadForPolicy,
    stopVadService,
    vadStatus.active,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
      if (state === 'active') {
        void runQueue();
        if (session.user.role === 'store_tablet') {
          void refreshPolicy();
        }
      } else if (session.user.role === 'store_tablet') {
        void stopVadService().catch((error) => setLastError(toErrorMessage(error)));
      }
    });
    return () => subscription.remove();
  }, [refreshPolicy, runQueue, session.user.role, stopVadService]);

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
        isRecording:
          (Boolean(currentRecordingRef.current) && !isPausedRef.current) ||
          vadStatusRef.current.state === 'recording' ||
          vadStatusRef.current.state === 'possible_end',
        lastError: lastRecorderError ?? vadStatusRef.current.lastError ?? queueSummaryRef.current.lastError,
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
    if (vadStatus.state === 'recording' || vadStatus.state === 'possible_end') return 'recording';
    if (vadStatus.state === 'finalizing') return 'finalizing';
    if (isQueueProcessing) return 'uploading';
    if (lastError || lastRecorderError || vadStatus.lastError || queueSummary.lastError) return 'error';
    if (vadStatus.active) return 'listening';
    if (queueSummary.queueSize > 0) return 'queued';
    return 'idle';
  }, [currentRecording, isPaused, isQueueProcessing, lastError, lastRecorderError, queueSummary, vadStatus]);

  const vadIsWriting = vadStatus.state === 'recording' || vadStatus.state === 'possible_end';

  return {
    session,
    deviceId,
    policy,
    policies,
    recordings,
    queueSummary,
    currentRecording,
    activityStatus,
    isRecording: Boolean(currentRecording) || recorderState.isRecording || vadIsWriting,
    isPaused,
    isQueueProcessing,
    isPolicyLoading,
    isPolicySaving,
    elapsedSec: currentRecording
      ? Math.max(0, Math.round(recorderState.durationMillis / 1000))
      : Math.max(0, Math.round(vadStatus.currentSegmentDurationSec)),
    lastError: lastError ?? lastRecorderError ?? vadStatus.lastError ?? queueSummary.lastError,
    vadStatus,
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
