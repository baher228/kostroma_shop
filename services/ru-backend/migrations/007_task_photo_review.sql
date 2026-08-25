ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS photo_confirmation_file_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS photo_confirmation_mime_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS photo_confirmation_uploaded_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS photo_review_status TEXT NOT NULL DEFAULT 'none'
    CHECK (photo_review_status IN ('none', 'pending', 'approved', 'declined')),
  ADD COLUMN IF NOT EXISTS photo_reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS photo_deletes_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS tasks_photo_deletes_at_idx ON tasks (photo_deletes_at)
WHERE photo_confirmation_file_name IS NOT NULL AND photo_deletes_at IS NOT NULL;
