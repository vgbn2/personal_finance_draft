# Canonical Dockerfile lives at infra/docker/Dockerfile.
# This root copy exists for tools that expect Dockerfile at repo root (e.g. Heroku, Railway).
# Keep in sync with infra/docker/Dockerfile.

FROM node:22-bullseye

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY Frontend/dashboard/package*.json ./Frontend/dashboard/
RUN cd Frontend/dashboard && npm ci --ignore-scripts

COPY Frontend/ ./Frontend/
RUN cd Frontend/dashboard && npm run build

COPY . .

RUN mkdir -p backend/core/build \
    && cd backend/core/build \
    && cmake .. -DCMAKE_BUILD_TYPE=Release \
    && make -j$(nproc)

EXPOSE 8787

ENV NODE_ENV=production \
    SOVEREIGN_WEB_HOST=0.0.0.0 \
    SOVEREIGN_WEB_PORT=8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/api/app.js"]
