# Bio-Quant Project State (Phase 1.2 Hardening)

## Current Position
- **Phase**: 1.2 Hardening & User Experience
- **Status**: PAUSED at 2026-05-08 21:04
- **Last Milestone**: 1.1 Deployment & Heroku Stabilization (v21)
- **Deployment**: LIVE (diabetic-telegram-notification)

## Phase 1.2 Progress
- [ ] 01-PLAN: Context & Data Integrity (W1)
- [ ] 02-PLAN: Persistence Hardening (W2)
- [ ] 03-PLAN: User Interaction & Interaction Safety (W3)
- [/] 04-EXEC: Local Storage & C: Disk Optimization (W4)
- [x] 05-EXEC: Confidence Score Hardcap Fix (Clinical Audit)
- [/] 06-EXEC: Auto-Review Feedback Feature (UX Hardening)

## Infrastructure Status
- **Stack**: Heroku-24 (Python 3.11)
- **Slug Size**: 862MB (Stable but requires optimization)
- **Disk Storage**: Local optimization in progress (Cleaning ghost repos and developer caches)
- **Database**: MongoDB (Live) / SQLite (Ephemeral - Wiring to Postgres in Wave 2)
- **Monitoring**: Worker dyno active; polling every 300s.

## Current Learnings (v21)
- Windows PowerShell UTF-16 redirection breaks Heroku builds.
- CNN requires manual context backfilling from MongoDB after reboots.
- Slug optimization requires standardizing on CPU-only PyTorch wheels.

## Next Steps
1. Complete empirical validation of the Auto-Review Feedback feature (user to run `scripts/troubleshooting/validate_auto_review.py`).
2. Optimize Heroku requirements.txt to reduce slug size < 500MB.
3. Implement MongoDB Context Injection for the CNN.

## Context Health: State Dump

**Triggered**: 2026-05-17
**Reason**: Extended back-and-forth session; user invoked Context Health Monitor.

### Current Phase
Separate C-first port and hardening of `hyperglycemia-faint-predictor` into `hyperglycemia-c`.

### Current Task
The C/C++ rewrite has been implemented in `hyperglycemia-c`, using C11 only so far. The latest work focused on completing live ingestion behavior, audit/logging gaps, docs parity, and runtime checks.

### Last Action
Finalized and verified:
1. `src/app/simulation.c` live loop now returns nonzero when no readings are processed.
2. `src/ingestion/ingestion.c` maps real HTTP/connect failures to `IO` and reserves `UNSUPPORTED` for builds without an HTTP backend.
3. Docs were updated in `README.md`, `ARCHITECTURE.md`, `ARCHITECTURE_MAP.md`, `STACK.md`, and `docs/REPOSITORY_STRUCTURE.md`.

### Validation Evidence
1. Strict GCC build passed with `-std=c11 -Wall -Wextra -Werror`.
2. `build\test_core.exe` passed with output `test_core: ok`.
3. GCC `-fanalyzer` passed.
4. CLI modes passed: `normal`, `crash`, `faint`, `csv`, `chart`.
5. Deliberately bad Nightscout live endpoint failed loudly with exit code `6`, `nightscout ingestion error: IO`, and `live error: no readings processed`.

### Known Remaining Gaps
1. SQL/Mongo production persistence is not linked because native database headers/libs were not available locally.
2. ONNX/Torch CNN inference is not linked because ONNX Runtime/Torch native headers/libs were not available locally.
3. Real BLE heart-rate characteristic streaming is not implemented; current support is CSV parsing, mock cardiac context, and Windows Bluetooth radio probing.

### Recommended Next Steps
1. Pause or start a fresh session before further major changes.
2. If continuing, choose one integration target: database adapter, ONNX Runtime model adapter, or BLE heart-rate stream.
3. Install the relevant native SDK first, then wire the existing C interfaces to it.

### Files Involved
- `hyperglycemia-c/src/app/simulation.c` - live loop and app runners.
- `hyperglycemia-c/src/ingestion/ingestion.c` - CSV, simulation, Nightscout parsing/fetching.
- `hyperglycemia-c/src/net/http_client.c` - WinHTTP GET/POST transport.
- `hyperglycemia-c/src/telegram_bot/notifier.c` - console/file/Telegram notifier.
- `hyperglycemia-c/src/storage/storage.c` - CSV audit sink and rotation.
- `hyperglycemia-c/tests/test_core.c` - deterministic C checks.
