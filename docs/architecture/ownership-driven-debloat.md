# Ownership-driven controlled debloating

The goal is fewer unnecessary implementations and navigation hops, not a folder-renaming score. Deletion and merging are desired outcomes when justified by current behavior, consumers, build/registration and packaging evidence.

Use-case family → domain responsibility → module/folder → cohesive file → function is an ownership navigation model. Dependencies form a graph; shared behavior can support multiple use cases while retaining one canonical owner. Function kind (validation/storage/presentation) is a separate classification axis from domain ownership (orders/market data/research). Do not collect every validator into a generic module merely because it shares a kind.

## Disposition

- Delete genuinely unused implementations, redundant internal forwarders and duplicate owners after updating consumers.
- Merge small fragments only when they share cohesive responsibility and compatible side-effect/failure contracts.
- Move useful misplaced behavior to its proved owner; remove abandoned scaffolding rather than preserve it for later.
- Do not merge a dead orphan merely to retain it; deletion is preferable when no behavior is needed.
- Keep distinct mathematics, authorization, persistence and failure behavior distinct even when names or shapes match.
- Unknown consumers require targeted investigation, not a permanent blanket prohibition on deletion.

Each candidate records current owner, proposed owner, use cases, function kind, callers/build/packaging evidence, disposition, uncertainty, and focused verification. AI naming is advisory; three louder names do not establish the correct owner or justify a deletion.

## Proof and reverse cases

Test replacement behavior and the inverse: canonical entrypoints work while retired paths are absent; permitted requests work while denied requests remain denied; each original move has exactly one intact destination and no collision overwrites unrelated content. Preserve fixtures and assertions. CI is a backstop, not evidence until an actual run is observed, and cannot establish unknown external consumers.

Report actual files/lines removed, redundant owners/forwarders eliminated, and checks run. Path-only moves are structural changes, not claimed code reduction. No arbitrary deletion quota or new framework is needed.

## Verified first deletion

Removed placeholder `backend/cpp_core/src/utils/.../json_io.hpp`: main read its complete two-line contents (`//huh` and blank line), with no declaration or implementation. Scoped search across backend/frontend/shared/tests/tools/infra and root CMake/package manifests found no references. This removes one placeholder file, not a domain capability. Required alias/public-header candidates remain separate. Restore only the two-line placeholder if a concrete packaging consumer is later established; no repository reset is appropriate.

Subsequent temporary native build and all 35 CTests passed after approved canonical-path reconciliation. This verifies the exercised build/test contracts after deletion, not the absence of unknown external packaging consumers. Root tooling/execution moves are counted separately and not presented as LOC reduction.

## Controlled-debloat execution 2026-11-07

Removed five repository-internal files: unused OHLCV/portfolio alias headers, the shadowing `backend/cpp_core/src/.../trading_system.hpp` forwarder, duplicate ML sentiment factory, and unreferenced API synchronous cache. Native CMake now selects `backend/cpp_core/src/general_ingestion/sentiment_ingestion.cpp`; the public `backend/cpp_core/include/trading_system.hpp` and active `ttl_cache.js` remain. Polymarket account Position imports/re-exports the identical execution-owned type, preserving both import surfaces without another runtime dependency.

Canonical owner/inverse-path and real-cache expiry checks extend the existing consumer contract. Typecheck, API, data and23seam checks pass; focused C++ syntax checks pass. A fresh full native build is **not verified**: the pre-existing CMake `src/risk/` source entries name an absent directory (actual `risk_management/`). Existing35CTest binaries passing is not proof of this source state. Structure also retains the three Git-index failures and a documentation-owner failure for that risk relocation.

Keep strategy YAML identities, the two distinct cost models and specialized atomic writer semantics. Research/API→CLI and tooling→CLI dependencies remain mapped candidates, not completed migrations. Full execution dispositions and exact source patches are in `workspace/plans/2026/11/07-CONTROLLED_DEBLOAT_MASS_IMPLEMENT.md`. No staging, CI, deployment or external-provider proof.

### Manual folder organization follow-up

