# Next Session Goal

## 2026-08-15 Native C++ Stress Testing Migration & hpdesk Paper Recovery

1. **Native C++ Monte Carlo & Walk-Forward Migration**:
   - Migrate the 200-run Monte Carlo stress testing (`monteCarloStress`) and 3-fold Walk-Forward optimization directly into the native C++ core engine (`backend/core/src/backtest/`).
   - Eliminate Node.js V8 JSON serialization and temporary disk IPC overhead to achieve sub-second full-suite CLI backtests (< 200ms vs current 60s-150s).

2. **hpdesk Paper-Auth & Provenance Reconciliation**:
   - Reconcile exact Git provenance on `vgbn-server@hpdesk` without overwriting host-local `.env` or storage directories.
   - Run a redacted Paper-only `doctor alpaca --paper-auth` diagnostic on `hpdesk` to root-cause Paper quote HTTP 401 errors.

Immediate next action:
- Begin session with `session-orchestrator` boot, review C++ backtest engine structure (`backend/core/src/backtest/`), and implement native C++ Monte Carlo stress testing.

## 2026-08-15 Codebase, Test, and Docs Management for Junk Minimization

1. **Codebase, Test, & Docs Tidiness Sweep**:
   - Focus next session entirely on codebase maintenance, test organization, and documentation tidiness to minimize junk accumulation across CLI agents.
   - Enforce date-partitioned log rotation (`workspace/handoff/YYYY/MM/`) and clean domain section documentation (`docs/sections/<domain>/`).
   - Run automated contract gates (`npm run test:structure`, `node scripts/dev/audit_documentation.js`, `node scripts/dev/check_hygiene.js`).
   - Rebuild AST knowledge graph (`/home/vgbn1/.local/bin/graphify update .`).

Immediate next action:
- Begin session with `session-orchestrator` boot, review active tests/docs contracts, and execute codebase maintenance & junk minimization.

## 2026-08-15 Session Closeout — Deep Codebase Junk & Mirror Cleanup

1. **User activates the refined loop**:
   - Start with the baseline/classification batch; do not begin by generating random pages.
   - Preserve `docs/` as durable engineering knowledge and `workspace/` as operational state/evidence.
   - Do not use subagents unless the user explicitly changes that rule.

2. **Freeze the measured baseline**:
   - `docs/`: 115 Markdown files / 12,636 lines; 20 docs Markdown paths manifest-registered; 95 unclassified.
   - `workspace/`: 169 Markdown files / 29,667 lines; root, plans, and handoffs own 82.0% of lines; 15 non-control root files.
   - Classify the 11 raw link findings before changing them; distinguish current defects, historical paths, and parser false positives.
   - Treat duplicate names and mirrors as candidates only; none are byte-identical deletion proof.

3. **Establish the loop contract before scheduling**:
   - Proposed canonical root: `docs/sections/<domain>/<section-id>/`.
   - Use reproducible entropy-weighted selection from clean tracked production files.
   - Exclude generated/vendor/test paths, current dirty files, already-covered owners, and all open P0/P1 surfaces.
   - Limit each iteration to one section, five files, and 800 net lines; create only applicable files.
   - Reconcile existing owners before adding prose; stop on overlap, missing focused tests, required deletion approval, or any failed gate.

4. **Run one reviewed pilot before enabling recurrence**:
   - Record candidate scores, seed, selected source, ownership map, existing docs, and exclusions.
   - Produce or update one non-overlapping domain section.
   - Run documentation audit, focused source tests, structure, hygiene, link validation, and diff check.
   - Review net documentation growth and overlap before scheduling further iterations.

5. **Keep existing P1 blockers visible**:
   - BT-L10-1: comparable cross-dataset sweep selection remains unresolved.
   - BT-L10-2: durable clean-tree test-integrity scope remains unresolved.
   - The loop must not select or edit their sweep/native/test-integrity surfaces.

