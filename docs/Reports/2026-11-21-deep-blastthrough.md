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

Infrastructure/log evidence received after initial checkpoint; taxonomy evidence
has now returned. See appended runtime and residual-surface qualification below.
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

## Infrastructure/log continuation — observed2026-11-20T17:47Z

GPT-5.6 Luna completed read-only CT114 diagnosis; main independently confirmed
Compose fallback/suppression presence using boolean-only output, not secret values.

### INFRA-01 — HIGH: literal router credential fallback

- `infra/docker/docker-compose.yml:472`: nonempty literal default for
  SOVEREIGN_ROUTER_KEY. Missing operator input resolves to a credential-shaped
  value instead of failing closed. Like a lock shipping with a spare key already
  inserted, successful access does not prove the operator supplied the right key.
- Worker Compose render with variable unset exited0 and included the key;
  no provider-authentication acceptance of that value was tested. Current router
  success cannot distinguish fallback use from supplied configuration.
- Failing boundary: Compose resolution to quant environment. Fault: our_source;
  owner: quant Compose credential projection; stub:none; confidence high for
  embedded fallback, unverified validity/current use. Do not publish the literal.
- Acceptance: no tracked credential literal; absent input fails quant configuration
  or startup; explicitly supplied input works; regression without reading secrets.
  Assess rotation/revocation if the literal is a valid credential; no rotation or
  production configuration changes authorized by this audit.
- Tracking: https://github.com/vgbn2/personal_finance_draft/issues/111.
- Generic secret scan reported944 files/zero violations despite this finding:
  that scanner pass does not establish absence of credentials.

### INFRA-02 — quant exit suppression, source hazard not reproduced outage

`infra/docker/docker-compose.yml:510` uses `|| true` after the harness invocation.
This masks child exit status within the long-lived loop. Fault:our_source;
owner:quant wrapper; stub:silent_fallback. No failing harness was injected and no
current crash established; restart/alert implications require an isolated failing
fixture and an explicit policy for transient errors versus valid candidate rejection.
Do not silently turn a deliberate retry loop into a crash/restart loop.

### INFRA-03 — optional-provider status ambiguity, not confirmed outage

Logs retain missing MT5 quote-file ENOENT while overall Yahoo backfill succeeds.
USDJPY1916/USDSEK1906 bars were returned. Source:
data_accumulate.js:209–213,249–266 and ingest_market_data/index.js:522–545.
Mandatory-versus-optional feed contract is unresolved; do not label this a broken
success flag until that contract is established. Candidate owner:data aggregation
and deployment feed configuration; fault unresolved, not proved shared/mixed;
no production stub established.

### Bounded runtime and verification evidence

- Corrected SSH/pct probe exit0: six requested containers running, restart_count0,
  OOMKilled=false. Initial host-level docker invocation exit127 was a probe-path
  error, not service failure. Snapshot and30-minute logs do not establish a soak.
- Alpaca cycles94–97 completed; no current exit error. Backfill cycle49 completed,
  errors0/rollup_errors0. Health reports fresh canonical data/free disk71.8%, not
  memory health. Quant rejects below-floor candidates as expected.
- SearXNG and backup had no window log output: neither proves successful queries
  or completed backup. No heavy-overlap/backup or historical peak qualification.
- Docker stats: bot107MiB, backfill803.1MiB, backup30.5MiB, health19.85MiB,
  quant21.27MiB, SearXNG130.1MiB. These are container snapshots, not process heap.
- Local Compose/shell/selected JS syntax exit0; deployment/heartbeat/backfill tests
 13/13 exit0. Overall infrastructure complexityB/86 includes individual F-rated
  doctor scripts and D-rated extended harness; not proof of runtime defects.
- Evidence under `/tmp/opencode/audit-infra-*`, especially corrected CT114 log,
  state-stats and local-tests logs. No environment values or secret files inspected
  remotely; no restarts/orders/deployment/resource changes.
- Revised scorecard: Docker C (INFRA-01); systemd B (syntax/targeted checks only);
  operational tooling not fully qualified (complexity debt,13 selected tests);
  CT114 bounded snapshot passes, prolonged runtime qualification BLOCKED.

Next action: retain credential finding in tracker, decide credential handling and
quant/feed contracts before fixes. #96 firewall/client-IP/limiter policy and #105
memory/overlap acceptance remain open; this snapshot does not clear either.

## Final residual-surface reconciliation

Gemini3.8 returned root taxonomy, Go feeder and backend scripts evidence. This
completes assigned plane reports, not exhaustive source/domain qualification.

- Go race tests3/3 and Go/Node parser parity1/1 exit0; selected ops30/30,
  analysis4/4 and ingestion/scheduler/intraday36/36 exit0. Artifact:
  `/tmp/opencode/audit-coverage-sweep.json`. No dependency fetching intended.
  Passing race tests do not establish zero allocations or universal race freedom.
- Worker claims of100% verification, fully covered script trees, zero exploitable
  vulnerabilities and orphan verification scripts are rejected as unsupported.
  No string references in tests does not prove no callers or no required consumers.
  Missing Go ownership-table row is a documentation candidate, not a runtime bug.
  Generic secret scan is expressly contradicted by INFRA-01's detected literal.
