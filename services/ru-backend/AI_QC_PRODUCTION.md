# AI QC production release

## Configuration and deployment

Production RU Compose includes MinIO with the `qc` profile and a persistent
`minio_data` volume. Deployment waits for MinIO and creates `S3_BUCKET_AUDIO`
idempotently before replacing the backend. MinIO has no published host ports;
the RU backend connects through `http://minio:9000` on the Compose network.
Its root credentials come from the existing `S3_ACCESS_KEY` / `S3_SECRET_KEY`
deployment secrets. The initializer does not change bucket policies or remove
existing objects. Keep those credentials stable across deployments.

`ops/minio/Dockerfile` builds MinIO `RELEASE.2025-10-15T17-29-55Z` and mc
`RELEASE.2025-08-13T08-35-41Z` from the pinned official Go modules. This avoids
the withdrawn Docker Hub/Quay images. CI verifies the same image build.
After bucket initialization, deployment runs `storagePreflight.js` to verify
object write/read/delete with the actual backend credentials before replacing
RU backend. It removes its uniquely named healthcheck object, touches no DB,
and makes no AI calls. CI runs the same check against a disposable MinIO.

The deployment source is GitHub Environment `production-backend`, secret
`ENV_FILE` (the complete backend `.env` file). Nonempty individual Environment
secrets override matching values in that file: `PERSONAL_POSTGRES_PASSWORD`,
`QC_ENABLED`, `QC_WORKER_ENABLED`,
the `S3_*` credentials/endpoint/bucket/region, `NEXARA_API_KEY`,
`GIGACHAT_AUTH_KEY`, `GIGACHAT_SCOPE`, and `GIGACHAT_CA_BUNDLE_PATH`.
The Environment variable `CORS_ORIGIN` overrides the matching setting in
`ENV_FILE` through the same writer; set it to the production dashboard origin.
Other settings, including retention durations and model, come from `ENV_FILE`.
Never commit the generated file; deployment writes it with mode 0600.

Keep the individual `PERSONAL_POSTGRES_PASSWORD` secret stable after rotation.
After successful QC configuration and storage checks, RU deployment updates
the PostgreSQL container environment without removing its existing volume,
then `scripts/rotate-ru-db-password.sh` sets the existing database role password
through the local socket before replacing the backend. This aligns credentials
for an existing database: `POSTGRES_PASSWORD` alone only initializes new data
directories. The script uses psql identifier/value quoting and prints no password.
External RU database clients must use the same credential; allow a brief
reconnection interruption when changing it. Dubai credentials are separate.