6. **Open proof boundaries**:
   - The accumulated current state is sealed on the `checkpoint/2026-08-09-current-state` branch as source/test checkpoint evidence; BT-L10-1/2 remain open and block release interpretation.
   - CI, committed archive, provider, host, deployment, recovery, soak, paper, and live qualification remain open.

Immediate next action:
- Restore exact hpdesk Git provenance before any Paper service cutover: hpdesk now has deploy-key read access and a clean host-local rsync-snapshot checkpoint `3c3ca65a`, while published source is `origin/checkpoint/2026-08-09-current-state` at `2e036889`. Reconcile the two histories without overwriting `.env*`, `storage/`, or `workspace/`; then use the exact-image/rollback path and run one redacted `doctor alpaca --paper-auth` provider read to attribute the Paper HTTP 401.
- Do not start the recurring intraday bot: every registered strategy still resolves to `1d`; require an approved, source/backtest-supported 5m/15m strategy contract first.
- The documentation loop remains deferred until the host/Paper diagnostic boundary is resolved or explicitly reprioritized.

## 2026-08-11 Session Closeout — hpdesk snapshot and Paper-auth recovery

1. Local reviewed source/test checkpoint `2e036889` is published to `origin/checkpoint/2026-08-09-current-state`. Its diagnostics and bounded Paper controls pass local focused/structure/integrity/hygiene/manifest/canonical Node gates.
2. hpdesk has a clean local branch `checkpoint/2026-08-11-hpdesk-rsync` at `3c3ca65a`; its 135 transferred non-workspace paths match the published checkpoint’s source/config/test scope, including the Paper diagnostic and intraday policy SHA-256 hashes. It is host-local rsync-snapshot evidence—not exact published ancestry or an image deployment.
3. hpdesk now authenticates read-only to GitHub using its dedicated deploy key. Next session must fetch/compare/reconcile the published checkpoint deliberately; do not reset host `main`, overwrite owner-only env/runtime state, or use broad rsync again.
4. The running `docker-bot-alpaca-paper-1` remains unchanged on `personal_finance:latest`; no image build, restart, Paper provider diagnostic, or new order followed snapshot commit. The two earlier authorized AAPL `$25` Paper attempts failed before order creation on a quote HTTP 401.
5. After exact provenance is re-established, run exactly one Paper-only redacted raw `/v2/account` vs SDK `getAccount()` diagnostic. Branch on result: dual rejection -> account/credential/provider handoff; raw accept/SDK reject -> source fix; outage/rate limit -> availability classification. Only retry the explicitly authorized AAPL order after an accepted Paper preflight.

## 2026-08-13 Next Session Goal — Security and remote product foundations

1. Start with `blast-through` in exactly one security/connective-tissue mode over the strategy data-readiness path and the artifact-only delayed public data boundary. Produce confirmed findings and a decision-complete B1 implementation plan before edits.
2. Treat B1 as P1: strategy catalog, CLI, API, dashboard, backtest, automation, promotion, Paper, and execution must fail closed when declared cached timeframes are missing, stale, insufficient, grain-suspect, or forbidden-derived. Distinguish data-unavailable rejection from a valid zero-trade result. hpdesk repair remains a manual owner-only action followed by readiness recheck.
3. Remote product boundary is fixed for initial work: free verified viewers get sanitized 24-hour delayed market/universe/freshness and aggregate-research artifacts only; no public live hpdesk queries, provider calls, compute, bot/account/portfolio/host access, credentials, or execution. Publication is blocked pending provider redistribution-rights review.
4. Artifact model is fixed: restricted non-execution hpdesk publisher; immutable schema-allowlisted signed/hashed artifact; atomic publish, expiry/retention, rollback, kill switch, and fail-closed unavailable state. Public routes must never fall through to live data.
5. Local all-in-one Linux/Windows package keeps every user’s providers, credentials, and bots local. Paper activation is a separate local wizard with owner-only storage, redacted read-only Paper account preflight, no-live default, and final explicit confirmation.
6. Cloudflare is deferred until source/API hardening, provider rights review, and staging proof; tunnel only to private origin and do not modify localhost behavior. Multi-tenant remote credentials/bots are separately deferred; current host global env and singleton state are not suitable.

