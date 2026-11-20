# Deep blast-through and runtime-log diagnosis

Audit started: **2026-11-20T17:45:32Z** (machine UTC clock; session date 2026-11-21).
Mode: **deep-blastthrough**, Hard Reading; bounded plane sampling, not an exhaustive
line-by-line audit. Target revision `3dd845a0`, pushed to
`origin/fix/alpaca-sdk-v5-104`. Three staged user-owned instrument/backfill files
remain excluded from commits. No production fixes, orders or deployment authorized
by this audit. Node24.19.0/npm12.2.2.

## Scope and evidence rules

Independent workers review compute, execution, API/auth, data/storage, terminal,
dashboard, infrastructure/logs, MCP/config, prediction/research, CI/release, and
remaining taxonomy. GPT-6 Luna workers already running were retained; requested
GPT-5.6 Luna handles infrastructure/logs and Gemini3.8 Flash remaining surfaces.
Only observed failing boundaries are defects. Static risks, missing verification,
external failures and checker mismatches remain distinct. No numeric DCS can be
inferred from passing fixture tests.

## Confirmed findings

### SE-01 — Submission is recorded as an open sub-position before fill confirmation

- Severity: MEDIUM. Gateway `backend/execution/src/index.ts:375–396` records buy
  quantity/price from the request immediately after acceptance; adapter
  `backend/execution/src/adapters/alpaca_adapter.ts:147–151` returns only ID/status.
  Ledger `shared/lib/runtime/sub_positions_ledger.js:165–205` stores that quantity
  with status=open. Acceptance is not a fill: unfilled/partial orders can overstate
  holdings and use an unexecuted cost basis. Like counting a dispatched parcel as
  delivered, this removes uncertainty too early.
- Evidence: real file-backed ledger function recorded10 at100 for requested10
  with fixture confirmed2 at101. Expected filled quantity2 assertion exits1,
  `/tmp/opencode/execution-safety-audit/ledger-partial-fill-oracle.log`.
  This probe exercises the ledger, not the full gateway; the actual caller mismatch
  is source-verified. Deployed frequency/financial impact remain unmeasured.
- Fault domain: our_source; repair owner: gateway-to-ledger receipt integration;
  stub involvement: none in the ledger, fixture provider receipt. Confidence high
  for the local boundary, not production incidence.
- Clearance: represent pending separately or book only confirmed cumulative fills
  at executed basis; real gateway-to-ledger accepted/partial/canceled/filled tests.
  Adjacent sell branch at index.ts:397–403 also uses requested quantity/price;
  its operational effects were not independently reproduced in this pass.
- Bot-state receipt tests41/41 pass, exit0. Pending uncertainty is deliberately
  fail-closed and must not be replaced with automatic retries or inferred fills.
- Tracking: https://github.com/vgbn2/personal_finance_draft/issues/110.
- A/B attribution: the same requested quantity/basis caller exists at832bcd01^;
  this is pre-existing gateway debt, not a newly introduced receipt-accounting
  regression. It still limits whole-system qualification.

### ENV-01 — Environment-manifest gate rejects an unclassified test variable

- Severity: LOW; source/test tooling contract, not a proved runtime config leak.
- Boundary: `tools/dev/check_environment_manifest.js:29–38,69–72` discovers
  `process.env.ALPACA_CONTRACT_ROOT` at
  `tests/scripts/operational/alpaca_sdk_contract.test.js:10` but the manifest has
  no classification. The scanner intentionally includes test sources.
- Evidence: `node tools/dev/check_environment_manifest.js` exit1, JSON ok=false,
  unclassified exactly `["ALPACA_CONTRACT_ROOT"]`; manifest test7/8, exit1.
  Root reproduction `/tmp/opencode/audit-manifest-confirm.log`, worker evidence
  `/tmp/opencode/audit-mcp/`. The same test variable exists at `addaab47`;
  it was not introduced by the four latest remediation commits.
- Fault domain: our_source. Repair owner: test environment override/manifest
  discovery contract. Stub involvement: none. Confidence: high.
- Acceptance: explicitly decide whether test-only roots belong in classification
  or remove the unnecessary override; direct scanner and manifest test must pass
  without weakening runtime secret projection or hiding source names.

## Gate limitations and dismissed false positives

- `arch-drift-check .` exit126: symlink target is not executable. Explicit
  `python3 -B ~/.local/bin/arch-drift-check .` exit1, but the script prohibits
  canonical backend/frontend roots and treats colocated Go tests/repeated year
  directories as drift. AGENTS.md explicitly owns that layout; these diagnostics
  do not prove structural defects. No chmod or repository reorganization applied.
- `doc-drift-sentinel --dir docs --strict` exit1: five apparent stale references
  in `docs/runbooks/alpaca-sdk-v5.md`. Line7 explicitly makes SDK paths relative
  to node_modules/@alpacahq/alpaca-trade-api/src; all four cited source files exist.
  `response.quote.ap/bp` is a field expression, not a file. Dismissed checker
  context false positives; do not claim general documentation cleanliness.
- `code-complexity-grader shared/lib/runtime/alpaca_bot_cycle.js --fail-under B`
  exit1, heuristic gradeF/0. Real nesting/long guards warrant readability review;
  the tool also mislabels optional chaining as nested ternaries. This metric is
  not evidence of broken accounting. Raw hotspots retained
  `/tmp/opencode/audit-complexity.log`; behavioral findings require repros.
  A/B baseline at addaab47 also gradesF/0 with nesting8; this is not proof of a
  newly introduced complexity regression. Concrete new guard length remains debt.
