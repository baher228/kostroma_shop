import { EventSubscription, requireOptionalNativeModule } from 'expo-modules-core';

export type AudioQcVadConfig = {
  sampleRate: 16000;
  channels: 1;
  preRollSec: number;
  speechStartThresholdMs: number;
  silenceToStopSec: number;
  minSegmentDurationSec: number;
  maxSegmentDurationSec: number;
  uploadImmediately: boolean;
  shopId: string;
  sellerId: string | null;
  shiftId: string | null;
  deviceId: string;
  appVersion: string;
  timezone: string;
};

export type AudioQcVadNativeState =
  | 'inactive'
  | 'loading_model'
  | 'idle'
  | 'possible_speech'
  | 'recording'
  | 'possible_end'
  | 'finalizing'
  | 'error';

export type AudioQcVadStatus = {
  available: boolean;
  active: boolean;
  modelLoaded: boolean;
  state: AudioQcVadNativeState;
  currentSegmentDurationSec: number;
  lastSegmentAt: string | null;
  lastError: string | null;
};

export type AudioQcVadSegment = {
  localRecordingId: string;
  fileUri: string;
  shopId: string;
  sellerId: string | null;
  shiftId: string | null;
  deviceId: string;
  appVersion: string;
  timezone: string;
  uploadImmediately: boolean;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  fileSizeBytes: number;
  preRollSec: number;
  silenceToStopSec: number;
  speechStartThresholdMs: number;
  maxSegmentDurationSec: number;
  speechRatio: number;
  vadEngine: 'sherpa-onnx-silero';
};

type AudioQcVadNativeModule = {
  startVad(config: AudioQcVadConfig): Promise<void>;
  stopVad(): Promise<void>;
  getVadStatus(): Promise<AudioQcVadStatus>;
  getPendingSegments(): Promise<AudioQcVadSegment[]>;
  acknowledgeSegment(localRecordingId: string): Promise<void>;
  addListener(
    eventName: 'AudioQcVadSegmentFinalized',
    listener: (event: AudioQcVadSegment) => void,
  ): EventSubscription;
  addListener(
    eventName: 'AudioQcVadStateChanged',
    listener: (event: AudioQcVadStatus) => void,
  ): EventSubscription;
  addListener(
    eventName: 'AudioQcVadError',
    listener: (event: { message: string }) => void,
  ): EventSubscription;
};

const nativeModule = requireOptionalNativeModule<AudioQcVadNativeModule>('AudioQcVad');

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const unavailableStatus: AudioQcVadStatus = {
  available: false,
  active: false,
  modelLoaded: false,
  state: 'inactive',
  currentSegmentDurationSec: 0,
  lastSegmentAt: null,
  lastError: null,
};

export const audioQcVad = {
  available: Boolean(nativeModule),
  startVad: async (config: AudioQcVadConfig): Promise<void> => {
    if (!nativeModule) throw new Error('AudioQcVad native module is unavailable. Install a new Android build.');
    await nativeModule.startVad(config);
  },
  stopVad: async (): Promise<void> => {
    if (!nativeModule) return;
    await nativeModule.stopVad();
    // Android stops a Service asynchronously. Wait for AudioRecord to be released
    // before expo-audio can take the microphone for a manual recording.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await nativeModule.getVadStatus();
      if (!status.active) return;
      await wait(100);
    }
    throw new Error('AudioQcVad service did not stop within 3 seconds.');
  },
  getVadStatus: async (): Promise<AudioQcVadStatus> => nativeModule?.getVadStatus() ?? unavailableStatus,
  getPendingSegments: async (): Promise<AudioQcVadSegment[]> => nativeModule?.getPendingSegments() ?? [],
  acknowledgeSegment: async (localRecordingId: string): Promise<void> => {
    await nativeModule?.acknowledgeSegment(localRecordingId);
  },
  addSegmentListener: (listener: (event: AudioQcVadSegment) => void): EventSubscription | null =>
    nativeModule?.addListener('AudioQcVadSegmentFinalized', listener) ?? null,
  addStateListener: (listener: (event: AudioQcVadStatus) => void): EventSubscription | null =>
    nativeModule?.addListener('AudioQcVadStateChanged', listener) ?? null,
  addErrorListener: (listener: (event: { message: string }) => void): EventSubscription | null =>
    nativeModule?.addListener('AudioQcVadError', listener) ?? null,
};