User-owned native folder moves are retained. Their consumers now reference `cryptographic/`, `statistical_analysis/` (including `correlation/` and `grading_metrics/`), `technical_indicators/`, `risk_management/position_sizing/`, `candle_parser/` and `backtest/replay/`. CMake source lists and documentation-owner metadata follow these actual locations. Broken moved includes use existing src-root include lookup, avoiding depth-sensitive `../` chains. No mathematical implementation or test assertion changed.

Fresh isolated configure/build and35CTest checks pass at `/tmp/opencode/manual-review-native`; source/include/documentation contracts22/22pass. This supersedes the earlier full-build risk-path blocker, not the unstaged Git-tracking limitations. The existing consumer contract now checks explicit CMake source existence and quoted include resolution for current native source/test roots; it does not prove platform-specific/system include availability.

In addition, formula/functional-mapping/family placement renames are applied without forwarding shims:
- `backend/cpp_core/src/portfolio/.../optimizer.hpp` → `backend/cpp_core/src/portfolio/weight_normalizer.hpp` (`normalizeWeights` simplex projection + `portfolioTurnover` L1 distance; no optimization solver).
- `backend/cpp_core/src/portfolio/kelly_sizing.{hpp,cpp}` → `backend/cpp_core/src/risk_management/position_sizing/kelly_sizer.{hpp,cpp}` (bounded Kelly fraction + `sizePosition` wrapper unified under `position_sizing/`).
- `frontend/cli-tui/commands/tools/backend*.js` retained in place because `backend.js` is the root `sovereign backend` command router and `backend_{chart,correlation,integrity,visualize}.js` are its subcommand delegates (`api_transport` / `presentation_ui`).

### CLI responsibility review

Backend-targeted CLI adapters/renderers are valid frontend code; their filename alone does not establish misplaced ownership. Read-only bounded review found these actual seams:

| Surface | Responsibility / disposition |
|---|---|
| `frontend/cli-tui/lib/run_trade_gateway.js:16` | Stale fallback referenced nonexistent frontend/gateway. Corrected to actual backend/execution source. Bootstrap resolution test failed before/passed after; registration/entrypoint dispatch isolated from broker loading. Actual ts-node execution not proved. |
| `frontend/cli-tui/lib/auth.js:13–76` | Shared PIN primitives and terminal prompting mixed; API order/liquidation/kill-switch routes import verifyPin. Extract primitive only to shared/auth in a dedicated auth-parity batch. |
| `commands/research/{bias,scorecard,combined}.js` | API workers/snapshots/signals/promotion import domain calculations, cached data/config loaders and research orchestration. Existing shared/analysis/services is domain owner; retain parsing/rendering in CLI. Formula equivalence not proved. |
| `frontend/cli-tui/commands/strategies/options_bot_runner.js` | Reusable cycle reads broker state, applies risk/sizing and dispatches orders. Execution/runtime ownership candidate; keep command flags/rendering frontend. No live cycle exercised. |
| `frontend/cli-tui/commands/data/data_rollup.js` | Derived candle aggregation, index rebuild and dead-marker persistence. Shared/data ownership candidate; preserve codec/rebuild semantics and CLI progress separately. |
| `frontend/cli-tui/commands/data/backfill_daemon.js` | Provider scheduling, concurrency/pacing, lock/shutdown/heartbeat/status persistence mixed with command UX. Separate service-parity batch, not a blind move onto run_loop. |
| `frontend/cli-tui/commands/operational/portfolio_monitor.js` | Portfolio scope/peak/drawdown/exposure policy mixed with monitor UX; shared risk/runtime extraction candidate, not equivalent to existing prop-firm policy by name. |
| `frontend/cli-tui/commands/tools/backend_correlation.js` | Data synthesis/alignment policy mixed with legitimate native command adapter; lower-priority shared analysis separation. |

Keep native launchers, chart rendering, progress, argument translation and terminal watch controls where presentation-specific. No blanket `backend*.js` moves. Full source evidence/caller/verification limits in temporary structured review `/tmp/opencode/cli-boundary-review.json`; this table preserves actionable conclusions if temporary output expires. These extractions remain unimplemented and require source revalidation, exact patches and domain-specific regression gates; the review itself does not prove runtime/security correctness.
