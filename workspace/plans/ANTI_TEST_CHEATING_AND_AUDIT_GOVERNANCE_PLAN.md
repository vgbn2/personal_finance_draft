# Mass Implementation Plan: Anti-Test-Cheating, Test Integrity & Deep Review Governance System

## Context
As the repository reaches a point of high feature completeness and diminishing returns on broad new features, future sessions pivot toward **deep codebase audits, section grading, maintainability refactoring, and strict test integrity enforcement**.

AI agents working on complex repositories can engage in test-gaming ("cheating")—such as mocking internal production functions, weakening assertions, swallowing errors in `try/catch` blocks, or depending on uncommitted local gitignored fixtures. This plan establishes an automated **Test Integrity & Anti-Cheating Audit System** alongside a structured protocol for auditing the repository's 12 major code hotspots (>500 lines).

---

## Required Intake & Standard Specifications

### 1. Test Anti-Cheating & Mock Audit Rules (`TEST-INTEGRITY-1`)
- **Objective**: Prevent AI agents from modifying tests to pass production bugs or mocking internal production modules.
- **Rule 1 (No Mocking Internal Production Logic)**: Stubs/mocks are allowed ONLY for external HTTP network boundaries (Alpaca, Polymarket, Binance APIs). Internal modules (`validation.js`, `backtest.js`, `paper_ledger.js`, `strategy.js`) MUST NEVER be mocked or stubbed in tests.
- **Rule 2 (No Assertion Weakening)**: Strict equality assertions (`assert.equal`, `assert.deepEqual`) cannot be converted to loose checks (`assert.ok`).
- **Rule 3 (No Silent Error Swallowing)**: Assertions wrapped in `try/catch` without rethrowing or failing the test are flagged as violations.
- **Rule 4 (Fresh-Clone Reproducibility)**: Tests cannot import or read files inside `storage/data/cache/` or untracked directories. All test fixtures must reside in `tests/fixtures/`.

### 2. Hotspot Review & Coherence Audit Protocol (`HOTSPOT-AUDIT-2`)
- **Objective**: Audit the 12 code files exceeding 500 lines for readability, single-responsibility ownership, top-down control flow, and fault-domain attribution.
- **Hotspots in Scope**:
  1. `backend/gateway/src/index.ts` (2,849 lines)
  2. `backend/scripts/data_ops/ingest_market_data/index.js` (1,454 lines)
  3. `shared/lib/market/validation.js` (1,348 lines)
  4. `backend/api/server/services/cli_executor.js` (1,269 lines)
  5. `shared/lib/strategy/backtest.js` (1,124 lines)
  6. `backend/core/src/main.cpp` (1,097 lines)
  7. `backend/cli/commands/data/data.js` (1,088 lines)
  8. `backend/cli/commands/research/research.js` (1,020 lines)
  9. `shared/lib/market/polymarket_history.js` (970 lines)
  10. `backend/cli/commands/trade/trade_polymarket.js` (879 lines)
  11. `backend/cli/tui/engine/engine.js` (852 lines)
  12. `backend/cli/commands/data/backfill_daemon.js` (648 lines)

---

## Ranked Implementation Batches

### Batch 1: Automated Test Integrity & Anti-Cheating Scanner (`TEST-INTEGRITY-1`)
- **Status**: `proposed -> preflight`
- **Objective**: Build an automated static analysis scanner (`scripts/dev/audit_test_integrity.js`) that detects test anti-patterns and mock abuses.
- **Touched Files**:
  - `scripts/dev/audit_test_integrity.js` (New developer script)
  - `tests/scripts/architecture/cli/core/structure_contract.test.js` (Integrate test-integrity scanner)
- **Implementation**:
  - Parse AST / Regex patterns across `tests/**/*.test.js`.
  - Flag disallowed `t.mock.method` or `sinon.stub` calls on internal `#shared/*` or relative `../../shared/lib/` modules.
  - Detect `try { ... assert ... } catch {}` blocks.
  - Detect non-fixture file reads pointing to gitignored cache paths.
- **Verification Gate**:
  - `node scripts/dev/audit_test_integrity.js` and `npm run test:structure`

---

### Batch 2: 12-Hotspot Deep Blast-Through & Section Grading (`HOTSPOT-AUDIT-2`)
- **Status**: `proposed -> preflight`
- **Objective**: Execute section-grade & maintainability audits over the 12 hotspot files, logging fault domains and stub causality for any module graded below A.
- **Touched Files**:
  - `workspace/DEV_REVIEW.md` (Update audit findings & section grades)
  - `workspace/STATE.md` (Update system grade ledger)
- **Implementation**:
  - Run `/blast-through` in `maintainability` and `section-grade` modes across the 12 hotspots.
  - Trace single-responsibility compliance, top-down execution flow, and comment alignment.
  - Attribute any grade below A to explicit `fault_domain` (`our_source`, `our_host`, `operator_config`, `external_provider`).
- **Verification Gate**:
  - `npm run hygiene` and `npm run test:api`

---

### Batch 3: Clean-Clone Isolation & Fixture Verification (`FRESH-CLONE-3`)
- **Status**: `proposed -> preflight`
- **Objective**: Verify that 100% of test suites execute cleanly on a fresh clone without pre-existing `storage/data/cache/` files.
- **Touched Files**:
  - `tests/scripts/architecture/cli/core/structure_contract.test.js`
  - `tests/fixtures/`
- **Implementation**:
  - Enforce that all test files source static inputs exclusively from `tests/fixtures/`.
  - Add explicit check ensuring no test attempts to read or mutate production binary TS storage (`storage/data/ts/`) directly.
- **Verification Gate**:
  - `npm run test:structure`

---

## Safety & Execution Boundaries
- `LIVE_TRADING=false` and `SOVEREIGN_EXECUTION_AUTHORIZED=false` strictly enforced.
- No live broker endpoints, order submissions, or network credential mutations permitted.
- All test integrity checks run offline without network access.