- `blast-radius-estimator -file shared/lib/runtime/alpaca_bot_cycle.js -symbol
  runAlpacaExitCheck` exit0:17 dependent files/37 references, including generated
  docs and graph caches, not17 runtime consumers. Review actual consumers before
  recommending a structural extraction.
- Release workflow has no checksum-bearing distributed archive; without a defined
  published binary/archive, missing SHA256SUMS is a static improvement candidate,
  not a confirmed corrupt-release boundary.
- `function-family-classifier check shared/lib/runtime/alpaca_bot_cycle.js`
  exit0,8 functions, six ambiguous. Its classification of every function as
  utility_helper has low mean confidence57.6%; not evidence of correct ownership.

## Fresh plane evidence received

| Plane | Fresh result | Qualification limits |
| --- | --- | --- |
| Compute/core | New tmpfs Release build and CTest35/35, exit0 | ONNX disabled; no sanitizers/live business-rule qualification |
| API/auth | API61 pass; CLI auth9 pass, exit0 | Fixture unauthorized requests only; no provider acceptance |
| Data/storage | test:data5 pass, exit0 | Three test files only; DCS freshness/schema/universe denominators unproved |
| Terminal | Targeted90 pass, exit0 | Initial96 claim corrected against log; fake-TTY only |
| Dashboard | Typecheck/build exit0, responsive10 pass | Browser auth/mutations not exercised end-to-end |
| MCP | stdio7 pass; access1 pass | Full discovery/runtime schema parity unproved |
| Environment config | manifest7/8, exit1 | ENV-01 is the sole observed failure |
| CI/release | structure43 pass; workflow5 pass, exit0 | Local contracts, not hosted CI execution |
| Prediction/research | Five selected files60 pass, exit0 | Replay/settlement fixtures, not provider or promotion qualification |
| Execution | Requested three files41 pass, exit0; ledger oracle exit1 | SE-01 prevents broad accounting qualification |

Logs `/tmp/opencode/audit-{core,api,data,tui,ci,mcp,dashboard}*`; exact invocation
and grade reconciliation will be completed after the remaining workers return.
Dashboard responsive runner generated ignored build/dashboard; the separate
production build went to tmpfs. Core npm script deliberately not run because its
test preparation overwrites storage fixtures; equivalent fresh native build/test
used `/tmp/opencode/audit-core-build`.

## Provisional section scorecard

Grades describe the sampled local source/test evidence, **not deployment approval**.
Missing domain authority or current-host proof stays BLOCKED regardless of letter.

| Section | Grade | Attributed limit |
| --- | --- | --- |
| Core | B | No failing boundary observed; sanitizer/live-domain evidence unavailable |
| Execution | C | SE-01, our_source, gateway receipt/ledger integration, no production stub |
| API/CLI auth | B | No failing boundary observed; provider/deployment evidence unavailable |
| Data/storage | Not qualified | No failing boundary observed; DCS denominators unavailable, not a defect |
| Terminal | B | No failing boundary observed; actual terminal behavior unverified |
| Dashboard | B | No failing boundary observed; browser auth/mutation integration unverified |
| MCP | B | No failing boundary observed; complete schema parity unverified |
| Environment config | C | ENV-01, our_source, manifest/test override contract, no stub |
| Prediction/research | B | No failing boundary observed; external data/policy qualification BLOCKED |
| CI/release | B | No failing boundary observed; hosted execution unverified |

For rows with no failing boundary, fault domain/repair owner/causal mechanism are
unresolved/not applicable, not invented to justify lowering a grade. Fixture-only
tests are not production stubs. The data worker's initial C based solely on limited
coverage is replaced with Not qualified: evidence gaps alone are not source faults.

Issue updates: #109 comment7046699181 and #108 comment7046699640 retain the new
finding, push evidence, local tests and deployment limits. Anti-cheat closeout
probe exit0/zero strikes; this does not mean all tests pass (ENV-01 still fails).

## Remaining qualification

Infrastructure/log and taxonomy evidence still pending at this checkpoint.
No all-complete, all-clean, production-ready, numeric
DCS, prolonged-soak, or full-source-coverage claim is made.

## SE-01 offline reproduction runbook

### 1. Inspection / probe

From repository root, inspect index.ts:375–403 and adapter:147–151 above. No
credentials or dependency installation is needed; the ledger uses Node stdlib.

### 2. Remediation

None: audit-only. Do not change live state or submit an order to reproduce this.

### 3. Verification / oracle

```bash
node <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recordSubPositionEntry } = require('./shared/lib/runtime/sub_positions_ledger');
const root = fs.mkdtempSync('/tmp/opencode/accepted-order-oracle-');
const receipt = {
  filledQty: 2,
  filledAvgPrice: 101,
};
const recorded = recordSubPositionEntry({
  symbol: 'SPY',
  strategyId: 'audit',
  quantity: 10,
  entryPrice: 100,
  orderId: 'local-fixture-only',
}, path.join(root, 'ledger.json'));
console.log({ root, recorded, receipt });
assert.equal(recorded.quantity, receipt.filledQty);
JS
```

Expected current failure: exit1, assertion `10 !== 2`. Receipt is deliberately
fixture evidence, not an argument consumed by the ledger: the source caller sends
requested quantity/price and never sends confirmed fills. This reproduces that
contract mismatch without claiming to execute the gateway or provider.

### 4. Rollback

No production mutation. Only the unique printed tmpfs directory is created; retain
it for inspection or remove that specific directory after verifying its contents.
