# Current Blast-Through Checklist

This checklist tracks the current state of the active repo surface, not the earlier setup-era snapshot.

## 1. Active Zones

- [x] `scripts/` is functioning as the primary local CLI and ingestion surface.
- [x] `cpp_core/src/` now contains real implementations for the major feature, portfolio, execution, research, and data seams.
- [x] `web/` and `web_page/` now read as an active local dashboard/API bridge.
- [x] `docs/` describe the current prototype instead of a pure setup shell.
- [x] `config/` labels the app as an active prototype.
- [x] Strategy-plan fixtures and CLI help no longer advertise a setup-only strategy file.
- [x] Quote-feed imports now report usable row counts and partial rejection reasons.
- [x] TUI manifest routing is directly covered through `findCommandSpec()`.
- [x] Signal/backtest dashboard hydration is backed by current `/api/signal` and `/api/backtest` surfaces.
- [x] Served dashboard HTML is route-contract tested against current local API endpoints and retired signal route drift.
- [x] GitHub Actions now installs locked Node dependencies, checks active JS entrypoints, type-checks the execution gateway, and runs the full Node suite.
- [x] ONNX/Kronos default builds now use an explicit deterministic baseline while external ONNX Runtime linkage is opt-in.
- [x] Local native readiness is visible through `npm run native:doctor` and covered by the Node suite.
- [x] `scripts/tests/` contains only test files; developer probes/utilities live under `scripts/dev` and are covered by focused utility tests.
- [x] JavaScript and C++ model registries are parity-checked by `npm run models:parity` and direct native `model_registry_test` compile/run evidence.
- [x] `workspace/STATE.md` remains the durable audit anchor.

## 2. Current Grade Snapshot

- `repo-root`: B
- `scripts/`: B+
- `cpp_core/src/`: B+
- `web/ + web_page/`: B+
- `docs/`: B+
- `workspace/`: B
- `config/`: B+
- `.github/`: B
- `test/`: B+

## 3. Remaining Cleanup

- [ ] Promoted ONNX/Kronos runtime inference still needs real ONNX Runtime calls behind the opt-in linkage flag.
- [ ] Local CMake configure/build/CTest verification is still unavailable until CMake and CTest are installed on PATH.
- [ ] The append-only workspace history still contains historical setup-era wording.
- [ ] Some workflow and source-tree polish remains, but the repo is now past the largest empty-shell debt.

## 4. Verification Notes

- Active source scans now come back clean for the major legacy markers in the live areas.
- Recent graph refreshes continue to show the code graph growing as the active modules are filled in.
- Latest verified graph refresh after quote-import telemetry: `2369` nodes, `3412` edges, `318` communities.
- Latest verified graph refresh after CI workflow alignment: `2370` nodes, `3413` edges, `320` communities.
- Latest verified graph refresh after ONNX/Kronos dependency gating: `2374` nodes, `3417` edges, `321` communities.
- Latest verified graph refresh after native toolchain preflight: `2388` nodes, `3433` edges, `327` communities.
- Latest verified graph refresh after test/dev utility hygiene: `2414` nodes, `3464` edges, `320` communities.
- Latest verified graph refresh after model registry parity guard: `2427` nodes, `3480` edges, `325` communities.
- Latest verified graph refresh after served dashboard contract guard: `2435` nodes, `3489` edges, `320` communities.
