# Existing ML project audit

Audited source: `../../backend-kostroma-ml/ml-quality-service`, plus the four DOCX documents in `../../backend-kostroma-ml`. The audit reads the source and does not infer completed features from roadmap text. The old project is retained. The new integration decisions are recorded in `QUALITY_CONTROL_PLAN.md`.

## Actual architecture

The old service uses Python 3.11, FastAPI/Uvicorn, Pydantic 2 settings/schemas, SQLAlchemy 2, Alembic, PostgreSQL, boto3, and Celery with Redis. Exact pins are in `ml-quality-service/requirements.txt`, including `nexara==0.5.0`. `docker-compose.yml` provisions five services: `ml-api`, `ml-worker`, `ml-postgres`, `ml-redis`, and `ml-minio`. This is a separate data owner and deployment, not an existing Russia backend module.

HTTP routes in `app/api/routes/sessions.py` delegate to `app/services/sessions.py`, which coordinates repositories, storage and Celery. Async SQLAlchemy sessions serve HTTP; the worker in `app/workers/tasks.py` opens synchronous psycopg sessions. Configuration is centralized in `app/core/config.py`; only the Nexara key is wrapped in Pydantic `SecretStr`. The supplied `.env.example` documents configuration; actual secret values were not printed in this audit.

Two Alembic revisions create four tables: `conversation_sessions`, `audio_files`, `processing_jobs`, and `transcriptions`. The session's `shop_id`, `seller_id`, `shift_id`, and `device_id` are opaque strings without foreign keys to Analitika identity data. Audio/job/transcription foreign keys are internal to the ML database. A unique audio-file key permits one transcription per audio file; repeat transcription overwrites it.

## Implemented versus planned

| Area | Evidence and actual behavior |
| --- | --- |
| Sessions | `app/services/sessions.py` and `app/repositories/sessions.py` create session metadata; only shop and start are required. No identity lookup, authorization or relationship validation is implemented. |
| Audio ingestion | Multipart route accepts an uploaded file, counts its size in chunks, stores filename/extension/content type/size, uploads through boto3, then commits metadata. The only content validation is maximum size: empty files and nonaudio payloads are not rejected. |
| Storage | `app/services/storage.py` implements bucket creation, upload/download, and filename sanitization. Object layout is `sessions/{sessionId}/audio/{audioFileId}_{filename}`. The separate ML MinIO and three buckets exist in its Compose configuration; Russia backend had no reusable storage client before this integration. |
| Job submission | A processing record is committed, then Celery is called, then its task ID is committed. This is not an atomic durable publish: a broker failure can leave a queued row without a task. Only `audio_mvp` is enabled. |
| Worker | `app/workers/tasks.py` downloads the latest audio into `TemporaryDirectory`, invokes STT and persists transcription. Preprocessing and analysis explicitly use `preprocessing_stub` and `analysis_stub`; the job nevertheless reaches completed. |
| Nexara | `app/services/transcription.py` creates the Python SDK client with API key, timeout, and max retries, calls `client.transcriptions.create(file=str(file_path))`, then strips and rejects empty `result.text`. This is a real provider call, with fakes in tests. The wrapper does not expose the SDK's wire protocol. |
| Transcript | `app/models/transcription.py` persists only provider and text with session/audio links and timestamps. There is no canonical segment model, language, duration, model, raw response, confidence, speaker mapping, or diarization. |
| Retry/idempotency | SDK retry count is configurable. There are no job attempts/backoff/leases/claim locks or duplicate-execution fencing. Every process request creates a job; every worker delivery runs it again. Audio selection happens at execution time. |
| Failure handling | The worker catches all exceptions, stores `str(exc)`, marks job/session failed, logs the exception and rethrows. Errors are not classified by provider/stage and raw exception text could expose provider details. |
| Status | `app/schemas/common.py` lists session states including diarizing and job types including disabled pipelines. These are sets rather than enforced transition rules. API status returns the latest job, progress and current step. |
| GigaChat/LLM | No provider, prompt template, parser, structured-output schema, validation, versioning or implementation exists. The analysis stage is a stub. |
| Scorecard | No executable scorecard, criterion scores, violations, recommendations or deterministic quality classification exists. The DOCX roadmap supplies useful domain criteria only. |
| Video/timeline | No video ingestion, cameras, frames, OCR, video events, dialog timeline or speaker separation implementation exists. Their presence in plans is not evidence of working code. |
| Preprocessing | No FFmpeg command, ffprobe extraction, VAD or media conversion code, executable dependency or Docker installation exists. Only the preprocessing status placeholder is implemented. |
| Authentication/analytics | The routes have dependency injection for the session service/database but no auth guard or RBAC. No session list/result, aggregate/trend or shop/seller reporting implementation exists. |

## Component migration decisions

All source paths below are relative to `backend-kostroma-ml/ml-quality-service` unless a document is named explicitly. “DROP” refers to the target deployment/dependencies; it does not authorize deletion of the supplied source.

