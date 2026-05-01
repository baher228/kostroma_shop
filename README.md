# KGB

This project has:

- an Expo frontend in the repository root
- a Node.js/TypeScript backend in `backend/`
- PostgreSQL started with Docker

## Prerequisites

- Node.js and npm
- Docker Desktop

## Quick start

1. Install dependencies:

```bash
npm install
npm --prefix backend install
```

2. Start PostgreSQL and the backend in Docker:

```bash
npm run backend:docker:up
```

3. Set the frontend API URL in `.env`.

Example:

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:4000
```

Use your machine's local network IP if you open the Expo app on a phone.  
If you run the Android emulator, the frontend also has a fallback for `http://10.0.2.2:4000`.

4. Start the frontend:

```bash
npm start
```

You can also use:

```bash
npm run android
npm run ios
npm run web
```

## Default login

- Username: `manager`
- Password: `manager123`

## Useful commands

Start only the database:

```bash
npm run db:up
```

Run the backend locally instead of Docker:

```bash
npm run backend:dev
```

Run backend migrations manually:

```bash
npm run backend:db:migrate
```

View backend and database logs:

```bash
npm run backend:docker:logs
```

Stop Docker services:

```bash
npm run backend:docker:down
```

## Ports

- Backend API: `4000`
- PostgreSQL: `5433` on your machine
