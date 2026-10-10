ALTER TABLE audio_qc_policies
  DROP CONSTRAINT IF EXISTS audio_qc_policies_mode_check;

ALTER TABLE audio_qc_policies
  ADD CONSTRAINT audio_qc_policies_mode_check
  CHECK (mode IN ('manual', 'vad_auto'));

ALTER TABLE audio_qc_device_heartbeats
  DROP CONSTRAINT IF EXISTS audio_qc_device_heartbeats_mode_check;

ALTER TABLE audio_qc_device_heartbeats
  ADD CONSTRAINT audio_qc_device_heartbeats_mode_check
  CHECK (current_mode IS NULL OR current_mode IN ('manual', 'vad_auto'));
