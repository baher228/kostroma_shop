import {
  AudioQcPolicyPatch,
  AudioQcRecordingInput,
  listAudioQcRecordings,
  upsertAudioQcHeartbeat,
  upsertAudioQcPolicy,
  upsertAudioQcRecording,
} from '../repositories/audioQcRepository';
import {
  getAudioQcPolicyByShopId,
  listAudioQcPolicies,
} from '../repositories/audioQcRepository';
import { AudioQcHeartbeatInput } from '../repositories/audioQcRepository';
import { AudioQcRecordingMode, SessionUser } from '../domain/types';

type AudioQcHeartbeatPayload = {
  deviceId: string;
  shopId?: string;
  appVersion?: string | null;
  currentMode?: AudioQcRecordingMode | null;
  queueSize: number;
  isRecording: boolean;
  lastError?: string | null;
  lastUploadAt?: string | null;
};

export class AudioQcPolicyError extends Error {
  reason: 'shop_required' | 'forbidden';

  constructor(reason: 'shop_required' | 'forbidden') {
    super(reason);
    this.reason = reason;
  }
}

export const getManagedAudioQcPolicies = (user: SessionUser) => {
  if (user.role !== 'manager') {
    throw new AudioQcPolicyError('forbidden');
  }
  return listAudioQcPolicies();
};

export const saveManagedAudioQcPolicy = (user: SessionUser, shopId: string, patch: AudioQcPolicyPatch) => {
  if (user.role !== 'manager') {
    throw new AudioQcPolicyError('forbidden');
  }
  return upsertAudioQcPolicy(shopId, patch, user.id);
};

export const getTabletAudioQcPolicy = (user: SessionUser) => {
  if (user.role !== 'store_tablet' && user.role !== 'manager') {
    throw new AudioQcPolicyError('forbidden');
  }
  if (!user.shopId) {
    throw new AudioQcPolicyError('shop_required');
  }
  return getAudioQcPolicyByShopId(user.shopId);
};

export const recordTabletAudioQcHeartbeat = (
  user: SessionUser,
  input: AudioQcHeartbeatPayload,
) => {
  if (user.role !== 'store_tablet' && user.role !== 'manager') {
    throw new AudioQcPolicyError('forbidden');
  }
  const shopId = user.shopId ?? input.shopId;
  if (!shopId) {
    throw new AudioQcPolicyError('shop_required');
  }
  return upsertAudioQcHeartbeat({
    deviceId: input.deviceId,
    shopId,
    userId: user.id,
    appVersion: input.appVersion ?? null,
    currentMode: input.currentMode ?? null,
    queueSize: input.queueSize,
    isRecording: input.isRecording,
    lastError: input.lastError ?? null,
    lastUploadAt: input.lastUploadAt ?? null,
  });
};

export const recordTabletAudioQcRecording = (user: SessionUser, input: AudioQcRecordingInput) => {
  if (user.role !== 'store_tablet') {
    throw new AudioQcPolicyError('forbidden');
  }
  if (!user.shopId || user.shopId !== input.shopId) {
    throw new AudioQcPolicyError('shop_required');
  }
  return upsertAudioQcRecording(input);
};

export const getManagedAudioQcRecordings = (
  user: SessionUser,
  shopId: string | undefined,
  limit: number,
) => {
  if (user.role !== 'manager') {
    throw new AudioQcPolicyError('forbidden');
  }
  return listAudioQcRecordings(shopId, limit);
};
