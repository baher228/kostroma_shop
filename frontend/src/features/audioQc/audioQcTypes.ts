import { Session, Shop } from '../../types/models';

export type AudioQcRecordingMode = 'manual' | 'vad_auto';

export type AudioQcRecordingStatus =
  | 'recording'
  | 'recorded'
  | 'waiting_network'
  | 'creating_ml_session'
  | 'uploading_audio'
  | 'audio_uploaded'
  | 'starting_processing'
  | 'processing_started'
  | 'completed'
  | 'failed_retryable'
  | 'failed_permanent';

export type AudioQcActivityStatus =
  | 'idle'
  | 'listening'
  | 'recording'
  | 'paused'
  | 'finalizing'
  | 'queued'
  | 'uploading'
  | 'error';

export type AudioQcVadLifecycleState =
  | 'inactive'
  | 'loading_model'
  | 'idle'
  | 'possible_speech'
  | 'recording'
  | 'possible_end'
  | 'finalizing'
  | 'error';

export type AudioQcVadMetadata = {
  preRollSec?: number;
  silenceToStopSec?: number;
  speechStartThresholdMs?: number;
  maxSegmentDurationSec?: number;
  vadEngine?: 'sherpa-onnx-silero';
  speechRatio?: number;
};

export type AudioQcVadStatus = {
  available: boolean;
  active: boolean;
  modelLoaded: boolean;
  state: AudioQcVadLifecycleState;
  currentSegmentDurationSec: number;
  lastSegmentAt: string | null;
  lastError: string | null;
};

export type AudioQcPolicy = {
  enabled: boolean;
  mode: AudioQcRecordingMode;
  shopId: string;
  targetRole: 'store_tablet';
  maxSegmentDurationSec: number;
  silenceToStopSec: number;
  preRollSec: number;
  uploadImmediately: boolean;
  updatedAt: string;
};

export type AudioQcDeviceHeartbeat = {
  deviceId: string;
  shopId: string;
  userId: string | null;
  appVersion: string | null;
  currentMode: AudioQcRecordingMode | null;
  queueSize: number;
  isRecording: boolean;
  lastError: string | null;
  lastUploadAt: string | null;
  lastSeenAt: string;
  online: boolean;
};

export type AudioQcPolicyWithHeartbeat = AudioQcPolicy & {
  heartbeat: AudioQcDeviceHeartbeat | null;
};

export type AudioQcRecording = {
  localRecordingId: string;
  mlSessionId: string | null;
  jobId: string | null;
  shopId: string;
  sellerId: string | null;
  shiftId: string | null;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  appVersion: string;
  timezone: string;
  recordingMode: AudioQcRecordingMode;
  localFileUri: string;
  durationSec: number | null;
  fileSizeBytes: number | null;
  vad?: AudioQcVadMetadata;
  status: AudioQcRecordingStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AudioQcManagedRecording = Omit<
  AudioQcRecording,
  'localFileUri' | 'vad' | 'attemptCount' | 'nextRetryAt'
>;

export type AudioQcQueueSummary = {
  queueSize: number;
  retryableFailures: number;
  permanentFailures: number;
  lastError: string | null;
  lastUploadAt: string | null;
};

export type AudioQcHeartbeatPayload = {
  deviceId: string;
  shopId: string;
  appVersion: string;
  currentMode: AudioQcRecordingMode | null;
  queueSize: number;
  isRecording: boolean;
  lastError: string | null;
  lastUploadAt: string | null;
};

export type AudioQcControllerValue = {
  session: Session;
  deviceId: string | null;
  policy: AudioQcPolicy | null;
  policies: AudioQcPolicyWithHeartbeat[];
  recordings: AudioQcRecording[];
  managedRecordings: AudioQcManagedRecording[];
  queueSummary: AudioQcQueueSummary;
  currentRecording: AudioQcRecording | null;
  activityStatus: AudioQcActivityStatus;
  isRecording: boolean;
  isPaused: boolean;
  isQueueProcessing: boolean;
  isPolicyLoading: boolean;
  isPolicySaving: boolean;
  isManagedRecordingsLoading: boolean;
  elapsedSec: number;
  lastError: string | null;
  vadStatus: AudioQcVadStatus;
  startManualRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  retryUpload: () => Promise<void>;
  refreshPolicy: () => Promise<void>;
  refreshPolicies: () => Promise<void>;
  refreshManagedRecordings: (shopId?: string) => Promise<void>;
  savePolicy: (shopId: string, patch: Partial<AudioQcPolicy>) => Promise<AudioQcPolicyWithHeartbeat>;
};

export type AudioQcAdminPanelProps = {
  shops: Shop[];
  selectedShopId: string | null;
};
