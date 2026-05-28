# Sovereign Trading Platform - Architecture (Domain-Based)

## Domain Architecture

### 1. `backend/` (Core Logic & Services)
- `core/`: High-performance C++ trade engine and ML inference (formerly `native/cpp_core`).
- `api/`: Express-based backend for the dashboard (formerly `apps/api`).
- `gateway/`: Execution gateway and risk bridge (formerly `apps/gateway`).
- `cli/`: Sovereign TUI/CLI interface (formerly `apps/cli` + `scripts/cli`).
  - `tui/`: Interactive terminal engine (formerly `scripts/tui_cli`).
- `scripts/`: Backend-specific operational logic.
  - `data_ops/`: Ingestion, pruning, and backup scripts.
  - `verification/`: MT5/Provider data verification (formerly `scripts/api_data_verify`).

### 2. `frontend/` (Presentation Layer)
- `dashboard/`: Vite-based React/Angular frontend (formerly `web_page`).

### 3. `shared/` (Common Logic)
- `lib/`: Common JS/TS libraries (formerly `scripts/lib`).
- `packages/`: Modular shared packages.

### 4. `infra/` (System Infrastructure)
- `docker/`: Container configurations.
- `deployment/`: K8s/Heroku/Terraform scripts.
- `scripts/dev_ops/`: Build, setup, and deployment automation.

### 5. `storage/` (Persistence Layer)
- `data/`: Local JSON/CSV data cache.
- `backups/`: Database JSON snapshots.
- `logs/`: Application and system logs.
- `models/`: Trained ML weights and ONNX artifacts.

### 6. `tests/` (Verification Layer)
- `scripts/`: Node.js contract and regression tests.
- `cpp_core/`: Native C++ unit tests.
- `web/`: UI/Frontend smoke tests.
- `fixtures/`: Test data and snapshots.

## Truth Map
- **Source of Truth:** Supabase (Remote).
- **Execution Engine:** C++ (Local Native).
- **Control Interface:** CLI/TUI (Local JS).
