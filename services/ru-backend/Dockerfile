FROM node:22-alpine AS build
WORKDIR /workspace/services/ru-backend

COPY services/ru-backend/package.json services/ru-backend/package-lock.json ./
RUN npm ci

COPY services/ru-backend/tsconfig.json ./
COPY services/ru-backend/src ./src
COPY services/ru-backend/migrations ./migrations
COPY services/shared ../shared
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /workspace/services/ru-backend

ENV SERVICE_REGION=ru
ENV PORT=4000

COPY services/ru-backend/package.json services/ru-backend/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /workspace/services/ru-backend/dist ./dist
COPY --from=build /workspace/services/ru-backend/migrations ./migrations
COPY --from=build /workspace/services/shared ../shared

EXPOSE 4000
CMD ["node", "dist/server.js"]