| Component | Decision | Destination or reason |
| --- | --- | --- |
| FastAPI/Uvicorn and route dependency injection | REWRITE | Existing Russia Express route registration, JWT middleware and service conventions. A second HTTP server/auth system is unnecessary. |
| Pydantic DTOs and camelCase aliases | ADAPT | QC TypeScript types and existing Zod validation, with actual identity/time/file checks. |
| Standalone ML server | DROP | Russia backend owns the QC domain and execution. |
| Separate ML PostgreSQL/SQLAlchemy/Alembic | REWRITE / DROP infrastructure | Additive SQL migrations and `pg` repositories in Russia's personal database. Adapt the useful session/media/job/transcript concepts without copying opaque employee identities. |
| Separate Docker application and Celery/Redis | DROP | Existing Russia runtime and PostgreSQL durable jobs. Preserve async work, add claims, leases, retry backoff and fencing. No new Redis service is required. |
| Python Nexara API wrapper | ADAPT / REWRITE | `SttProvider` and TypeScript Nexara adapter preserve configured timeout, provider isolation and empty-result rejection. Independently verify the actual provider contract from official sources; never invent endpoints from the Python method name. |
| Python boto3 MinIO client | ADAPT / REWRITE | Reuse the existing MinIO endpoint and buckets via the Russia module's TypeScript adapter. Preserve object-key hygiene and file/metadata separation; do not start another MinIO or migrate to R2. |
| Session, audio and job concepts | ADAPT | `quality-control` domain, linked to Russia users and existing shop/check-in references; durable jobs bind their input rather than selecting arbitrary latest audio at run time. |
| Whole-text transcription | ADAPT | Canonical transcript independent of Nexara payload. Text-only responses retain unknown speakers and unknown times; missing roles/timestamps must not be invented. |
| Faster-Whisper | DROP from MVP | Roadmap proposal only, absent from source/dependencies; STT uses Nexara API. |
| PyTorch | DROP from MVP | Not installed or used by the supplied implementation; no local inference requirement. |
| CUDA | DROP from MVP | No GPU code/container setup exists or is needed for API providers. |
| pyannote | DROP from MVP | Roadmap-only diarization; no implementation to port. |
| NeMo | DROP from MVP | Roadmap-only alternative to pyannote; no implementation to port. |
| YOLO | DROP from MVP | Roadmap-only optional video detector; video is deferred. |
| Local inference | DROP from MVP | No working local pipeline exists and the user explicitly selects API models. |
| FFmpeg preprocessing | DROP placeholder; retain extension point | No reusable implementation exists. Send supported audio formats directly to Nexara; conversion can be added if provider constraints require it. |
| Prompt templates/response parsers/JSON schema | NEW | Versioned prompt and validated structured analysis in Russia; nothing executable exists to reuse. |
| Scorecard criteria | REUSE domain vocabulary / ADAPT implementation | Seven criteria from `sprints.docx` and Sprint 0 document: greeting, politeness, needs discovery, product knowledge, objection handling, closing, script compliance. Keep stable keys and evidence; add versioned schema, strict bounds, backend classification and analytics fields. |
| Violations/recommendations | ADAPT design intent | Roadmap proposes evidence, priority and seller-training recommendations. Store validated structured fields with analytical counters, not a new unverified LLM schema copied from a loose example. |
| Status models | ADAPT | Preserve visible queued/running/failed/completed lifecycle while separating transcription/analysis errors and removing fake completed analysis. |
| Tests | ADAPT | Port useful API, storage safety, SDK options, empty transcription and worker persistence cases to the existing `node:test` architecture; add missing authorization, retries/concurrency, validation, analytics and versioning coverage. |

## Documentation reconciliation

`ML_QC_Analitika_Sprint_0_Documentation.docx` is explicitly a version 0.1 draft. It proposes the separate service/database, production R2, direct API metadata snapshots, FFmpeg mono 16 kHz, diarization, model runs, score items and reporting. `sprints.docx` lists twelve future sprints and examples for transcript timing, timeline and scorecard. These examples are design input, not existing tested business logic. Their separate-owner/R2/Dubai decisions are superseded by the current user specification.

Both investor one-pagers describe the earlier Sprint 1 dummy pipeline and claim 11 passing tests from that period. Current code has subsequently added Nexara and transcription persistence. Neither one-pager proves the current stack has been run in this workspace, and neither claims real semantic analysis.

## Existing test evidence and limits

There are 16 test functions in seven files: health (1), session API contracts (7), schema aliases/defaults (2), filename behavior (2), Nexara wrapper (3), and worker transcription helper (1). `tests/conftest.py` replaces the service for route tests; the worker test replaces storage and Nexara and uses a fake database. These tests cover useful contracts but do not verify migrations, production SQL, real storage, Celery execution, RBAC or provider network contracts. There is no processing-loop failure/retry/concurrency coverage. The status fake still says `transcription_stub`, despite the real worker now using `nexara_transcription`.

During audit, Python 3.12 was present but `nexara`, `pytest`, `sqlalchemy` and `fastapi` were not installed. The old tests were inspected, not executed. Installing an obsolete separate service is unnecessary to validate the new TypeScript integration; its own fake-provider and database tests must supply current execution evidence.
