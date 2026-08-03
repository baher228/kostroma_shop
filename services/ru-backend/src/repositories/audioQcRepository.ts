import { personalDb } from '../db/personalDb';
import {
  AudioQcDeviceHeartbeat,
  AudioQcPolicy,
  AudioQcPolicyWithHeartbeat,
  AudioQcRecordingMode,
} from '../domain/types';

const HEARTBEAT_ONLINE_WINDOW_MS = 90_000;

type AudioQcPolicyRow = {
  shop_id: string;
  enabled: boolean;
  mode: string;
  max_segment_duration_sec: number;
  silence_to_stop_sec: number;
  pre_roll_sec: number;
  upload_immediately: boolean;
  updated_at: Date | string;
};

type AudioQcHeartbeatRow = {
  device_id: string;
  shop_id: string;
  user_id: string | null;
  app_version: string | null;
  current_mode: string | null;
  queue_size: number;
  is_recording: boolean;
  last_error: string | null;
  last_upload_at: Date | string | null;
  last_seen_at: Date | string;
};

export type AudioQcPolicyPatch = {
  enabled: boolean;
  mode: AudioQcRecordingMode;
  maxSegmentDurationSec: number;
  silenceToStopSec: number;
  preRollSec: number;
  uploadImmediately: boolean;
};

export type AudioQcHeartbeatInput = {
  deviceId: string;
  shopId: string;
  userId: string | null;
  appVersion: string | null;
  currentMode: AudioQcRecordingMode | null;
  queueSize: number;
  isRecording: boolean;
  lastError: string | null;
  lastUploadAt: string | null;
};

