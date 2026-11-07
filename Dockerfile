# Keep this root compatibility copy byte-identical to infra/docker/Dockerfile.

ARG SOVEREIGN_SOURCE_REVISION=unverified
ARG SOVEREIGN_SOURCE_TREE=unverified

FROM golang:1.24-alpine AS go-builder
WORKDIR /src
COPY backend/go/go.mod ./
RUN go mod download 2>/dev/null || true
COPY backend/go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /sovereign-feedd ./cmd/sovereign-feedd

FROM alpine:3.21 AS feedd-runtime
COPY --from=go-builder /sovereign-feedd /usr/local/bin/sovereign-feedd
ENTRYPOINT ["/usr/local/bin/sovereign-feedd"]

FROM node:22-bookworm AS frontend-builder
WORKDIR /src
COPY frontend/dashboard/package*.json ./frontend/dashboard/
RUN cd frontend/dashboard && npm ci --ignore-scripts
COPY frontend/dashboard ./frontend/dashboard
RUN cd frontend/dashboard && npm run build

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

COPY backend/execution/package*.json ./backend/execution/
RUN cd backend/execution && npm ci --ignore-scripts --omit=dev

COPY . .
COPY --from=frontend-builder /src/build/dashboard ./build/dashboard

RUN cmake -S backend/cpp_core -B backend/cpp_core/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON \
    && cmake --build backend/cpp_core/build --parallel --target sovereign_wealth

FROM node:22-bookworm-slim AS runtime

ARG SOVEREIGN_SOURCE_REVISION
ARG SOVEREIGN_SOURCE_TREE

LABEL org.opencontainers.image.revision="${SOVEREIGN_SOURCE_REVISION}" \
      io.sovereign.source-tree="${SOVEREIGN_SOURCE_TREE}" \
      io.sovereign.build-contract="1"

ENV NODE_ENV=production \
    SOVEREIGN_WEB_HOST=0.0.0.0 \
    SOVEREIGN_WEB_PORT=8787 \
    SOVEREIGN_BACKEND_BIN=/app/backend/cpp_core/build/sovereign_wealth

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/api ./backend/api
COPY --from=build --chown=node:node /app/frontend/cli-tui ./frontend/cli-tui
COPY --from=build --chown=node:node /app/backend/execution ./backend/execution
COPY --from=build --chown=node:node /app/backend/mcp_server ./backend/mcp_server
COPY --from=build --chown=node:node /app/backend/scripts ./backend/scripts
COPY --from=build --chown=node:node /app/backend/cpp_core/build ./backend/cpp_core/build
COPY --from=build --chown=node:node /app/build/dashboard ./build/dashboard
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/configs ./configs
COPY --from=build --chown=node:node /app/tools ./tools
COPY --from=build /usr/lib/x86_64-linux-gnu/libgomp.so.1* /usr/lib/x86_64-linux-gnu/

RUN mkdir -p storage/data storage/logs storage/runtime \
    && chown -R node:node storage

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/api/app.js"]
