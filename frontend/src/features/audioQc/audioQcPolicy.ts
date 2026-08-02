import { AudioQcPolicy, AudioQcRecordingMode } from './audioQcTypes';

export const AUDIO_QC_DEFAULTS = {
  maxSegmentDurationSec: 300,
  silenceToStopSec: 3,
  preRollSec: 5,
  uploadImmediately: true,
};

export const audioQcModes: AudioQcRecordingMode[] = ['manual'];

export const audioQcModeLabels: Record<AudioQcRecordingMode, string> = {
  manual: 'Ручной',
};

export const createDefaultAudioQcPolicy = (shopId: string): AudioQcPolicy => ({
  enabled: false,
  mode: 'manual',
  shopId,
  targetRole: 'store_tablet',
  maxSegmentDurationSec: AUDIO_QC_DEFAULTS.maxSegmentDurationSec,
  silenceToStopSec: AUDIO_QC_DEFAULTS.silenceToStopSec,
  preRollSec: AUDIO_QC_DEFAULTS.preRollSec,
  uploadImmediately: AUDIO_QC_DEFAULTS.uploadImmediately,
  updatedAt: new Date(0).toISOString(),
});

export const normalizeAudioQcPolicy = (policy: Partial<AudioQcPolicy> & { shopId: string }): AudioQcPolicy => ({
  ...createDefaultAudioQcPolicy(policy.shopId),
  ...policy,
  enabled: Boolean(policy.enabled),
  mode: 'manual',
  targetRole: 'store_tablet',
  maxSegmentDurationSec: Math.max(30, Math.min(1800, Number(policy.maxSegmentDurationSec ?? AUDIO_QC_DEFAULTS.maxSegmentDurationSec))),
  silenceToStopSec: Math.max(1, Math.min(30, Number(policy.silenceToStopSec ?? AUDIO_QC_DEFAULTS.silenceToStopSec))),
  preRollSec: Math.max(0, Math.min(30, Number(policy.preRollSec ?? AUDIO_QC_DEFAULTS.preRollSec))),
  uploadImmediately: policy.uploadImmediately ?? AUDIO_QC_DEFAULTS.uploadImmediately,
  updatedAt: policy.updatedAt ?? new Date(0).toISOString(),
});
