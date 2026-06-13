## Checklist implementation - 2026-06-13 session 26e

Implemented all correlation input checklist items except the data-refresh decision for full Layer1
overlap. `backend/cli/commands/tools/backend.js` now supports test-injected ts-index/history paths,
emits human-readable preflight coverage reports, and supports `--drop-non-overlap`. The TUI manifest
exposes the same flag. Added `tests/scripts/tests/backend_correlation_preflight.test.js` for:
no-overlap without cache fallback, blocker dropping, C++ matrix consumption from a focused snapshot,
and human output coverage.

Evidence:
- Layer1 5m without `--drop-non-overlap`: `ok:false`, `engine:"sovereign_cli_preflight"`,
  `input: storage/data/ts`, blockers `MATICUSDT`, `POLUSDT`.
- Layer1 5m with `--drop-non-overlap`: `ok:true`, C++ matrix, labels exclude `MATICUSDT/POLUSDT`.
- Gates: syntax checks for backend tools + TUI manifest; new preflight test `4/4`; combined
  backend/TUI/correlation slice `30/30`; backfill regression `3/3`.

