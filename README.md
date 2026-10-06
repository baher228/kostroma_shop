# Аналитика

Two Expo Android apps, a web dashboard, and a split Node.js backend.

This is one repo for development, but it builds into **separate deployable services**:

- **Analitika Tablet**: the full shop workflow (stock, orders, tasks, and support) plus a front-camera FOB QR scanner.
- **Analitika FOB**: worker-only mobile app that presents rotating check-in QR codes.
- **Russia backend**: personal data, auth, users, tasks, support, check-in.
- **Dubai backend**: shops, stock, products, prices, orders.
- **Russia PostgreSQL**: personal database.
- **Dubai PostgreSQL**: stock/financial database.

Production should run the RU and Dubai Docker Compose files on different servers. The local Compose file runs both only for development.

## Requirements

- Node.js 22+
- npm
- Docker Desktop

## First Setup

Install frontend and backend dependencies:

```bash
npm install
npm --prefix worker-app install
npm --prefix web-dashboard install
npm --prefix services/ru-backend install
npm --prefix services/dubai-backend install
```

Create or update `.env` in the repository root.

For Android emulator:

```env
EXPO_PUBLIC_RU_API_URL=http://10.0.2.2:4000
EXPO_PUBLIC_DXB_API_URL=http://10.0.2.2:4001
```

For a real phone on the same Wi-Fi, replace `YOUR_LOCAL_IP` with your computer's LAN IP:

```env
EXPO_PUBLIC_RU_API_URL=http://YOUR_LOCAL_IP:4000
EXPO_PUBLIC_DXB_API_URL=http://YOUR_LOCAL_IP:4001
```

## Launch

### Local Development

Start both databases and both backends on your machine:

```bash
npm run backend:docker:up
```

Check logs if needed:

```bash
npm run backend:docker:logs
```

Start the tablet app:

```bash
npm start
```

Then choose Android, iOS, or web from the Expo prompt. You can also run:

```bash
npm run android
npm run ios
npm run web
```

Start the worker FOB app in a second terminal:

```bash
npm run worker:start
```

The apps have separate Android application IDs and can be installed together:

- Tablet: `com.gringobochka.analitika`
- FOB mobile: `com.gringobochka.analitika.fob`

### Web Admin Dashboard

The separate admin dashboard lives in `web-dashboard/` and talks directly to both split backends.

```bash
npm run dashboard:dev
```

Dashboard environment variables:

```env
VITE_RU_API_URL=http://localhost:4000
VITE_DXB_API_URL=http://localhost:4001
```

The public login page and authenticated **Приложения** section read the latest builds from:

- `/downloads/analitika-latest.json`
- `/downloads/analitika-worker-latest.json`

The Android build workflow publishes both manifests and both versioned APKs together. Dashboard deployment excludes `downloads/`, so redeploying the website does not remove application builds.

## Default Login

These accounts are for the local development environment only.

```text
Username: admin
Password: admin
Role: manager

Username: manager
Password: manager123
Role: manager

Username: worker
Password: worker123
Role: worker

Username: tablet
Password: tablet123
Role: store_tablet
```

## Local Ports

- Russia backend: `http://localhost:4000`
- Dubai backend: `http://localhost:4001`
- Russia PostgreSQL: `localhost:5433`
- Dubai PostgreSQL: `localhost:5434`

## Backend Source Layout

Both backend services use the same lightweight structure:

- `app/` - Express app composition and common middleware
- `auth/` - token signing, token verification, and auth middleware
- `config/` - environment parsing
- `db/` - database client and migrations
- `domain/` - shared backend types
- `http/` - request validation and HTTP helper utilities
- `repositories/` - database-facing SQL modules
- `routes/` - Express route adapters
- `services/` - application/business rules used by routes

The Russia backend also has `observability/` for audit-related helpers.

The integrated Audio AI Quality Control design, API, migration, provider flow,
configuration, tests, and production checklist are documented in
[`services/ru-backend/QUALITY_CONTROL_IMPLEMENTATION.md`](services/ru-backend/QUALITY_CONTROL_IMPLEMENTATION.md).

## CI/CD

GitHub Actions workflows are included for deployment and application updates:

