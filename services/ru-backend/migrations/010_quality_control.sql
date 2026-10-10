-- QC metadata belongs to the existing Russia database. Shop identifiers follow
-- existing RU opaque shop_id references; no cross-region FK or duplicate shops.
CREATE TABLE qc_sessions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  seller_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  shift_id TEXT REFERENCES worker_checkin_events(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  external_session_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','queued','transcribing','analysis_queued','analyzing','completed','transcription_failed','analysis_failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by, external_session_id),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (shift_id IS NULL OR seller_id IS NOT NULL)
);
CREATE INDEX qc_sessions_shop_time_idx ON qc_sessions(shop_id, started_at DESC);
CREATE INDEX qc_sessions_seller_time_idx ON qc_sessions(seller_id, started_at DESC);
CREATE INDEX qc_sessions_shift_idx ON qc_sessions(shift_id);
CREATE INDEX qc_sessions_creator_idx ON qc_sessions(created_by);
CREATE INDEX qc_sessions_time_idx ON qc_sessions(started_at DESC);

CREATE TABLE qc_media (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qc_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('audio','video')),
  storage_key TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL CHECK (size > 0),
  duration DOUBLE PRECISION CHECK (duration >= 0 AND duration < 'Infinity'::float8),
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, id),
  UNIQUE (session_id, type),
  UNIQUE (storage_bucket, storage_key)
);

CREATE TABLE qc_transcripts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qc_sessions(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  provider_model TEXT,
  language TEXT,
  duration DOUBLE PRECISION CHECK (duration >= 0 AND duration < 'Infinity'::float8),
  raw_result JSONB,
  technical_metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, id),
  FOREIGN KEY (session_id, media_id) REFERENCES qc_media(session_id, id) ON DELETE RESTRICT
);
CREATE INDEX qc_transcripts_session_idx ON qc_transcripts(session_id);
CREATE TABLE qc_transcript_segments (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES qc_transcripts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  start_time DOUBLE PRECISION,
  end_time DOUBLE PRECISION,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  confidence DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
  UNIQUE (transcript_id, position),
  CHECK ((start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time >= 0 AND end_time >= start_time AND end_time < 'Infinity'::float8))
);

CREATE TABLE qc_processing_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qc_sessions(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('transcription','analysis')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  transcript_id TEXT,
  idempotency_key TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, id),
  UNIQUE (session_id, idempotency_key),
  CHECK ((stage = 'analysis') = (transcript_id IS NOT NULL)),
  FOREIGN KEY (session_id, transcript_id) REFERENCES qc_transcripts(session_id, id) ON DELETE RESTRICT
);
CREATE INDEX qc_jobs_poll_idx ON qc_processing_jobs(status, available_at, lease_expires_at);
CREATE INDEX qc_jobs_session_idx ON qc_processing_jobs(session_id, created_at DESC);
CREATE INDEX qc_jobs_transcript_idx ON qc_processing_jobs(transcript_id);
CREATE UNIQUE INDEX qc_jobs_one_active_session_idx ON qc_processing_jobs(session_id) WHERE status IN ('queued','running');

CREATE TABLE qc_analysis_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qc_sessions(id) ON DELETE CASCADE,
  transcript_id TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT NOT NULL,
  scorecard_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  overall_score DOUBLE PRECISION NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  quality_class TEXT NOT NULL CHECK (quality_class IN ('good','neutral','bad')),
  customer_sentiment TEXT NOT NULL CHECK (customer_sentiment IN ('positive','neutral','negative','unknown')),
  customer_satisfaction TEXT NOT NULL CHECK (customer_satisfaction IN ('satisfied','neutral','dissatisfied','unknown')),
  has_conflict BOOLEAN NOT NULL,
  has_complaint BOOLEAN NOT NULL,
  has_objection BOOLEAN NOT NULL,
  violations_count INTEGER NOT NULL CHECK (violations_count >= 0),
  critical_violations_count INTEGER NOT NULL CHECK (critical_violations_count BETWEEN 0 AND violations_count),
  structured_result JSONB NOT NULL,
  technical_metadata JSONB NOT NULL DEFAULT '{}',
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, version),
  FOREIGN KEY (session_id, transcript_id) REFERENCES qc_transcripts(session_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, job_id) REFERENCES qc_processing_jobs(session_id, id) ON DELETE RESTRICT,
  CHECK (length(trim(provider)) > 0 AND length(trim(prompt_version)) > 0 AND length(trim(scorecard_version)) > 0 AND length(trim(schema_version)) > 0),
  CHECK (structured_result->>'schemaVersion' = schema_version)
);
CREATE INDEX qc_analysis_session_latest_idx ON qc_analysis_results(session_id, version DESC);
CREATE INDEX qc_analysis_transcript_idx ON qc_analysis_results(transcript_id);
CREATE INDEX qc_analysis_analyzed_idx ON qc_analysis_results(analyzed_at);
CREATE INDEX qc_analysis_class_idx ON qc_analysis_results(quality_class);
CREATE TABLE qc_criterion_scores (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES qc_analysis_results(id) ON DELETE CASCADE,
  criterion_key TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL CHECK (score >= 0),
  max_score DOUBLE PRECISION NOT NULL CHECK (max_score > 0 AND max_score < 'Infinity'::float8),
  status TEXT NOT NULL CHECK (status IN ('good','neutral','needs_improvement','not_applicable')),
  comment TEXT NOT NULL,
  UNIQUE (analysis_id, criterion_key),
  CHECK (score <= max_score)
);
