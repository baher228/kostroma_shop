# AI Quality Control integration

## Evidence and decisions

Russia backend: Node 22 / TypeScript, Express 5 registration functions, route → service → SQL repository; pg pool and shared transaction-capable `withClient`; Zod 4 validation; fresh-user JWT middleware and manager/worker/store_tablet roles; SQL migrations with advisory lock; node:test against compiled JS. No ORM, DI framework, queue or RU storage client. IDs are TEXT. Managers have global access in existing management services; tablets are scoped to their assigned shop; workers must only see their own QC results.

Existing entities: `users` owns employees and tablets. Shops live in the operations database; Russia already stores their opaque `shop_id` references. Do not duplicate shops or query/send QC data to Dubai. Validate shop against RU user assignments/check-in records. No separate shift table exists: an optional `shiftId` references an existing `worker_checkin_events` entry with status `in`, checked against seller, shop and recording time. Keep unknown seller/shift null; never infer a speaker's role from an employee ID.

ML project: FastAPI/Pydantic + SQLAlchemy/Alembic + separate PostgreSQL + Celery/Redis + boto3 and its own Compose-managed MinIO/buckets. Actual audio upload/download, job submission, Nexara Python SDK text transcription and transcript upsert exist. Worker preprocessing and analysis are explicit stubs. No production GigaChat prompt/scorecard is implemented. The migration retains the old project as a reference; the RU module connects to the already deployed private MinIO endpoint and never provisions another instance.

## Mapping

| Old component | Decision | Destination |
| --- | --- | --- |
| Sessions / media schemas, canonical aliases | ADAPT | QC types and Zod route validation |
| Storage key hygiene and existing S3_* config/buckets | ADAPT | RU MinIO adapter, same instance |
| Nexara SDK API behavior and empty-text rejection | ADAPT | TypeScript SttProvider |
| Transcript per audio and status lifecycle | ADAPT | durable SQL jobs and canonical transcript |
| FastAPI routes / SQLAlchemy repositories / Alembic | REWRITE | Express routes / pg repository / additive SQL migration |
| Python boto3 / Nexara client | REWRITE | TypeScript adapters |
| Celery/Redis | DROP from target | PostgreSQL queue with leases and retry backoff |
| Separate ML application/database/Docker deployment | DROP from target | existing RU backend/database; source retained |
| Faster-Whisper, PyTorch, CUDA, pyannote, NeMo, YOLO, local inference | DROP from MVP | no required implemented pipeline to carry over |
| FFmpeg preprocessing | DROP stub | submit original supported audio directly |
| Prompt / scorecard / analysis | NEW | versioned Zod schema and GigaChat provider (old analysis is a stub) |
| Python tests | ADAPT | node:test provider fakes, SQL/integration and HTTP tests |

## Implementation sequence

1. Add QC domain contracts, non-destructive migration for seven QC tables, FK/index constraints, versioned analysis schema/prompt.
2. Implement repository with existing identity validation and scope, atomic audio metadata + job publication, unique transcript/result per job, SQL aggregates using latest completed analysis.
3. Adapt existing MinIO endpoint/bucket settings, bounded multipart upload, verified Nexara contract and official GigaChat SDK; no manual token lifecycle.
4. Poll PostgreSQL jobs in RU runtime; claim with SKIP LOCKED, finite leases, token fencing, stage errors and bounded exponential retry; transcript completion atomically queues analysis.
5. Register authenticated QC APIs and move current tablet upload client to RU API with session token and recording idempotency key.
6. Verify with fake external providers/storage, real PostgreSQL migration/SQL checks when available, existing tests/typecheck/build and frontend typecheck. Document remaining production configuration and live-credential validation separately.

## Risks to verify

No fabricated Nexara timestamps/diarization: text-only result maps to unknown speaker with null timing. No employee/device/database IDs cross LLM boundary. Existing MinIO must be reachable in Russian deployment; do not provision replacement storage. Docker daemon currently unavailable locally; use a local disposable PostgreSQL test alternative if needed. Invalid provider responses never complete analysis; retain prior analysis history during intentional reanalysis. No generic logging of raw provider errors/transcripts/credentials.