- `CI` — runs on push / pull request to `main` or `master`, installs dependencies, typechecks both Expo apps and the backends, runs backend tests, validates Docker Compose, and builds both backend Docker images.
- `Deploy backend` — deploys RU and/or Dubai backend over SSH with `rsync`, then runs the matching Docker Compose file and smoke-tests the health endpoint.
- `Deploy dashboard` — builds `web-dashboard`, rsyncs `dist/` to the web root, reloads nginx, and optionally smoke-tests the public dashboard URL.
- `Update Expo apps` — publishes EAS OTA updates for both Expo projects; automatic pushes default to the `preview` channel. Manual runs can target `preview` or `production`.
- `Build Android apps` — builds both dashboard-downloadable `preview` APKs, publishes them in one sync, and smoke-tests both downloads.

### GitHub Environments

Create these GitHub Environments:

- `production-backend`
- `production-dashboard`
- `expo-production`

The deploy workflows intentionally fail fast with explicit error messages if required secrets/variables are missing.

#### `production-backend` secrets

- `SSH_HOST`
- `SSH_PORT` (optional, defaults to `22`)
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_KNOWN_HOSTS` — output from `ssh-keyscan -p <port> <host>`
- `APP_PATH`
- `ENV_FILE` — full production `.env` content for the backend server

Recommended environment variables:

- `RU_HEALTH_URL` — e.g. `https://affera.co.uk/ru/api/health`
- `DUBAI_HEALTH_URL` — e.g. `https://affera.co.uk/dxb/api/health`

#### `production-dashboard` secrets

- `SSH_HOST`
- `SSH_PORT` (optional, defaults to `22`)
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `DASHBOARD_PATH` — e.g. `/var/www/affera`

Required environment variables:

- `VITE_RU_API_URL` — e.g. `https://affera.co.uk/ru`
- `VITE_DXB_API_URL` — e.g. `https://affera.co.uk/dxb`

Recommended environment variable:

- `DASHBOARD_URL` — e.g. `https://affera.co.uk`

#### `expo-production` secrets

- `EXPO_TOKEN`

Required environment variable:

- `EXPO_WORKER_EAS_PROJECT_ID` — UUID of the separate `analitika-worker-fob` EAS project.

Create the worker project once in the same Expo account, copy its project ID, then set `EXPO_WORKER_EAS_PROJECT_ID` in the `expo-production` GitHub Environment. The worker app reads this value into `extra.eas.projectId` and its EAS Update URL; no project ID is guessed or committed.

### Expo updates

EAS Update is enabled in both apps through `expo-updates`, `runtimeVersion.policy = appVersion`, and per-app EAS channels.

- Dashboard APK downloads are `preview` builds, so automatic OTA updates publish to each project's `preview` branch and keep its `preview` channel pointed at that branch.
- `production` builds receive OTA updates from the `production` channel when the workflow is run manually with `channel=production`.
- Native/runtime changes still require a new EAS build; JS/asset-only changes can ship through `Update Expo app`.

## Audio QC: sherpa-onnx VAD

The tablet app supports two Audio QC modes:

- `manual` records M4A through `expo-audio` and remains the fallback/debug mode.
- `vad_auto` captures 16 kHz mono PCM in an Android foreground service, uses the sherpa-onnx Silero model to detect speech, and saves finalized segments as WAV.

VAD only decides speech/non-speech. The native state machine provides hysteresis, pre-roll, silence timeout, minimum/maximum segment duration, and writes the local WAV. The JS handoff then stores an ordinary `AudioQcRecording` with `recordingMode=vad_auto`; the existing queue still calls the same ML session, audio upload, and process endpoints.

### Native artifacts and APK rebuild

The tracked local Expo module is in `modules/audio-qc-vad`. The first preview intentionally uses the universal sherpa-onnx AAR with `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64`. The AAR is about 46.6 MiB and the model about 0.6 MiB before APK packaging.

The root `.npmrc` sets `install-links=true`, so npm installs the local `audio-qc-vad` dependency as an ordinary directory instead of a symlink or Windows junction. Keep this setting for local installs and CI. Edit the tracked module in `modules/audio-qc-vad`; after changing its TypeScript entry point, run `npm ci` to refresh the installed copy. Expo Android autolinking uses the tracked module's `android` directory.

Verify or restore the pinned artifacts before building:

```bash
npm run audio-qc:prepare-native
```

The script pins sherpa-onnx `1.13.4` and verifies SHA-256 for both the AAR and `silero_vad.onnx`. It downloads only a missing or invalid build-time artifact; the app never downloads a model at runtime.

