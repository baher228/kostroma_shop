-- One-time transition: select VAD everywhere without starting any microphones.
ALTER TABLE audio_qc_policies DROP CONSTRAINT IF EXISTS audio_qc_policies_mode_check;
UPDATE audio_qc_policies SET mode='vad_auto', enabled=FALSE, updated_at=NOW();
ALTER TABLE audio_qc_policies ALTER COLUMN mode SET DEFAULT 'vad_auto';
ALTER TABLE audio_qc_policies ADD CONSTRAINT audio_qc_policies_mode_check CHECK (mode='vad_auto');
INSERT INTO audio_qc_policies (id,shop_id,enabled,mode)
SELECT 'audio_qc_policy_' || shop_id, shop_id, FALSE, 'vad_auto'
FROM (
  SELECT shop_id FROM users WHERE role='store_tablet' AND shop_id IS NOT NULL
  UNION SELECT shop_id FROM audio_qc_device_heartbeats
) shops
ON CONFLICT (shop_id) DO NOTHING;
-- Heartbeats and historical recordings retain the mode actually reported by clients.
