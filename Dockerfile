# Keep this root compatibility copy byte-identical to infra/docker/Dockerfile.

ARG SOVEREIGN_SOURCE_REVISION=unverified
ARG SOVEREIGN_SOURCE_TREE=unverified

FROM node:22-bookworm AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY backend/api/package*.json ./backend/api/
RUN cd backend/api && npm ci --ignore-scripts --omit=dev

COPY backend/gateway/package*.json ./backend/gateway/
RUN cd backend/gateway && npm ci --ignore-scripts --omit=dev

COPY Frontend/dashboard/package*.json ./Frontend/dashboard/
RUN cd Frontend/dashboard && npm ci --ignore-scripts

COPY . .
RUN cd Frontend/dashboard && npm run build

RUN cmake -S backend/core -B backend/core/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON \
    && cmake --build backend/core/build --parallel --target sovereign_wealth

FROM node:22-bookworm-slim AS runtime

ARG SOVEREIGN_SOURCE_REVISION
ARG SOVEREIGN_SOURCE_TREE

LABEL org.opencontainers.image.revision="${SOVEREIGN_SOURCE_REVISION}" \
      io.sovereign.source-tree="${SOVEREIGN_SOURCE_TREE}" \
      io.sovereign.build-contract="1"

ENV NODE_ENV=production \
    SOVEREIGN_WEB_HOST=0.0.0.0 \
    SOVEREIGN_WEB_PORT=8787 \
    SOVEREIGN_BACKEND_BIN=/app/backend/core/build/sovereign_wealth

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/api ./backend/api
COPY --from=build --chown=node:node /app/backend/cli ./backend/cli
COPY --from=build --chown=node:node /app/backend/gateway ./backend/gateway
COPY --from=build --chown=node:node /app/backend/mcp_server ./backend/mcp_server
COPY --from=build --chown=node:node /app/backend/scripts ./backend/scripts
COPY --from=build --chown=node:node /app/backend/core/build ./backend/core/build
COPY --from=build --chown=node:node /app/Frontend/dashboard/dist ./Frontend/dashboard/dist
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/config ./config
COPY --from=build --chown=node:node /app/scripts/data_ops/backfill_20_years.js ./scripts/data_ops/backfill_20_years.js

RUN mkdir -p storage/data storage/logs storage/runtime \
    && chown -R node:node storage

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/api/app.js"]