const createPolicyId = (shopId: string): string =>
  `audio_qc_policy_${shopId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const createHeartbeatId = (deviceId: string): string =>
  `audio_qc_hb_${deviceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const supportedModeOrNull = (mode: string | null): AudioQcRecordingMode | null =>
  mode === 'manual' || mode === 'vad_auto' ? mode : null;

export const defaultAudioQcPolicy = (shopId: string): AudioQcPolicy => ({
  enabled: false,
  mode: 'manual',
  shopId,
  targetRole: 'store_tablet',
  maxSegmentDurationSec: 300,
  silenceToStopSec: 3,
  preRollSec: 5,
  uploadImmediately: true,
  updatedAt: new Date(0).toISOString(),
});

const mapPolicy = (row: AudioQcPolicyRow): AudioQcPolicy => ({
  enabled: row.enabled,
  mode: supportedModeOrNull(row.mode) ?? 'manual',
  shopId: row.shop_id,
  targetRole: 'store_tablet',
  maxSegmentDurationSec: row.max_segment_duration_sec,
  silenceToStopSec: row.silence_to_stop_sec,
  preRollSec: row.pre_roll_sec,
  uploadImmediately: row.upload_immediately,
  updatedAt: new Date(row.updated_at).toISOString(),
});

const mapHeartbeat = (row: AudioQcHeartbeatRow): AudioQcDeviceHeartbeat => {
  const lastSeenAt = new Date(row.last_seen_at);
  return {
    deviceId: row.device_id,
    shopId: row.shop_id,
    userId: row.user_id,
    appVersion: row.app_version,
    currentMode: supportedModeOrNull(row.current_mode),
    queueSize: row.queue_size,
    isRecording: row.is_recording,
    lastError: row.last_error,
    lastUploadAt: row.last_upload_at ? new Date(row.last_upload_at).toISOString() : null,
    lastSeenAt: lastSeenAt.toISOString(),
    online: Date.now() - lastSeenAt.getTime() <= HEARTBEAT_ONLINE_WINDOW_MS,
  };
};

const listLatestHeartbeats = async (): Promise<Map<string, AudioQcDeviceHeartbeat>> => {
  const result = await personalDb.query<AudioQcHeartbeatRow>(
    `
      SELECT DISTINCT ON (shop_id)
        device_id,
        shop_id,
        user_id,
        app_version,
        current_mode,
        queue_size,
        is_recording,
        last_error,
        last_upload_at,
        last_seen_at
      FROM audio_qc_device_heartbeats
      ORDER BY shop_id, last_seen_at DESC;
    `,
  );
  return new Map(result.rows.map((row: AudioQcHeartbeatRow) => [row.shop_id, mapHeartbeat(row)]));
};

export const listAudioQcPolicies = async (): Promise<AudioQcPolicyWithHeartbeat[]> => {
  const [policyResult, heartbeats] = await Promise.all([
    personalDb.query<AudioQcPolicyRow>(
      `
        SELECT
          shop_id,
          enabled,
          mode,
          max_segment_duration_sec,
          silence_to_stop_sec,
          pre_roll_sec,
          upload_immediately,
          updated_at
        FROM audio_qc_policies
        ORDER BY shop_id ASC;
      `,
    ),
    listLatestHeartbeats(),
  ]);
  return policyResult.rows.map((row: AudioQcPolicyRow) => {
    const policy = mapPolicy(row);
    return { ...policy, heartbeat: heartbeats.get(policy.shopId) ?? null };
  });
};

export const getAudioQcPolicyByShopId = async (shopId: string): Promise<AudioQcPolicy> => {
  const result = await personalDb.query<AudioQcPolicyRow>(
    `
      SELECT
        shop_id,
        enabled,
        mode,
        max_segment_duration_sec,
        silence_to_stop_sec,
        pre_roll_sec,
        upload_immediately,
        updated_at
      FROM audio_qc_policies
      WHERE shop_id = $1
      LIMIT 1;
    `,
    [shopId],
  );
  return result.rows[0] ? mapPolicy(result.rows[0]) : defaultAudioQcPolicy(shopId);
};

export const getAudioQcPolicyWithHeartbeatByShopId = async (shopId: string): Promise<AudioQcPolicyWithHeartbeat> => {
  const policy = await getAudioQcPolicyByShopId(shopId);
  const heartbeatResult = await personalDb.query<AudioQcHeartbeatRow>(
    `
      SELECT
        device_id,
        shop_id,
        user_id,
        app_version,
        current_mode,
        queue_size,
        is_recording,
        last_error,
        last_upload_at,
        last_seen_at
      FROM audio_qc_device_heartbeats
      WHERE shop_id = $1
      ORDER BY last_seen_at DESC
      LIMIT 1;
    `,
    [shopId],
  );
  return {
    ...policy,
    heartbeat: heartbeatResult.rows[0] ? mapHeartbeat(heartbeatResult.rows[0]) : null,
  };
};

export const upsertAudioQcPolicy = async (
  shopId: string,
  patch: AudioQcPolicyPatch,
  updatedBy: string,
): Promise<AudioQcPolicyWithHeartbeat> => {
  await personalDb.query(
    `
      INSERT INTO audio_qc_policies (
        id,
        shop_id,
        enabled,
        mode,
        max_segment_duration_sec,
        silence_to_stop_sec,
        pre_roll_sec,
        upload_immediately,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (shop_id)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        mode = EXCLUDED.mode,
        max_segment_duration_sec = EXCLUDED.max_segment_duration_sec,
        silence_to_stop_sec = EXCLUDED.silence_to_stop_sec,
        pre_roll_sec = EXCLUDED.pre_roll_sec,
        upload_immediately = EXCLUDED.upload_immediately,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW();
    `,
    [
      createPolicyId(shopId),
      shopId,
      patch.enabled,
      patch.mode,
      patch.maxSegmentDurationSec,
      patch.silenceToStopSec,
      patch.preRollSec,
      patch.uploadImmediately,
      updatedBy,
    ],
  );
  return getAudioQcPolicyWithHeartbeatByShopId(shopId);
};

export const upsertAudioQcHeartbeat = async (heartbeat: AudioQcHeartbeatInput): Promise<AudioQcDeviceHeartbeat> => {
  const result = await personalDb.query<AudioQcHeartbeatRow>(
    `
      INSERT INTO audio_qc_device_heartbeats (
        id,
        device_id,
        shop_id,
        user_id,
        app_version,
        current_mode,
        queue_size,
        is_recording,
        last_error,
        last_upload_at,
        last_seen_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, NOW(), NOW(), NOW())
      ON CONFLICT (device_id)
      DO UPDATE SET
        shop_id = EXCLUDED.shop_id,
        user_id = EXCLUDED.user_id,
        app_version = EXCLUDED.app_version,
        current_mode = EXCLUDED.current_mode,
        queue_size = EXCLUDED.queue_size,
        is_recording = EXCLUDED.is_recording,
        last_error = EXCLUDED.last_error,
        last_upload_at = EXCLUDED.last_upload_at,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING
        device_id,
        shop_id,
        user_id,
        app_version,
        current_mode,
        queue_size,
        is_recording,
        last_error,
        last_upload_at,
        last_seen_at;
    `,
    [
      createHeartbeatId(heartbeat.deviceId),
      heartbeat.deviceId,
      heartbeat.shopId,
      heartbeat.userId,
      heartbeat.appVersion,
      heartbeat.currentMode,
      heartbeat.queueSize,
      heartbeat.isRecording,
      heartbeat.lastError,
      heartbeat.lastUploadAt,
    ],
  );
  return mapHeartbeat(result.rows[0]);
};
