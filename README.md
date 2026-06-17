# Аналитика

Expo mobile frontend plus a split Node.js backend.

This is one repo for development, but it builds into **separate deployable services**:

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

Start the Expo app:

```bash
npm start
```

Then choose Android, iOS, or web from the Expo prompt. You can also run:

```bash
npm run android
npm run ios
npm run web
```

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

## Default Login

```text
Username: admin
Password: admin

Username: manager
Password: manager123
```

## Local Ports

- Russia backend: `http://localhost:4000`
- Dubai backend: `http://localhost:4001`
- Russia PostgreSQL: `localhost:5433`
- Dubai PostgreSQL: `localhost:5434`

## CI/CD

GitHub Actions workflows are included for deployment and application updates:

- `CI` — runs on push / pull request to `main` or `master`, installs dependencies, typechecks frontend + backends, runs backend tests, validates Docker Compose, and builds both backend Docker images.
- `Deploy backend` — deploys RU and/or Dubai backend over SSH with `rsync`, then runs the matching Docker Compose file and smoke-tests the health endpoint.
- `Deploy dashboard` — builds `web-dashboard`, rsyncs `dist/` to the web root, reloads nginx, and optionally smoke-tests the public dashboard URL.
- `Update Expo app` — publishes EAS OTA updates to the `preview` or `production` channel.
- `Build Android app` — manual EAS workflow for `preview` APK or `production` AAB builds.

### GitHub Environments

Create these GitHub Environments:

- `production-ru`
- `production-dubai`
- `production-dashboard`
- `expo-production`

The deploy workflows intentionally fail fast with explicit error messages if required secrets/variables are missing.

#### `production-ru` secrets

- `SSH_HOST`
- `SSH_PORT` (optional, defaults to `22`)
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `APP_PATH`
- `ENV_FILE` — full `.env` content for the RU server

Recommended environment variable:

- `HEALTH_URL` — e.g. `https://affera.co.uk/ru/api/health`

#### `production-dubai` secrets

- `SSH_HOST`
- `SSH_PORT` (optional, defaults to `22`)
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `APP_PATH`
- `ENV_FILE` — full `.env` content for the Dubai server

Recommended environment variable:

- `HEALTH_URL` — e.g. `https://affera.co.uk/dxb/api/health`

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

### Expo updates

EAS Update is enabled through `expo-updates`, `runtimeVersion.policy = appVersion`, and EAS channels in `eas.json`.

- `preview` builds receive OTA updates from the `preview` channel.
- `production` builds receive OTA updates from the `production` channel.
- Native/runtime changes still require a new EAS build; JS/asset-only changes can ship through `Update Expo app`.

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

Run backend checks:

```bash
npm run backend:typecheck
npm run backend:test
```

## Notes

- The frontend must call both backends directly. Do not route Dubai stock/order API calls through the Russia backend.
- The Russia backend issues short-lived Dubai API tokens through `/api/auth/ops-token`.
- `services/ru-backend` contains only the Russia backend source and personal-data migrations.
- `services/dubai-backend` contains only the Dubai backend source and stock/financial migrations.
- For stronger production auth, use `OPS_TOKEN_PRIVATE_KEY` on Russia and `OPS_TOKEN_PUBLIC_KEY` on Dubai instead of shared `OPS_JWT_SECRET`.


## Build APK with EAS (no Android Studio needed)

From the project root:

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

This repository is preconfigured so the `preview` APK uses the current split backend over HTTP:

```env
EXPO_PUBLIC_RU_API_URL=http://31.97.115.242:4000
EXPO_PUBLIC_DXB_API_URL=http://31.97.115.242:4001
```

Because the backends are still plain HTTP, Android cleartext traffic is enabled in app config for now. After HTTPS is added, switch these URLs to `https://...` and you can remove cleartext access later.
