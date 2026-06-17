FROM node:22-alpine AS build
WORKDIR /workspace/services/dubai-backend

COPY services/dubai-backend/package.json services/dubai-backend/package-lock.json ./
RUN npm ci

COPY services/dubai-backend/tsconfig.json ./
COPY services/dubai-backend/src ./src
COPY services/dubai-backend/migrations ./migrations
COPY services/shared ../shared
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /workspace/services/dubai-backend

ENV SERVICE_REGION=dubai
ENV PORT=4001

COPY services/dubai-backend/package.json services/dubai-backend/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /workspace/services/dubai-backend/dist ./dist
COPY --from=build /workspace/services/dubai-backend/migrations ./migrations
COPY --from=build /workspace/services/shared ../shared

EXPOSE 4001
CMD ["node", "dist/server.js"]
