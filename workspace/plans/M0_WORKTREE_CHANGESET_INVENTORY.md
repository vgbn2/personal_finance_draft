# M0 Worktree Changeset Inventory

Date: 2026-07-29
Anchor: `main` at `0383d47bd3000d3d3ab6199bcf06cd351ffa0b8f`
Decision: `GO WITH FIXES -> implemented -> verified -> reviewed; closure deferred`

This is the M0 ownership inventory for the intentionally dirty worktree. It records 92 pre-inventory status
entries; this file and the historical-plan correction bring the current total to 94. Nothing is staged or
committed. Because package manifests, safety owners,
environment projection, and test orchestration cross the groups below, a partial commit is unsafe unless its
exact archive is re-audited. The preferred reviewed release shape is one atomic source commit, or hunk-separated
commits that preserve every listed owner/test edge at each boundary.

## A. Execution safety and truthful degradation

Owner: CLI strategy automation plus shared Alpaca/backtest runtime.

- `backend/cli/commands/strategy/strategy.js`
- `backend/cli/commands/strategy/automation_guard.js`
- `backend/cli/lib/auth.js`
- `shared/lib/runtime/alpaca_bot_cycle.js`
- `shared/lib/runtime/alpaca_bot_state.js`
- `shared/lib/strategy/backtest.js`
- `tests/scripts/architecture/auth/trade_pin_safety.test.js`
- `tests/scripts/lib/alpaca_bot_cycle.test.js`
- `tests/scripts/lib/alpaca_bot_state.test.js`
- `tests/scripts/safety/automation_guard.test.js`
- `tests/scripts/safety/degraded_fallback.test.js`
- `tests/scripts/safety/guard_mutation.test.js`
- `docs/codebase_tour/03_strategy_backtest_ml.md`
- `docs/codebase_tour/04_trading_gateway_live_orders.md`

Load-bearing untracked edge: `automation_guard.js` and all adversarial safety tests must enter the reviewed
revision with their callers.

## B. Environment projection, container, and distribution contract

Owner: environment manifest and per-service deployment projection.

- `Dockerfile`
- `infra/docker/Dockerfile`
- `infra/docker/docker-compose.yml`
- `backend/scripts/ops/prepare_central_env.js`
- `backend/api/server/services/cli_executor.js`
- `config/system/environment_manifest.json`
- `shared/lib/runtime/environment_manifest.js`
- `package.json`
- `package-lock.json`
- `backend/api/package.json`
- `backend/api/package-lock.json`
- `backend/gateway/package.json`
- `backend/gateway/package-lock.json`
- `backend/mcp_server/package.json`
- `backend/mcp_server/package-lock.json`
- `Frontend/dashboard/package.json`
- `Frontend/dashboard/package-lock.json`
- `tests/scripts/architecture/cli/core/compose_environment_contract.test.js`
- `tests/scripts/architecture/cli/core/deployment_manifest_contract.test.js`
- `tests/scripts/architecture/cli/core/environment_manifest.test.js`
- `tests/scripts/architecture/cli/core/container_runtime_contract.test.js`
- `tests/scripts/architecture/cli/core/distribution_metadata_contract.test.js`
- `tests/scripts/operational/prepare_central_env.test.js`
- `docs/operational/guides/QUICKSTART.md`

The root package files also route the canonical test/evidence commands. They must not be separated from Group C
without hunk-level review.

## C. Durable source and failure evidence

Owner: `scripts/dev/verify_source_evidence.js`, with one shared sanitized-diagnostic utility and one test wrapper.

- `scripts/dev/verify_source_evidence.js`
- `scripts/dev/source_evidence_schema.js`
- `scripts/dev/sanitized_diagnostics.js`
- `tests/run_node_tests.js`
- `tests/run_logged_command.js`
- `tests/support/rag_failure_reporter.mjs`
- `tests/scripts/architecture/cli/core/source_evidence_contract.test.js`
- `tests/scripts/architecture/cli/core/test_runner_contract.test.js`
- `tests/scripts/architecture/cli/core/rag_failure_reporter.test.js`
- `tests/scripts/architecture/cli/core/command_failure_reporter.test.js`
- `docs/operational/guides/testing_surface.md`

Duplicate/stub result: the source-evidence coordinator is canonical and has no competing implementation.
The two prior redactors were divergent duplicates; both now consume `scripts/dev/sanitized_diagnostics.js`.
No honest-unavailable branch or fixture was removed.

