ALTER TABLE qc_media
  ADD COLUMN retention_class TEXT NOT NULL DEFAULT 'standard'
    CHECK (retention_class IN ('standard','bad','interesting','pinned')),
  ADD COLUMN retention_reason TEXT NOT NULL DEFAULT 'Default retention before analysis.',
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN pinned_at TIMESTAMPTZ,
  ADD COLUMN pinned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN delete_claim_token TEXT,
  ADD COLUMN delete_claimed_at TIMESTAMPTZ;

-- The normalized transcript and segments are canonical. Keeping the complete
-- provider payload duplicates text and may retain unnecessary provider data.
UPDATE qc_transcripts SET raw_result = NULL WHERE raw_result IS NOT NULL;

-- Existing recordings get a fresh grace period when this migration is deployed.
-- Runtime configuration is applied to every new/completed analysis afterwards.
UPDATE qc_media m
SET retention_class = CASE
      WHEN a.quality_class = 'good' AND (
        COALESCE((a.structured_result->'dialog'->>'upsellDetected')::boolean, false) OR
        COALESCE((a.structured_result->'dialog'->>'crossSellDetected')::boolean, false)
      ) THEN 'interesting'
      WHEN a.quality_class = 'bad' OR a.has_conflict OR a.has_complaint OR a.critical_violations_count > 0 THEN 'bad'
      ELSE 'standard'
    END,
    retention_reason = CASE
      WHEN a.quality_class = 'good' AND (
        COALESCE((a.structured_result->'dialog'->>'upsellDetected')::boolean, false) OR
        COALESCE((a.structured_result->'dialog'->>'crossSellDetected')::boolean, false)
      ) THEN 'Strong dialog with upsell or cross-sell.'
      WHEN a.quality_class = 'bad' OR a.has_conflict OR a.has_complaint OR a.critical_violations_count > 0
        THEN 'Poor or escalated dialog retained for review.'
      ELSE 'Routine dialog.'
    END,
    expires_at = NOW() + CASE
      WHEN a.quality_class = 'good' AND (
        COALESCE((a.structured_result->'dialog'->>'upsellDetected')::boolean, false) OR
        COALESCE((a.structured_result->'dialog'->>'crossSellDetected')::boolean, false)
      ) THEN INTERVAL '30 days'
      WHEN a.quality_class = 'bad' OR a.has_conflict OR a.has_complaint OR a.critical_violations_count > 0 THEN INTERVAL '7 days'
      ELSE INTERVAL '72 hours'
    END
FROM (
  SELECT DISTINCT ON (ar.session_id) ar.*
  FROM qc_analysis_results ar
  ORDER BY ar.session_id, ar.version DESC
) a
WHERE a.session_id = m.session_id;

UPDATE qc_media m
SET retention_class = 'bad',
    retention_reason = 'Failed processing retained for diagnosis.',
    expires_at = NOW() + INTERVAL '7 days'
FROM qc_sessions s
WHERE s.id = m.session_id
  AND s.status IN ('transcription_failed','analysis_failed')
  AND NOT EXISTS (SELECT 1 FROM qc_analysis_results a WHERE a.session_id = m.session_id);

UPDATE qc_media SET expires_at = NOW() + INTERVAL '72 hours' WHERE expires_at IS NULL;

CREATE INDEX qc_media_retention_cleanup_idx
  ON qc_media(expires_at, id)
  WHERE deleted_at IS NULL AND pinned_at IS NULL;
CREATE INDEX qc_media_session_available_idx ON qc_media(session_id) WHERE deleted_at IS NULL;