- **DOC-01, introduced by this audit:** report was unregistered, causing structure
 42/43 at the later worker snapshot. Initial report commit was963d6f95, not918c336a
  as worker stated. Added historical reference entry to documentation_manifest.json;
  fresh `npm run test:structure` exit0,43/43; no assertion changes. Fault our_source,
  owner audit documentation catalog, stub none. Evidence `/tmp/opencode/audit-structure-final.log`.
- **ROOT-01, MEDIUM:** root `sv:2` still targets removed backend/cli path.
  Independently executed `./sv --help` exit1/MODULE_NOT_FOUND. Fault our_source,
  owner root CLI shim, stub compatibility_shim. Sibling PowerShell/start/reset/
  batch scripts have source-reported stale paths but were not executed; do not
  extend Linux failure proof to Windows or destructive commands. Acceptance:
  canonical CLI path plus safe help invocation contract; preserve authorization.
- **BUILD-01, LOW:** Makefile:12 uses build/cpp_core instead of package build/core.
  Independent `make test` exit2, nonexistent CTest directory, despite fresh native
 35/35. Fault our_source, owner root build orchestration, stub none. Evidence
  `/tmp/opencode/audit-make-test.log`. Build-core target also uses a different root;
  reconcile whole Make workflow rather than claiming a one-path change suffices.
- ENV-01 reproduced independently, unchanged. Root orchestration gradeC for the
  reproduced shim/test-target failures. Go/script tests are bounded positive
  evidence, not grounds for worker's A/96 or blanket high-coverage claims.
- Anti-cheat final probe exit0/zero strikes; unrelated three staged files preserved.

All assigned reviews returned. Audit deliverable complete with disclosed gaps;
remediation/rollout is **not** complete. Next work is approved handling of #111,
#110 and root build/CLI findings, plus ENV-01; no repairs to these production
surfaces were authorized or performed in this audit.

Root orchestration tracking: https://github.com/vgbn2/personal_finance_draft/issues/112.

## Implementation continuation — 2026-11-22

Root required shims now dispatch canonical frontend/cli-tui and backend/execution
owners; PowerShell sv anchors to PSScriptRoot. Make configure/build/test share
CORE_BUILD_DIR (default build/core), and CTest rejects zero discovered tests.
This reconnects existing entrypoints rather than creating another CLI: like
updating forwarding addresses after a move, the original doors remain usable.

ALPACA_CONTRACT_ROOT is classified as internal, developer-only, process_internal
only. The existing SDK test override is preserved, not hidden from inventory;
all production surface projections reject it. Existing failing tests unchanged.

Local verification: root entrypoints3/3; environment/projection9/9; scanner exit0;
structure exit0; clean Make build and CTest35/35 both pass from
/tmp/opencode/fix-root-native. Windows scripts source-checked only, not executed. No start/reset scripts
launched, no provider requests/deployment/orders. Credential policy #111 and ledger
recovery #110 remain blocked on explicit decisions. Exact diff/evidence under
/tmp/opencode/root-paths-D0.json, environment-D0.json and fix-*.log.

Final integrity: anti-cheat --no-revert0/zero strikes; YAGNI0; classifier0;
receipt regression41/41; shell syntax0; exact planned production contents matched.

User selected whole-Compose missing-key failure for #111. Literal removed in favor
of required interpolation, including empty input rejection. Full Compose
config --quiet --no-env-resolution: unset key exit1, supplied fixture key exit0;
isolated real Compose interpolation regression1/1. No service change or rotation.

User selected ledger-owned pending orders for #110. Alpaca gateway now persists
intent before submission, attaches returned IDs before lookup, and applies only
validated order-specific cumulative fills. Position changes and receipt watermarks
share one locked atomic ledger commit. Replays do not double-apply fills; pending
sells retain holdings until confirmed. Unknown submission/lookup/persistence errors
fail closed, blocking automatic resubmission. Reconciliation runs before another
Alpaca submission and on the positions CLI; no background polling was added.
This is a receipt book, not a shopping list: requesting ten shares no longer puts
ten on the shelf; each confirmed delivery updates stock and its receipt together.

Fresh local evidence: accounting45/45 including actual gateway/SDK/local HTTP/file
seam, accepted/partial/canceled/filled receipts, restart replay, rejected regression,
invalid identity/quantity, corrupt disk and injected atomic rename failure. Root/
ledger/projection/Compose focused15/15; clean native35/35; structure0; scanner0;
TypeScript compile0. Classifier1: three findings independently reproduced on HEAD
(buildRiskContext, collect, saveSubPositionsLedger), not a passing gate. Anti-cheat
zero strikes; YAGNI0. No provider traffic, deployment, orders, commit or push.

Remaining qualification: Windows execution, multi-account ledger namespacing,
operator handling of unknown submissions, and deployed/recovery/soak acceptance.
Other brokers retain existing accounting contracts; they are not qualified by the
Alpaca seam. Completed-order receipt records remain retained for idempotency;
compaction needs a separately proven retention policy. Existing legacy holdings
are not rewritten. Resource/exposure/backup acceptance remains open.
