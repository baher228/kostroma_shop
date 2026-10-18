-- Rebuild unsent automatic packages using consolidated promotion table rows.
-- Preserve manual snapshots and all deliveries that may have reached Gmail.
UPDATE gmail_deliveries
SET status='queued', rows_snapshot=NULL, storage_key=NULL, manifest=NULL,
    attempts=0, error=NULL, updated_at=NOW()
WHERE message_id IS NOT NULL AND status IN ('queued','preparing','ready');