## D. Repository workflow and skill routing

Owner: tracked `skills/` tree; `.agents/skills/` remains the ignored discovery mirror.

- `AGENTS.md`
- `PROJECT_RULES.md`
- `skills/manifest.json`
- `skills/blast-through/SKILL.md`
- `skills/blast-through/references/audit-modes.md`
- `skills/claude/SKILL.md`
- `skills/codex/SKILL.md`
- `skills/feature-exerciser/SKILL.md`
- `skills/gemini/SKILL.md`
- `skills/mass-implement/SKILL.md`
- `skills/polymarket-history-backfill/SKILL.md`
- `skills/refactor-readability/SKILL.md`
- `skills/refactor-readability/agents/openai.yaml`
- `skills/refine-suggestion/SKILL.md`
- `skills/session-orchestrator/SKILL.md`
- `tests/scripts/architecture/cli/core/repo_skills_contract.test.js`

## E. Repository hygiene and generated-artifact removal

Owner: hygiene policy and native maintenance documentation.

- `.gitignore`
- `scripts/dev/check_hygiene.js`
- `docs/engineering/native_maintenance_notes.md`
- `backend/cli/dev.review.txt` (deleted)
- `backend/core/src/feeds/dev.review.txt` (deleted)
- `backend/core/src/ingestion/dev.review.txt` (deleted)
- `backend/core/src/parser/dev.review.txt` (deleted)
- `backend/core/src/portfolio/dev.review.txt` (deleted)
- `backend/core/src/position_sizing/dev.review.txt` (deleted)
- `backend/core/src/regime/dev.review.txt` (deleted)
- `backend/core/src/research/dev.review.txt` (deleted)
- `backend/core/src/risk/dev.review.txt` (deleted)
- `backend/core/src/stats/dev.review.txt` (deleted)
- `backend/core/src/strategies/dev.review.txt` (deleted)
- `backend/core/test/dev.review.txt` (deleted)
- `infra/scripts/dev_ops/dev.review.txt` (deleted)
- `workspace/dev_reviews/dev.review.txt` (deleted)
- `backend/core/src/ml/vc140.pdb` (deleted generated binary)

No deletion exceeds the mass-implementation confirmation threshold. These are generated/review-noise artifacts,
not production owners.

## F. Durable continuity and canonical queue

Owner: current workspace state and dependency-ordered planning index.

- `workspace/DEV_REVIEW.md`
- `workspace/HANDOFF.md`
- `workspace/NEXT_SESSION_GOAL.md`
- `workspace/PROMPT_LOG.md`
- `workspace/REVIEW_LEDGER.md`
- `workspace/SESSION_MEMORY.md`
- `workspace/STATE.md`
- `workspace/handoff/2026-07-28.md`
- `workspace/handoff/2026-07-29.md`
- `workspace/plans/BOT_MONITORING_MASS_IMPLEMENT_PLAN.md`
- `workspace/plans/CURRENT_PENDING_MASTER_PLAN.md`
- `workspace/plans/ENVIRONMENT_AND_PRODUCTION_EVIDENCE_MASS_IMPLEMENT_PLAN.md`
- `workspace/plans/RESEARCH_DATA_STRATEGY_BACKTEST_READINESS_PLAN.md`
- `workspace/plans/M0_WORKTREE_CHANGESET_INVENTORY.md`

`CURRENT_PENDING_MASTER_PLAN.md` is authoritative when an older plan header disagrees. Monitoring, research,
provider, paper, host, dependency, and live batches remain outside M0.

## Verification and remaining gates

Observed green in this worktree:

- focused evidence/RAG/runner contracts: 18/18 in the host-capable verification context;
- `npm run test:safety`;
- `npm run test:structure`;
- `npm run hygiene`;
- `npm run test:secrets`;
- `git diff --check`;
- exact host-capable `node tests/run_node_tests.js`.

The restricted broad run was non-PASS because nested child spawns returned `EPERM`; the exact host-capable rerun
passed. This is environment evidence, not a test rewrite or suppression.

Source-boundary update:

- the complete boundary was committed at `8275a9acfc60dad36a15a24f5e8cde512307b6f8`;
- committed-archive evidence `4346d24e-a72e-4ab5-b75b-1fb9be8a6ebe` is PASS;
- no authenticated CI artifact exists for the exact reviewed lineage;
- host, provider, backup/recovery, restart/rollback, one-writer, soak, paper, and live gates remain unproven.
