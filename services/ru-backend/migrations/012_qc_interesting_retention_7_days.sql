-- Keep applied migrations immutable. Existing interesting audio gets at most
-- seven more days when the shorter policy is deployed; do not extend earlier
-- deadlines or change manager-pinned/deleted recordings.
UPDATE qc_media
SET expires_at = NOW() + INTERVAL '7 days'
WHERE retention_class = 'interesting'
  AND pinned_at IS NULL
  AND deleted_at IS NULL
  AND expires_at > NOW() + INTERVAL '7 days';
