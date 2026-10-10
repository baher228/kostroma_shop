CREATE TABLE IF NOT EXISTS audio_qc_recordings (
  local_recording_id TEXT PRIMARY KEY,
  ml_session_id TEXT NULL,
  job_id TEXT NULL,
  shop_id TEXT NOT NULL,
  seller_id TEXT NULL,
  shift_id TEXT NULL,
  device_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  app_version TEXT NOT NULL,
  timezone TEXT NOT NULL,
  recording_mode TEXT NOT NULL,
  duration_sec INTEGER NULL,
  file_size_bytes BIGINT NULL,
  status TEXT NOT NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audio_qc_recordings_mode_check CHECK (recording_mode IN ('manual', 'vad_auto')),
  CONSTRAINT audio_qc_recordings_duration_check CHECK (duration_sec IS NULL OR duration_sec >= 0),
  CONSTRAINT audio_qc_recordings_size_check CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  CONSTRAINT audio_qc_recordings_status_check CHECK (status IN (
    'recording',
    'recorded',
    'waiting_network',
    'creating_ml_session',
    'uploading_audio',
    'audio_uploaded',
    'starting_processing',
    'processing_started',
    'completed',
    'failed_retryable',
    'failed_permanent'
  ))
);

CREATE INDEX IF NOT EXISTS audio_qc_recordings_shop_started_idx
  ON audio_qc_recordings (shop_id, started_at DESC);

CREATE INDEX IF NOT EXISTS audio_qc_recordings_started_idx
  ON audio_qc_recordings (started_at DESC);
