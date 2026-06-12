# bookworm ships GCC 12 — required for std::from_chars(double) used by the C++ core.
# bullseye's GCC 10 only supports integer from_chars and fails the core build.
FROM node:22-bookworm

# Build tools for C++ core and native Node modules
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Layer 1: root dependencies (cached unless package.json changes) ---
COPY package*.json ./
RUN npm ci --ignore-scripts

# --- Layer 1b: backend/api deps (web service entrypoint requires its own
# express/socket.io/ejs/dotenv — it's a standalone sub-package, not hoisted
# to the root node_modules) ---
COPY backend/api/package*.json ./backend/api/
RUN cd backend/api && npm ci --ignore-scripts --omit=dev

# --- Layer 1c: backend/gateway deps (gateway service runs gateway/src/index.ts
# via ts-node — needs its own alpaca/polymarket/supabase/ethers packages) ---
COPY backend/gateway/package*.json ./backend/gateway/
RUN cd backend/gateway && npm ci --ignore-scripts --omit=dev

# --- Layer 2: Frontend build (cached unless Frontend/ changes) ---
COPY Frontend/dashboard/package*.json ./Frontend/dashboard/
RUN cd Frontend/dashboard && npm ci --ignore-scripts

COPY Frontend/ ./Frontend/
RUN cd Frontend/dashboard && npm run build

# --- Layer 3: Full source copy ---
COPY . .

# --- Layer 4: C++ core build ---
# Build only the production binary (skip test targets — they don't belong in a
# runtime image and pull in test-only code). Make is a single-config generator,
# so the binary lands at backend/core/build/sovereign_wealth (no Release/ subdir).
RUN mkdir -p backend/core/build \
    && cd backend/core/build \
    && cmake .. -DCMAKE_BUILD_TYPE=Release -DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON \
    && make -j$(nproc) sovereign_wealth

# --- Runtime ---
EXPOSE 8787

ENV NODE_ENV=production \
    SOVEREIGN_WEB_HOST=0.0.0.0 \
    SOVEREIGN_WEB_PORT=8787 \
    # Make's single-config layout differs from MSVC's build/Release/; point the
    # Node binary discovery (shared/lib/paths.js) straight at the built binary.
    SOVEREIGN_BACKEND_BIN=/app/backend/core/build/sovereign_wealth

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/api/app.js"]