This is a native-runtime change. An OTA update cannot add the module, JNI libraries, model, service, or Android permissions. Build a new preview APK:

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

For local native inspection, generate the ignored Android project and build with JDK 17 plus a configured Android SDK:

```bash
npm run audio-qc:prepare-native
npx expo prebuild --clean --platform android
cd android
./gradlew :audio-qc-vad:testDebugUnitTest :app:assembleDebug
```

`expo prebuild --clean` recreates the ignored `android/` directory. Make permanent native changes in the tracked local module, not in generated files.

To update sherpa-onnx or the Silero model, change the version/URL and SHA-256 in `scripts/prepare-audio-qc-vad.mjs`, run the preparation command, inspect the universal ABI contents, run native tests, and produce a new APK. Do not ship such a change through OTA.

### RU policy migration and enablement

Apply RU migrations (including `008_audio_qc_vad_auto.sql`) with the normal backend environment configured:

```bash
npm run backend:ru:db:migrate
```

The migration permits `manual` and `vad_auto` in policies and heartbeats. Only a manager can update a shop policy. The manager UI exposes the mode, pre-roll, silence timeout, maximum segment duration, and immediate-upload setting. The equivalent API request is:

```bash
curl -X PUT "https://YOUR_RU_API/api/audio-qc/shops/SHOP_ID/policy" \
  -H "Authorization: Bearer MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"mode":"vad_auto","maxSegmentDurationSec":300,"silenceToStopSec":3,"preRollSec":5,"uploadImmediately":true}'
```

On a `store_tablet` session, the app starts VAD while the app is active. For this MVP it deliberately stops the foreground service when the app enters the background and rereads policy/restarts on return. The Android foreground notification and system microphone indicator remain visible while the service runs.

### Acceptance checks

Manual regression:

1. Set the shop policy to `manual`, record and stop from the tablet controls.
2. Confirm an `.m4a` item appears in Audio QC and advances through the queue.
3. Confirm the RU backend receives POST /api/quality-control/sessions, then /audio and /process, and the app polls /status until completion.

VAD preview:

1. Install the newly built APK, sign in as `store_tablet`, and enable `vad_auto` for its shop.
2. Confirm the UI shows `VAD active`, model loaded, and `idle`/waiting for speech.
3. Watch native diagnostics with `adb logcat -s AudioQcVad ReactNativeJS`. Look for `Silero model loaded`, probability/decision lines, state transitions, segment finalization, and JS queue handoff.
4. Keep the room quiet: no segment should be created. A single clap/short noise must not pass the 700 ms start hysteresis; any resulting segment under 5 seconds is deleted.
5. Speak continuously, then stay silent for 3 seconds. Confirm a WAV appears with `recordingMode=vad_auto`, VAD metadata, duration, size, and speech ratio.
6. Confirm the heartbeat reports `currentMode=vad_auto`; `isRecording` is true only while a segment is being written.
7. Disable the network and verify the existing retry state is retained. Restore it and confirm the same Quality Control requests complete.
8. Verify continuous speech is force-finalized at `maxSegmentDurationSec` and app reload recovers any pending native-to-JS handoff.

Current MVP limitations: Android only, no on-device STT/diarization, WAV files are larger than AAC, policy polling can take up to 45 seconds, and VAD pauses in background. ABI splits, compressed native encoding, device-specific VAD calibration, longer lifecycle soak tests, and richer `vadActive` heartbeat telemetry are candidates for the next sprint.

### Example `ENV_FILE` Secret

Russia environment:

```env
JWT_SECRET=change_me_long_random_secret
OPS_JWT_SECRET=change_me_same_value_as_dubai_for_dev_or_use_rs256_keys
CORS_ORIGIN=https://affera.co.uk
PERSONAL_POSTGRES_PASSWORD=change_me
PERSONAL_POSTGRES_DB=analitika_personal
PERSONAL_POSTGRES_USER=analitika
RU_BACKEND_PUBLIC_PORT=4000
```

Dubai environment:

```env
OPS_JWT_SECRET=change_me_same_value_as_russia_for_dev_or_use_rs256_keys
CORS_ORIGIN=https://affera.co.uk
OPS_POSTGRES_PASSWORD=change_me
OPS_POSTGRES_DB=analitika_ops
OPS_POSTGRES_USER=analitika
DXB_BACKEND_PUBLIC_PORT=4001
```

