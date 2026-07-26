const assert = require('node:assert/strict');
const test = require('node:test');

const installDbMock = (handler) => {
  const personalDbPath = require.resolve('../dist/db/personalDb');
  require.cache[personalDbPath] = {
    id: personalDbPath,
    filename: personalDbPath,
    loaded: true,
    exports: {
      personalDb: {
        query: handler,
      },
    },
  };
  delete require.cache[require.resolve('../dist/repositories/audioQcRepository')];
  return require('../dist/repositories/audioQcRepository');
};

test('Audio QC default tablet policy is disabled and bounded', async () => {
  const { defaultAudioQcPolicy } = installDbMock(async () => ({ rows: [] }));

  const policy = defaultAudioQcPolicy('shop_main');

  assert.equal(policy.shopId, 'shop_main');
  assert.equal(policy.enabled, false);
  assert.equal(policy.mode, 'manual');
  assert.equal(policy.targetRole, 'store_tablet');
  assert.equal(policy.maxSegmentDurationSec, 300);
  assert.equal(policy.silenceToStopSec, 3);
  assert.equal(policy.preRollSec, 5);
});

test('Audio QC policy upsert stores manager command in RU backend', async () => {
  const calls = [];
  const { upsertAudioQcPolicy } = installDbMock(async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO audio_qc_policies')) return { rows: [] };
    if (sql.includes('FROM audio_qc_policies')) {
      return {
        rows: [{
          shop_id: 'shop_main',
          enabled: true,
          mode: 'vad_auto',
          max_segment_duration_sec: 300,
          silence_to_stop_sec: 3,
          pre_roll_sec: 5,
          upload_immediately: true,
          updated_at: '2026-07-23T12:00:00.000Z',
        }],
      };
    }
    if (sql.includes('FROM audio_qc_device_heartbeats')) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const policy = await upsertAudioQcPolicy(
    'shop_main',
    {
      enabled: true,
      mode: 'vad_auto',
      maxSegmentDurationSec: 300,
      silenceToStopSec: 3,
      preRollSec: 5,
      uploadImmediately: true,
    },
    'manager_1',
  );

  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, 'vad_auto');
  assert.equal(policy.heartbeat, null);
  assert.equal(calls[0].sql.includes('ON CONFLICT (shop_id)'), true);
  assert.equal(calls[0].params[1], 'shop_main');
  assert.equal(calls[0].params[8], 'manager_1');
});

test('Audio QC heartbeat is upserted by device id', async () => {
  const { upsertAudioQcHeartbeat } = installDbMock(async (sql, params = []) => {
    assert.equal(sql.includes('ON CONFLICT (device_id)'), true);
    assert.equal(params[1], 'tablet_device_1');
    assert.equal(params[2], 'shop_main');
    return {
      rows: [{
        device_id: 'tablet_device_1',
        shop_id: 'shop_main',
        user_id: 'tablet_1',
        app_version: '1.0.0',
        current_mode: 'admin_remote',
        queue_size: 2,
        is_recording: true,
        last_error: null,
        last_upload_at: '2026-07-23T12:01:00.000Z',
        last_seen_at: new Date().toISOString(),
      }],
    };
  });

  const heartbeat = await upsertAudioQcHeartbeat({
    deviceId: 'tablet_device_1',
    shopId: 'shop_main',
    userId: 'tablet_1',
    appVersion: '1.0.0',
    currentMode: 'admin_remote',
    queueSize: 2,
    isRecording: true,
    lastError: null,
    lastUploadAt: '2026-07-23T12:01:00.000Z',
  });

  assert.equal(heartbeat.deviceId, 'tablet_device_1');
  assert.equal(heartbeat.queueSize, 2);
  assert.equal(heartbeat.isRecording, true);
  assert.equal(heartbeat.online, true);
});
