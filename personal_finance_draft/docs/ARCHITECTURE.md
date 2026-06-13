# Sovereign Trading Platform - Architecture (Domain-Based)

> Canonical folder and file ownership map: [engineering/codebase_org.md](engineering/codebase_org.md). This page is the short domain overview; do not duplicate detailed path ownership here.

## Domain Architecture

### 1. `backend/` (Core Logic & Services)
- `core/`: High-performance C++ trade engine, indicators, data inspection, and ML inference boundary.
- `api/`: Local Node API bridge and dashboard server.
- `gateway/`: Execution gateway and risk bridge.
- `cli/`: Sovereign CLI/TUI interface.
  - `tui/`: Interactive terminal engine and command manifest.
- `scripts/`: Backend-specific operational logic.
  - `dev/`: development probes, fixture refresh, and toolchain checks.

### 2. `Frontend/` (Presentation Layer)
- `dashboard/src/`: active React/Vite dashboard source.
- `dashboard/dist/`: generated build artifact served by `backend/api/app.js`.

### 3. `shared/` (Common Logic)
- `lib/`: Common JS libraries used by CLI, API, scripts, and MCP surfaces.
- `lib/providers/`: canonical provider/history fetcher layer.

### 4. `infra/` (System Infrastructure)
- Deployment descriptors and infrastructure manifests.

### 5. `storage/` (Persistence Layer)
- `data/`: canonical local runtime cache and time-series data plane.
- `data/models/`: model comparison and strategy-grade artifacts.

### 6. `tests/` (Verification Layer)
- `scripts/`: Node.js contract and regression tests.
- `cpp_core/`: native C++ unit tests.
- `web/`: UI/Frontend smoke tests.
- `fixtures/`: Test data and snapshots.

## Truth Map
- **Current status anchor:** `workspace/STATE.md`.
- **Folder ownership map:** `docs/engineering/codebase_org.md`.
- **Source of Truth:** local validated cache now; Supabase remains gated/planned for persistence surfaces.
- **Execution Engine:** C++ (Local Native).
- **Control Interface:** CLI/TUI (Local JS).