## Deploy On Separate Servers

The code can live in one Git repo. The running services should be separate.

### Russia Server

On the Russia server, use only:

```bash
docker-compose.ru.yml
services/ru-backend/Dockerfile
```

Create `.env` on the Russia server:

```env
JWT_SECRET=change_me_long_random_secret
OPS_JWT_SECRET=change_me_same_value_as_dubai_for_dev_or_use_rs256_keys
CORS_ORIGIN=https://your-frontend-domain.example
PERSONAL_POSTGRES_PASSWORD=change_me
PERSONAL_POSTGRES_DB=analitika_personal
PERSONAL_POSTGRES_USER=analitika
RU_BACKEND_PUBLIC_PORT=4000
```

Start Russia only:

```bash
npm run backend:docker:ru:up
```

Russia must not have Dubai DB credentials.

### Dubai Server

On the Dubai server, use only:

```bash
docker-compose.dubai.yml
services/dubai-backend/Dockerfile
```

Create `.env` on the Dubai server:

```env
OPS_JWT_SECRET=change_me_same_value_as_russia_for_dev_or_use_rs256_keys
CORS_ORIGIN=https://your-frontend-domain.example
OPS_POSTGRES_PASSWORD=change_me
OPS_POSTGRES_DB=analitika_ops
OPS_POSTGRES_USER=analitika
DXB_BACKEND_PUBLIC_PORT=4001
```

Start Dubai only:

```bash
npm run backend:docker:dubai:up
```

Dubai must not have Russia DB credentials.

### Frontend Production Env

The frontend needs both public URLs:

```env
EXPO_PUBLIC_RU_API_URL=https://ru-api.your-domain.example
EXPO_PUBLIC_DXB_API_URL=https://dxb-api.your-domain.example
```

## Useful Commands

Stop everything:

```bash
npm run backend:docker:down
```

Stop only Russia:

```bash
npm run backend:docker:ru:down
```

Stop only Dubai:

```bash
npm run backend:docker:dubai:down
```

Start only the databases:

```bash
npm run db:up
```

Run checks:

```bash
npm test
npm run backend:typecheck
npm run backend:test
```

`npm test` is the full local check: frontend typecheck, dashboard build, and backend tests. Use `npm run backend:test` when you only need the backend test suites.

Run database migrations directly:

```bash
npm run backend:ru:db:migrate
npm run backend:dubai:db:migrate
```

## Notes

- The frontend must call both backends directly. Do not route Dubai stock/order API calls through the Russia backend.
- The Russia backend issues short-lived Dubai API tokens through `/api/auth/ops-token`.
- `services/ru-backend` contains only the Russia backend source and personal-data migrations.
- `services/dubai-backend` contains only the Dubai backend source and stock/financial migrations.
- Backend routes call services, services call repositories, and repositories own SQL/database mapping.
- For stronger production auth, use `OPS_TOKEN_PRIVATE_KEY` on Russia and `OPS_TOKEN_PUBLIC_KEY` on Dubai instead of shared `OPS_JWT_SECRET`.


## Build APKs with EAS (no Android Studio needed)

Build the tablet APK from the project root:

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

Build the worker FOB APK from its app directory after setting the linked project ID:

```bash
cd worker-app
EXPO_WORKER_EAS_PROJECT_ID=<worker-project-uuid> npx eas-cli build -p android --profile preview
```

Both `preview` profiles use the HTTPS production APIs at `https://affera.co.uk/ru` and `https://affera.co.uk/dxb` as applicable. Cleartext access remains enabled only for local emulator/LAN development.

## Unified local contour

The local Quality Control stack is part of the main Analitika Compose project. It starts the RU and Dubai PostgreSQL databases, both backends, and the existing MinIO data volume.

Run npm run stack:up, then npm run android:reverse, then npm run dashboard:dev.

For the physical Android tablet, keep EXPO_PUBLIC_RU_API_URL=http://127.0.0.1:4000 and EXPO_PUBLIC_DXB_API_URL=http://127.0.0.1:4001 in the gitignored root .env; android:reverse forwards API and Metro ports over USB. Quality Control metadata is stored by the RU backend in analitika_personal; audio remains in the private ml-audio MinIO bucket. The standalone Python ML API, Celery, Redis, and ML PostgreSQL are not part of the runtime.