Authoritative detailed plan: `/home/vgbn1/.claude/plans/dazzling-giggling-moler.md`.

Immediate closeout boundary:
- No CI, exact-image deployment, provider recovery, Paper fill, live execution, restart/rollback, or soak qualification has been achieved.
- Local continuity records are uncommitted session closeout files and intentionally remain separate from published functional source.

## 2026-08-13 Maintainer onboarding follow-up

1. Replace the deliberate `@..._HANDLE` placeholders in `MAINTAINERS.md` and `.github/CODEOWNERS` with verified GitHub users or teams; replace the `OWNER/REPOSITORY` issue-template URLs.
2. A repository administrator must enable GitHub private vulnerability reporting before treating `SECURITY.md` as an active confidential-reporting channel.
3. After real owners exist, configure protected `main`, PRs, at least one approval, sensitive-path CODEOWNERS review, the existing required checks, force-push/deletion protection, and a merge policy as documented in `GOVERNANCE.md`. Do not enable CODEOWNERS enforcement while placeholders remain.
4. This onboarding work does not grant provider credentials, host access, deployment control, CI administration, canonical-data write authority, or Paper/live execution authorization. Those remain separate core-maintainer and operator-controlled boundaries.

Immediate next action:
- Supply the initial GitHub handles and repository owner/name, then perform the administrator-only GitHub settings steps above. Until then, the new governance documents and templates are ready for source collaboration but the placeholder ownership/security links are intentionally non-operational.

## 2026-08-15 Session Closeout — Deep Codebase Junk & Mirror Cleanup

1. Executed 2-batch cleanup rollout (`CODEBASE-JUNK-CLEANUP-1`): removed `get_top_dirs.py`, empty `docss/` folder, legacy `docs/archive/sovereign_cli.og.js`, 5 duplicate `docs/memory/` historical mirrors, and 35 un-indexed `workspace/session_memory/session_*.md` files.
2. Verified with `node scripts/dev/audit_documentation.js` (0 findings), `npm run test:structure` (28/28 subtests passing), and `/home/vgbn1/.local/bin/graphify update .` (8,998 nodes).

Immediate next action:
- Continue with B2 artifact-only public data boundary implementation for remote deployment.

## 2026-08-15 Session Closeout — Clean Workspace Protocol & Deep Cleanup

1. Completed 3-batch rollout (`CLEAN-WORKSPACE-PROTOCOL-1`): refined skills (`session-orchestrator`, `mass-implement`, `refactor-readability`, `codebase-untangler`), enhanced hygiene scanner (`check_hygiene.js`), and executed deep cleanup sweep.
2. Verified with `node scripts/dev/audit_documentation.js` (0 findings), `npm run test:structure` (28/28 subtests passing), and `/home/vgbn1/.local/bin/graphify update .` (9,068 nodes).

Immediate next action:
- Continue with B2 artifact-only public data boundary implementation for remote deployment.

## 2026-08-15 Session Closeout — Mass Implement B2 Public Boundary & B1 Data Readiness

1. Executed 2-batch implementation rollout (`MI-B2-PUBLIC-DATA-1` & `MI-B1-DATA-READINESS-1`):
   - Created static 24h delayed artifact publisher (`public_artifact_publisher.js`) and 3 public endpoints under `/api/public/*`.
   - Extended `data_readiness.js` with timeframe & strategy readiness checks and updated `runBacktest()` in `shared/lib/strategy/backtest.js` to fail closed on missing/unverified data series.
2. Verified with `npm run test:structure` (28/28 pass 100%), `test:api` (100%), `ctest` (33/33 pass 100%), `npm test` (100%), and `node scripts/dev/check_hygiene.js` (0 findings).

