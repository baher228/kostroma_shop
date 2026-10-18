ALTER TABLE audio_qc_policies ALTER COLUMN silence_to_stop_sec SET DEFAULT 10;
-- Upgrade the old default; keep deliberately configured other thresholds.
UPDATE audio_qc_policies SET silence_to_stop_sec=10, updated_at=NOW()
WHERE silence_to_stop_sec=3;

CREATE INDEX IF NOT EXISTS qc_sessions_context_idx
ON qc_sessions(shop_id,created_by,started_at,id);

CREATE INDEX IF NOT EXISTS audio_qc_recordings_device_idx
ON audio_qc_recordings(device_id,shop_id,local_recording_id);
