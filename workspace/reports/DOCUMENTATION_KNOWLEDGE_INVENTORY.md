# Documentation Knowledge Inventory

> **Purpose:** scrape durable engineering knowledge from session history, audits, plans, and graph output; verify it against current source; promote it into canonical documentation.
> **Not normal navigation:** use `README.md` and `docs/README.md` for current documentation.
> **Lifecycle:** `candidate -> source-verified -> promoted | rejected | superseded`.

## Collection Rules

1. Historical records are evidence, not current truth.
2. Verify every candidate against current source, config, tests, or an operator contract before promotion.
3. Record contradictions and rejected alternatives; do not silently choose the newest prose.
4. Never promote credential values, private identifiers, raw provider responses, or host-sensitive details.
5. Prefer stable owners and symbols over session numbers and line numbers.
6. Keep source/test, clean-checkout, CI, provider, host, deployment, recovery, paper, and live evidence distinct.

## Promotion Ledger

| ID | Candidate knowledge | Historical source | Current evidence to verify | Target canonical doc | Status | Notes |
|---|---|---|---|---|---|---|
| DOC-K1 | The modern Ink dashboard and legacy TUI have separate command models; both must be updated for shared command visibility. | `workspace/BOOTSTRAP.md`; `docs/codebase_tour/05_tui_cli_dashboard.md`; repeated handoff corrections | `backend/cli/sovereign_dashboard.mjs` (`M`); `backend/cli/tui/manifest.js` (`COMMAND_MANIFEST`); CLI/UI parity tests | `docs/modules/cli-tui-api-frontend.md` | candidate | High-frequency historical bug class. Verify current boot/layout routing before promotion. |
| DOC-K2 | The canonical time-series plane is `storage/data/ts`, with binary `SOVT` records and metadata sidecars; old SQLite/data-root claims are obsolete. | `workspace/BOOTSTRAP.md`; data-repair/rollup handoffs; codebase tour module 02 | `shared/lib/market/ts_index_storage.js`; `shared/lib/market/validation.js`; `backend/core/src/data/binary_ts_reader.*`; config and tests | `docs/modules/data-ingestion-ts-index.md`; data-format reference | candidate | Must document append-only segments and immutable research snapshots separately. |
| DOC-K3 | Whole-bin JS materialization and concurrent writers caused real OOM/rename failures; tail readers, buffer-level merge, unique temp paths, and one-writer operation are safety invariants. | Session 25/35/36 handoffs and memory; codebase tour module 02 | `ts_index_storage.js`; `coverage.js`; backfill daemon; source-evidence/deployment profiles; OOM and merge tests | `docs/modules/data-ingestion-ts-index.md`; operations runbook | candidate | Preserve distinction between one process/event-loop and multiple processes/services. |
| DOC-K4 | Provider-chain first-success ordering can silently cap historical depth; deep backfills pin the intended provider. | Session 21/25 handoffs and memory (“TwelveData 5,000-bar trap”) | provider manifests; ingest provider loop; crypto/equity deep-backfill command owners and tests | data ingestion module and provider reference | candidate | Revalidate current provider order and whether the cap still applies to every family. |
| DOC-K5 | Runtime policy is the canonical execution decision; private-paper/cloud/test profiles remain non-executing even with poisoned live inputs. | July recovery/production-readiness reviews; architecture overview | `shared/lib/settings/runtime_policy.js`; CLI/API/MCP consumers and safety tests | `docs/modules/runtime-safety-execution.md` | candidate | State what source tests prove and what requires host/provider/live qualification. |
| DOC-K6 | The internal Polymarket paper ledger is append-only authority; portfolio JSON is a rebuildable projection with checksum/replay/lock semantics. | Session 100 plan/recovery review; architecture overview | `backend/gateway/src/paper_ledger.js`; paper ledger tests; position-sizing owner | runtime safety/execution module; recovery runbook | candidate | Separate internal paper simulation from broker-hosted Alpaca Paper. |
| DOC-K7 | Supabase client objects may be pooled, but authorization decisions must be revalidated per request so revoked tokens do not remain accepted. | 2026-08-09 anti-leak remediation/review | `backend/api/server/services/supabase_client.js`; Supabase route contract | API/auth module | source-verified | Promotable after API module page exists. Do not imply provider acceptance beyond mocked/source contracts. |
| DOC-K8 | Explicit research snapshot input must not be bypassed by native ts-index delegation. | 2026-08-09 anti-leak remediation/review | `backend/cli/commands/research/research_optimization.js`; focused research tests | research/native-core module | source-verified | Document as evidence-selection invariant. |
| DOC-K9 | Research sweep selection is validation-only with one untouched holdout per selected dataset/evaluator winner; output is research-only and non-promotional. | 2026-08-09 sweep remediation | `research_sweep.js`; `research_dataset_catalog.js`; native sweep modules; tests | research/native-core module | candidate | Promotion is blocked until BT-L10-1 history-length-comparability defect is repaired. |
| DOC-K10 | Cross-dataset sweep fitness currently favors longer validation histories and cannot yet truthfully identify the best symbol/timeframe across heterogeneous depths. | `workspace/DEV_REVIEW.md` BT-L10-1; 2026-08-09 handoff | native evaluator/scheduler and controlled unequal-history reproducer | research/native-core module; known limitations | source-verified | Do not present current sweep rankings as comparable global winners. |
| DOC-K11 | Test-integrity scanning currently loses C++ coverage on a clean tree and misses cache/load substitutions. | `workspace/DEV_REVIEW.md` BT-L10-2 | `scripts/dev/audit_test_integrity.js`; scanner tests/probes | testing reference / known limitations | source-verified | Must remain visible until fixed; a passing 197/0 result is not full anti-cheating proof. |
| DOC-K12 | Exact-image/source lineage, one-writer deployment, backup/replay parity, rollback, restart, and soak are separate qualification gates. | July host/deployment handoffs, source-evidence plans, DEV_REVIEW | deployment profiles; updater; source-evidence verifier; backup/heartbeat owners | monitoring/deployment/recovery module and runbooks | candidate | Avoid copying host addresses, image IDs, credentials, or dated runtime state into canonical architecture. |
| DOC-K13 | The docs RAG index previously defaulted to `docs` plus all `workspace` Markdown, allowing session/history nodes to dominate ordinary lookup. | graph report god nodes; documentation audit | `shared/lib/ai/docs_rag_indexer.js`; `tests/scripts/tools/docs_rag.test.js`; documentation audit | `docs/modules/documentation-retrieval.md`; `atlas.protocol.documentation.corpus-selection`; related retrieval Atlas records | promoted | Default lookup is manifest-selected canonical/supporting docs; historical/all are explicit. Working-tree source/test proof over `9fea4a90`; committed-archive proof remains open. |
| DOC-K14 | Canonical docs contain obsolete planned/inactive claims and paths, while the codebase tour itself warns they can mislead. | `workspace/BOOTSTRAP.md`; `docs/codebase_tour/00_START_HERE.md` | current README, architecture overview, source tree, route/command/config registries | docs hub and Batch 2 canonical repairs | source-verified | Do not promote old capability/test counts. Rebuild each contract from its owner. |
| DOC-K15 | Generated dashboard output is served by the API; source changes require a frontend build before runtime reflects them. | codebase tour module 06; deployment reviews | `backend/api/app.js`; `Frontend/dashboard/src`; build and served-dashboard contracts | CLI/TUI/API/frontend module; frontend how-to | candidate | Separate source correctness from generated artifact and deployed runtime evidence. |
| DOC-K16 | Native core can operate with optional ONNX support; output must identify whether real runtime or deterministic baseline served inference. | ML sessions and codebase tour module 01 | native CMake flags; ONNX model owner; parity tests and serving manifest | research/native-core module; native build reference | candidate | Revalidate current fallback behavior and shipped model artifacts before promotion. |

## Priority Mining Queue

1. Runtime safety/execution and paper-ledger authority.
2. Data ingestion, ts-index format, one-writer/OOM/concurrency recovery.
3. Research/native protocol, snapshot selection, sweep limitations.
4. CLI/TUI/API/frontend dispatch and dual-manifest ownership.
5. Monitoring, deployment, source evidence, backup/recovery/rollback.
6. MCP and persistent automation boundaries.

## Rejected Promotion Patterns

- Do not copy dated test totals into current docs.
- Do not use “production-ready,” “live,” or “deployed” without naming the exact evidence layer.
- Do not treat generated graph communities as architecture ownership without source verification.
- Do not promote credentials, wallet/account identifiers, host addresses, or provider response bodies.
- Do not turn a historical workaround into a permanent rule until its current owner and caller behavior are verified.
- Do not use session recency alone to resolve contradictions.

## Next Update

During each module-documentation batch:

1. select candidates for that domain;
2. verify source owners and tests;
3. mark candidates `source-verified`, `rejected`, or `superseded`;
4. write the canonical page;
5. mark successfully published facts `promoted` and link the destination;
6. run documentation link/path and focused behavior gates.