Immediate next action:
- Reconcile hpdesk Git provenance and run Paper-only `doctor alpaca --paper-auth` diagnostic to root-cause Paper HTTP 401 quote errors.

## 2026-08-15 Session Closeout — Domain Structure Maps

1. Created 6 dedicated domain-specific structural README maps under `docs/sections/`: `backend/README.md`, `shared/README.md`, `frontend/README.md`, `config/README.md`, `storage/README.md`, and `tests/README.md`.
2. Registered all 6 new domain sections in `docs/documentation_manifest.json` under `section_roots` and `documents`.
3. Linked domain guides directly from `docs/engineering/codebase_org.md`, `docs/ARCHITECTURE.md`, and `docs/README.md`.
4. Verified with `node scripts/dev/audit_documentation.js` (0 findings) and `npm run test:structure` (28/28 subtests passing). Rebuilt knowledge graph with `/home/vgbn1/.local/bin/graphify update .`.

Immediate next action:
- Continue with B2 artifact-only public data boundary implementation for remote deployment.

## 2026-08-15 Session Closeout — Market Routes Hardening & hpdesk Sync

1. Implemented `input_validator.js` and `data_readiness.js` to enforce fail-closed status responses across market routes (HTTP 503 for missing snapshot data, HTTP 422 for insufficient bars, and HTTP 400 for path traversal / invalid parameters).
2. Refactored `signal_promote.js` to log SHA-256 hash-chained workflow events (`events.jsonl`) via `promotion_store.js` alongside Supabase audit logs.
3. Updated `cli_executor_cache.js` with deterministic object key sorting (`stableKey`) for TTL cache isolation.
4. Added test suites `market_routes_contract.test.js` and `promotion_audit_chain.test.js` to `package.json` (`test:api`). Verified 45/45 Node tests, hygiene, and structure contracts.
5. Synced source changes one-way to `hpdesk` via guarded rsync and verified SHA-256 hash parity across all updated files.
6. Configured host backup destination guidance to mount external HDD (`/mnt/sda1/backups`) per `hdd_tiering_storage_guide.md`.

Immediate next action:
- Continue with B2 artifact-only public data boundary implementation for remote deployment.

## 2026-08-13 hpdesk source-overlay boundary

1. The current local source (`0f070b64`, matching `origin/main` at transfer) was copied one way to hpdesk through guarded rsync. hpdesk `workspace/`, `storage/`, `.env*`, `.git`, dependencies, generated/build artifacts, and logs were excluded and must remain host-owned.
2. hpdesk keeps `checkpoint/2026-08-13-hpdesk-source-sync` at `e62818d` as its Git HEAD and has expected uncommitted source overlay differences. This is not a clean exact-`origin/main` checkout, source provenance for an image, or deployment qualification.
3. Do not run `update-central-host.sh`, `git reset`/`git clean`, image builds, service restarts, provider diagnostics, data jobs, or bot activation from this mixed tree. Exact Git provenance would overwrite tracked hpdesk workspace files and needs a separately approved host-state reconciliation design.
4. No hpdesk content may be copied back to local as part of this direction. Any host-local snapshot/commit, deployment, or provider diagnostic needs separate explicit authorization and its own preflight.

Immediate next action:
- If exact hpdesk Git provenance is required, design a tracked-workspace preservation/reconciliation procedure first; otherwise keep the current source overlay as source-only evidence and continue local source work.


## 2026-08-10 Post-closure follow-up

1. Confirm the requested checkpoint commit and push are visible on the intended remote branch.
2. Treat BT-L10-1 and BT-L10-2 as closed for source/test and indexed clean-archive evidence; do not imply CI, provider, host, deployment, recovery, or soak qualification.
3. Resume the refined cleanup-first documentation loop only after the committed checkpoint is confirmed; Batch 0 baseline/classification is complete, and the existing `docs/sections/` batch is now part of the sealed worktree rather than a fresh pilot candidate.
4. Keep current runtime, provider, data-write, paper/live, deployment, and credential boundaries unchanged.