For processing, set `QC_ENABLED=true`, `QC_WORKER_ENABLED=true`, the existing
private MinIO `S3_ENDPOINT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
`S3_BUCKET_AUDIO`, `NEXARA_API_KEY`, and `GIGACHAT_AUTH_KEY`. Keep existing
database, JWT, operations token and CORS settings. A MinIO address such as
`127.0.0.1` refers to the container itself: use an address reachable from it.
The service does not create the bucket. Its credentials need object read,
write and delete access for `quality-control/` in that bucket.

RU Compose defaults to `GigaChat-3-Pro`, consistent with the application and
local Compose configuration. An explicit `GIGACHAT_MODEL` in `ENV_FILE` wins;
check that the account has access to that model. The packaged Russian CA
bundle is used by default, with TLS verification enabled. If overriding
`GIGACHAT_CA_BUNDLE_PATH`, use a path available **inside** the container.
The endpoints can be overridden with `NEXARA_BASE_URL`, `GIGACHAT_BASE_URL`
and `GIGACHAT_AUTH_URL`; AI endpoints must use HTTPS.

The default lease is 900000 ms. It must exceed the largest provider timeout
plus the storage timeout and a 30000 ms margin. Each RU replica processes one
job at a time; consider total replica count when setting provider quotas.

The deploy workflow builds an image and runs
`node dist/quality-control/preflight.js` in a temporary container with the
production Compose environment **before** replacing the running backend.
This checks configuration only, without migrations, DB writes or paid AI
calls. The server also validates QC settings before applying migrations.
Preflight success does not establish network connectivity, account balance,
model access or correct provider responses.

Before deploying, back up RU PostgreSQL. Startup applies the additive QC
migrations, including `011_qc_audio_retention.sql`; this migration clears old
raw provider payloads and assigns existing audio a fresh default grace period.
Canonical transcripts remain. Use a database backup to restore those old raw
payloads if needed. Keep a previous image available for application rollback;
do not drop the new tables during rollback.

## Audio retention

Defaults can be overridden in `ENV_FILE`:

| Recording | Setting | Default |
| --- | --- | --- |
| Routine / awaiting analysis | `QC_RETENTION_STANDARD_HOURS` | 72 hours |
| Bad quality, complaint, conflict, critical problem or violation | `QC_RETENTION_BAD_HOURS` | 168 hours |
| Good quality with upsell/cross-sell | `QC_RETENTION_INTERESTING_HOURS` | 168 hours |
| Terminal processing failure, including exhausted lease | `QC_RETENTION_BAD_HOURS` | 168 hours |
| Manager-pinned audio | No expiration until unpinned | Indefinite |

Current classification checks good upsell/cross-sell first; such a recording
gets the interesting retention period even if its analysis also flags an
incident. Otherwise incidents get the bad retention period. Pinning takes
precedence over automatic classification. After unpinning, the latest
analysis or terminal failure determines the policy and a fresh period starts.

Set `QC_RETENTION_INTERESTING_HOURS=168` in `ENV_FILE` if it previously explicitly
overrode the default with 720. Migration `012_qc_interesting_retention_7_days.sql`
caps existing unpinned interesting audio deadlines at seven days from migration
time; earlier deadlines and pinned/deleted recordings are preserved.

The initial deadline starts at upload; completed analysis/reanalysis or a
terminal failure resets it from that event. Cleanup runs on startup and then
every `QC_RETENTION_CLEANUP_INTERVAL_MS` (default one hour), claiming up to
`QC_RETENTION_CLEANUP_BATCH_SIZE` (default 25) objects per pass. Queued/running
jobs and pinned recordings are skipped. Storage failures release the claim
for retry. Cleanup deletes the object from its recorded bucket and keeps an
audio metadata tombstone. Audio access then returns HTTP 410.

Canonical transcripts, scores, recommendations and analysis history remain
in PostgreSQL; no automatic TTL for those rows is implemented. New raw STT
payloads are not stored. On a versioned MinIO bucket, DeleteObject can leave
older object versions; configure noncurrent-version lifecycle separately if
physical removal is required. Database backups have their own retention.

On the tablet, local audio/history older than seven days from creation is
cleaned only for `processing_started` or `completed` recordings. Unsent and
failed recordings remain for recovery. This is separate from server retention.

## Validation and first live recording

Run `npm run ci`, including type checks, dashboard tests/build, backend tests
and quiet Compose validation. GitHub CI additionally exports both Android
bundles and builds backend Docker images. Native VAD module changes trigger
the Android APK workflow; install the new APK when adding/updating native code.

Automated tests use fake AI providers and a disposable embedded PostgreSQL
engine (PGlite). They verify SQL and migrations, but do not establish
cross-server SKIP LOCKED behavior or a live provider contract.

After deployment, create a short test conversation on the tablet, upload it
and confirm `queued → transcribing → analysis_queued → analyzing → completed`.
In the manager dashboard, verify transcript, evidence, seven criteria,
score/class, audio playback, expiration and pin/unpin. Check that final errors
are visible and recoverable. Do not infer AI readiness from `/health` alone.
Monitor safe job failure codes without logging transcripts, audio or secrets.

Live Nexara/GigaChat testing is deferred to the owner for this release;
there is no test audio in the workspace. Required deployment/AI secret names
were verified in GitHub, but their contents and actual production connectivity
have not been verified locally.
