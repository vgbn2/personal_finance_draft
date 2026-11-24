# GitHub-image test CT

## Nov24 matching-rule image publication

[GitHub run45220188546](https://github.com/vgbn2/personal_finance_draft/actions/runs/45220188546)
completed successfully for revision `cdc879d211eaeab2ec3b23b15d6c36f3a38fc1bc`,
source tree `9fd82bec8676ba21c23253bfd532fcc29d5473dd`. Both image smoke paths
passed; the all-in-one executable-rule gate passed14/14 in the actual container.
Published all-in-one digest:
`sha256:4f270b23ef0e0b30983a3c6ae9712f96e4027dff9deecdb2c18e81128e3eb71e`.
The publication step produced this digest; the test-load image digest is distinct.
Deployment and scheduled-cycle proof are separate gates, not implied by publication.

## Scope and identity

### AI failure diagnosis and source-only remediation, Nov24

CT104 remains on revision `1db5a0b0`: the replacement stopped at a backup
ownership mismatch (1000:1000 became0:0), before original-container replacement.
The original identity and full inventory were recovered and verified. Do not
use the simple Compose recreation command below while preservation is unresolved.

Repeated scheduled failures lasted about45seconds. This matches the configured
timeout but does not prove timeout causality: the deployed client collapses
transport, provider, empty-content and parse failures into null. Like several
alarms wired to one lamp, the final assertion loses the failing boundary.

Current **unpublished/local source**, not deployed proof, adds `[AI-FAILURE]` stderr
JSON with stage, fixed reason, elapsed_ms and optional HTTP status. It excludes
credentials, URLs, prompts, response bodies and exception messages. Strategy
synthesis uses only the configured router model; general chat retains its existing
Ollama fallback. JSON must be a complete object (optionally Markdown fenced), not
an array or prose containing an extracted object. Spec validation/timeframe rejection
also emits metadata while retaining the null/failure contract. No deadline or
quality gate was relaxed. These changes improve diagnosis, not provider reliability.

The existing GitHub All-in-One container gate now includes
`tests/scripts/strategy/ai_client_diagnostics.test.js` in local workflow source.
Continuation checks: focused27/27; read-only `node:24-bookworm-slim` container with
`--network none`13/13; image contract2/2. These are actual local checks, not a new
GitHub run, matching production image build, or whole-agent-isolation proof.

### Stopped-target archive finding (local qualification only)

Issue#113 continuation found a simpler alternative to a running maintenance
target: a numeric-owner tar exported from a stopped source, piped to plain
`docker cp - TARGET:/existing-parent/` **without `-a`**, retained12fixture entries
including3symlinks in a never-started local target. The direct API request with
`copyUIDGID=true` failed ownership equality. Both attempts and cleanup evidence
remain under `/tmp/opencode/runtime-goal/stopped-restore-review/`.

This is an observed transport difference, not a controlled single-parameter
causality proof: API path details also differed. Do not generalize the flag to
host-file copying or silently replace the existing rollout command. The previous
host-extracted snapshot path is not what passed. CT104 daemon/path qualification,
complete archive-header inventory validation and rollback proof remain separate
gates. No blanket chown, expected-owner changes or original-backup overwrite.

The subsequent **one-attempt CT104 transport qualification passed** on Docker
29.10.0 in its mapped LXC environment, using the original image and a fresh
synthetic `/app/issue113-fixture-…/` parent. All12entries/3symlinks matched,
source unchanged, target never started, both owned containers removed. Evidence:
`/tmp/opencode/runtime-goal/ct104-stopped-restore/REPORT.md`. This closes only
daemon/fresh-parent transport compatibility, not merging existing application
trees, complete-state recovery or integration into the rollout/rollback script.

#### 1. Inspection / Probe

Inspect container revision and the service journal before attributing any new
diagnostic event to a deployed fix. Existing old-image journal failures remain
evidence; a missing router journal record does not establish nonreceipt.

#### 2. Remediation / Action

Publish a matching reviewed immutable image only through the approved workflow;
deploy only after stopped-container backup/restore full metadata equality is
proved. Do not hot-patch the running container or recreate it without preserved
state. Global router observability remains unchanged: installed source has both
metadata-only and payload-capable implementations, with active reachability unresolved.

#### 3. Verification / Proof

```bash
node --test tests/scripts/strategy/ai_client_diagnostics.test.js tests/scripts/strategy/strategy_rules_boundaries.test.js # real loopback HTTP, parsers and spec boundary; no provider calls
```

Require actual scheduled deployed events after matching-image verification.
An `[AI-FAILURE]` timeout event proves the local client deadline expired, not the
provider's underlying reason. HTTP status proves only the observed response.
Successful generation still requires genuine data, validated rules, checksums and
unchanged gates; no stage/promotion/order call is introduced. Source tests do not
qualify deployed behavior or profitable strategies.

#### 4. Rollback / Emergency Exit

No runtime change occurred in this remediation pass. Retain the original container,
failed snapshots and diagnostic attempts. Any future rollout must use the existing
identity-checked rollback only after its snapshot path is independently verified;
it must not reuse a known-failing ownership gate as an assumed recovery guarantee.

Runner-linked observations, failed attempts and real stream evidence are under
`/tmp/opencode/runtime-goal/`; the task ledger remains the dated Nov22 handoff.

The isolated test is CT104 (`sv-github-test`) on `delloptiplex`, IPv4
`192.168.4.140/24`, with 4 vCPU, 6144 MiB RAM and a 40 GiB disk. It is an
unprivileged Debian 12 CT with Docker nesting/keyctl and no automatic CT boot.
Existing CT100 and production CT114 are not reused or modified.

The application comes only from
`ghcr.io/vgbn2/personal_finance_draft@sha256:12b853ca36df0a6cd51616c27231e2fdd5519b276b179b45e6ea5223978cfefd`.
Its published revision is `1db5a0b0d9f029024b589040cc09a4d0d3013cf7`, **not**
remediation commit `675ab788`. Testing this image cannot qualify newer fixes.

The Compose file is `/opt/sovereign-test/compose.yml`. It runs only the published
web command with a loopback port, 2 CPU/3 GiB container limits and no production
volumes. Separate test API/client tokens and the explicitly authorized router
credential reside in `/etc/sovereign/test.env` (0600). No broker/wallet execution
credentials are copied. Live trading and execution authorization remain false.

The published image packages application code; the host env file supplies secrets
at container creation. Like a sealed appliance with a separate keyring, the image
can be replaced without baking keys into it—but an older appliance remains old
code even when supplied with working keys.

## 1. Inspection / Probe

```bash
ssh -o BatchMode=yes delloptiplex 'pct config 104' # noninteractive; inspect only new CT
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- docker compose -f /opt/sovereign-test/compose.yml ps' # inspect service state
```

No CT SSH user/login has been configured by this deployment. Use `pct exec` for
operator access; do not expose port 8787 on the LAN merely to bypass that boundary.

Healthy: running service, expected pinned image, localhost-only port. Never print
the env file, full container inspection, or expanded Compose config with secrets.

## 2. Remediation / Action

```bash
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- docker compose -f /opt/sovereign-test/compose.yml up -d --no-build' # registry artifact only; no local build
```

Run only after registry pull, image identity and container runtime are verified.
Do not add a bot or second spawner sharing production account state.

## 3. Verification / Proof

```bash
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- curl --fail --silent --show-error http://127.0.0.1:8787/health' # HTTP failure must remain nonzero
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- docker compose -f /opt/sovereign-test/compose.yml config --quiet' # validate without expanding secrets
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- cat /sys/fs/cgroup/memory.events' # inspect actual OOM counters
```

Require unauthenticated protected API rejection and authenticated success in
addition to public health. A live AI-router models response proves authentication,
not strategy quality; discovery requires distinct durable evaluated candidates.
Rejection below the Sharpe gate is correct behavior, not permission to lower it.

### Recorded acceptance, 2026-11-23

- Docker Engine 29.10.0 / Compose 5.8.0; pinned image pulled from GHCR and its
  embedded revision checked. Web healthy, zero restarts/OOMs at the sampled check.
- Public `/health` 200; unauthenticated `/api/status` 401.
- Normal `ingest --family equities --symbol SPY --provider yahoo --timeframe 1d
  --days 30 --json` fetched 30 real candles with zero provider errors. Normal
  validation accepted 30/30, with 30 freshness warnings retained.
- Authenticated `/api/status?input=/app/storage/data/cache/last_fetch_scoped.json`
  returned 200/ok using the native status path. Default `/api/status` remains 503
  because no global `last_fetch.json` has been generated; that is not hidden.
- Authenticated data summary, strategies and auth-status endpoints returned 200.
- Router models returned 200/185 entries and configured model present; an actual
  minimal completion returned 200 with nonempty content. No broker keys copied.
- Initial verifier failure is retained under `/tmp/opencode/runtime-goal/`; the
  final verifier explicitly selects the actual scoped snapshot. No assertions
  were removed to conceal the absent global dataset.
- Dashboard HTML and its four referenced JS/CSS assets returned 200; this is
  HTTP asset delivery proof, not rendered-browser interaction proof. Native
  `/app/backend/cpp_core/build/sovereign_wealth --help` exited zero.
- An explicit test-container restart preserved scoped data and passed the same
  auth/status/router verifier. This proves restart recovery, not recreation.
- Two bounded AI-backed research evaluations ran against the 30 real Yahoo SPY
  bars, generating distinct checksums. Results: 4/5 simulated backtest trades,
  Sharpe −12.2153/−17.6533, max drawdown 7.4434%/7.6119%. These are **backtest
  events, not broker orders**. No staging, registry YAML, promotion, bot or
  background discovery daemon was invoked. Thirty daily bars are smoke-test
  input, not statistically sufficient strategy qualification.

Do not use `seed_master_fixture.js` to claim live data: its generated sample
prices are synthetic. These checks used actual provider ingestion instead.
Current test data lives in the container's writable layer, with no production
mounts; **recreating the container loses that test data**. Reingest/revalidate
explicitly after recreation rather than assuming persistence is qualified.

## Provider diagnosis boundaries

| Provider | Read-only observation | Remaining limit |
| --- | --- | --- |
| Alpaca paper/live | Both account GETs HTTP 200, ACTIVE/unblocked | No new order or fill tested |
| Deribit live | Host credentials authenticated HTTP 200 | Monitor container lacks these credentials; no production redeploy |
| Deribit testnet | Available resolved credentials rejected HTTP 400, code 13004 | Needs distinct valid testnet credentials |
| Polymarket | Authenticated open-orders GET HTTP 200, zero open orders | No submission/settlement proof |
| Gate.io | Credentials absent from inspected host/runtime | Simulation-shaped `connected` is not authentication |
| MT5 | Monitor TCP connection to localhost:8282 refused | Host login metadata exists; terminal bridge not available there |
| AI router | Models and actual completion HTTP 200 in test CT | Strategy profitability is independent |

The monitor reads a service-specific env file, not the host `.env`. A host key
can therefore be valid while its container cannot see it. Deribit testnet and
live are separate credential domains; moving a live key does not make testnet
authentication work. No live broker keys were transferred into CT104.

Existing CT114 quant logs and ledger showed repeated distinct AI candidates
roughly 76 seconds apart with unchanged Sharpe-gate rejections. That is observed
production discovery cadence, separate from CT104's two bounded evaluations;
neither proves long-term soak, promotion or profitable trading.

## Research-only periodic discovery in CT104

### Nov24 rollout continuation (source, not deployed)

Commit `932f498c` publishes safe AI failure categories and strategy-model identity
checks. GitHub image run `45350443026` is the matching publication attempt; its
launch is not evidence of a published digest or running revision.
`tools/operational/ct104_image_upgrade.sh` retains stopped numeric tar archives
without host extraction and keeps the original container for identity-checked
rollback. Its local Docker fixture proves ordinary files/directories only.
Links, unsupported tar headers, nonempty replacement state, or any full-config
divergence fail closed. Target preflight and rollback qualification are separate;
do not run it against CT114 or invoke it with `sh`.
Never replace preserved state, change ownership wholesale, or overwrite a failed
backup to force a rollout through its inventory gate.

The host-managed `sv-test-discovery.timer` invokes a oneshot service five seconds
after activation, then 90 seconds after each completed invocation. Systemd does
not overlap activations of this same service. Each invocation uses the published
image's generator and evaluator through `docker exec`; no application image is
rebuilt. Deployment scripts live under `/opt/sovereign-test/` in CT104.

The actual container worker also holds a nonblocking `flock` and runs under a
150-second `timeout` with a five-second kill grace, shorter than the host service's
180-second timeout. This guards against abandoned `docker exec` workers surviving
host-client termination. Lock exclusion and inner timeout were exercised directly.

The wrapper constrains evaluation to the recorded Yahoo SPY daily dataset,
recomputes the final spec checksum, and mirrors the published CLI's ordered
quality predicates: Sharpe ≥1.50, drawdown ≤0.20, trades ≥200. It does **not**
call the stager, YAML writer, execution adapter or promotion path. These mirrored
checks must not be represented as executing the stager itself. AI failure is
nonzero, never replaced with an algorithmic fallback.

Each successful research invocation atomically publishes a complete record to
`/var/lib/sovereign-test/discovery/` **outside the Docker container**. Rejected
candidates are retained with their input fingerprint, full final spec, metrics,
gate results and explicit `promotion:false` / `broker_orders:false`. Service
errors remain in the systemd journal; a pending partial record is removed.
The host flushes the completed file before rename and its directory afterwards.
These records survive application-container recreation, although the input
dataset still needs reingestion after recreation.

### 1. Inspection / Probe

```bash
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- systemctl list-timers sv-test-discovery.timer --no-pager' # inspect next scheduled activation
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- journalctl -u sv-test-discovery.service -n 30 --no-pager' # bounded recent run outcomes, no env dump
```

### 2. Remediation / Action

```bash
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- systemctl start sv-test-discovery.timer' # resume existing isolated research schedule
```

### 3. Verification / Proof

Require three timer-triggered records with distinct run IDs and spec checksums,
recomputed fingerprint equality, identical quality thresholds, real input bars,
no staging/promotion/order invocation, and unchanged application YAML inventory.
Thirty bars cannot qualify a strategy against a 200-trade minimum. The returned
engine is recorded; fallback must not be described as forced native execution.
The evaluator's model-based simulation does not establish that arbitrary
AI-generated entry/exit text is executable trading logic.

Observed timer-triggered completion evidence (2026-11-23 UTC):

| Completion | Final spec checksum prefix | Trades | Sharpe | Decision |
| --- | --- | ---: | ---: | --- |
| 05:48:40.953 | `bcb6e664ecbb` | 5 | −17.6533 | Sharpe below threshold |
| 05:50:31.041 | `117c25b06a23` | 5 | −17.6533 | Sharpe below threshold |
| 05:52:25.880 | `8c9564d052ca` | 5 | −13.0311 | Sharpe below threshold |

The matching-image verifier returned `verified_records:3`,
`distinct_checksums:3`, `gates_unchanged:true`, `staging_invoked:false` and
recomputed the recorded gate decisions from actual metrics. All returned engine
`sovereign_cpp_core`. Automated YAML inventory remained 108 files with SHA256
`51e96affadb460b30db1baf9f0e9562c3f4db1a2fd75ca922767bfc8363c9b5d`;
the normal candidate staging directory remained absent. Full scripts, records,
journal and verifier output are under `/tmp/opencode/runtime-goal/` locally;
the operational wrapper and durable records are in CT104 at the paths above.
The timer remains enabled. This proves scheduled research/dataflow, not strategy
profitability, live execution, arbitrary signal-code execution or long-term soak.

### Default-path readiness follow-up

The earlier default-path 503 is resolved. Published the existing genuine Yahoo
snapshot to `storage/data/cache/last_fetch.json` using an exclusive temporary
copy and rename, refusing to replace an existing default file. Publication
asserted all 30 rows were Yahoo/SPY and preserved the entire source byte-for-byte,
including `snapshot_scope.kind: scoped` and
`representative_of_global_live_health: false`. Normal CLI validation accepted
30/30 records, zero rejected/provider errors, with 30 freshness warnings retained.

Actual default `/api/status`, **without any input query parameter**, then returned:

```json
{"authenticated":false,"http":401,"ok":false}
{"authenticated":true,"http":200,"ok":true,"snapshot":{"path":"/app/storage/data/cache/last_fetch.json","exists":true,"bytes":20326}}
```

This establishes genuine-data default-path readiness, **not global live-feed
coverage**. Unfiltered ingest's dry-run planned 2,950 fetches; that broad workload
was not launched just to make a presence check pass. The published CLI also
supports explicit default output for normal provider backfill if new data is
required; do not seed synthetic fixtures or relabel scoped history as global.

### 4. Rollback / Emergency Exit

```bash
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- systemctl disable --now sv-test-discovery.timer' # prevent future calls and quota use
ssh -o BatchMode=yes delloptiplex 'pct exec 104 -- systemctl stop sv-test-discovery.service' # terminate a current research invocation if necessary
```

Retain records and journal evidence; no production runtime is involved.

## Generated-rule execution: failed qualification (old pinned image)

An isolated differential probe against the published image on the same 30 real
Yahoo SPY daily bars held the candidate model (`cnn_window_v0`), name, risk and
costs constant, changing only entry/exit strings and recomputing each checksum.
All three variants passed risk validation and returned identical complete
evaluation summaries:

| Rules | Trades | Sharpe | Net return |
| --- | ---: | ---: | ---: |
| Enter `close > 0`, exit `close < 0` | 5 | −17.6533 | −0.0761187 |
| Enter `close < 0`, exit `close > 0` | 5 | −17.6533 | −0.0761187 |
| Invalid syntax `INVALID_RULE_SYNTAX((` | 5 | −17.6533 | −0.0761187 |

All recorded closes were positive. The deliberately non-passing qualification
probe exited **1**, reporting `identical_evaluations:true` and
`generated_rule_execution_qualified:false`. These are identical returned
summaries, not an inspection of individual trade logs. Published
`shared/lib/strategy/interval_discovery.js:865–878` passes name, model, threshold,
horizon, cost, timeframe and engine to `runBacktest`, not entry/exit rules.
Thus scheduled synthesis/model evaluation works, but arbitrary generated rule
execution is **not qualified** and must not be described as working strategies.

Reproducer and exact base candidate: local
`/tmp/opencode/runtime-goal/generated-rule-{differential.js,base.json}`;
matching copies in CT104 container `/tmp/`. Output:
`/tmp/opencode/runtime-goal/generated-rule-result.json`.
Dataset SHA256:
`34e589936ed97ff59919c2be273633fb45f1704655efe6776ef5a7c45d28501e`.

### Follow-up: approved oracle correction and publication preparation

The user approved changing the full-fixture open-position assertion from one to
zero: the timeout exit leaves it flat and the last entry signal has no next bar.
The separate four-bar prefix test still requires an unfinished position. All14
rule tests now pass; no production lifecycle was changed to satisfy that oracle.
An HTTP regression also proves a requested daily timeframe reaches the AI prompt,
rejects an hourly response, and preserves an accepted daily response unchanged.

`tools/operational/ct104_research.js` is the source-controlled, observation-only
replacement for CT104's old `/opt/sovereign-test/periodic-discovery.js`. It requests
SPY/daily semantics before synthesis instead of rewriting the generated interval,
requires the structured-rule engine, and keeps Sharpe1.5/DD0.20/trades200 gates.
Publication workflow now runs the real rule tests inside the image and supplies
source revision/tree build arguments. Image publication and CT104 rollout require
separate runtime evidence; local tests do not prove a deployed update.

Before replacing CT104's container, stop its research timer/service, preserve its
entire tiny storage/workspace plus compose/wrapper files, and retain the old image
ID. No production host, broker credentials, or shared data mount is involved.
Restore and hash-verify genuine history before re-enabling observation; never
re-ingest or synthesize replacement data to hide loss during recreation.

Broader-suite follow-up found two legacy fixture tests called live AI and then
expected rule strategies to stage. They now select `ema_macd_trend` and the recorded
BTC fixture explicitly; metric, disk-write and staging assertions are unchanged.
Both pass. The live AI nullable smoke test remains distinct from offline proof;
do not report the first broad run (19pass/2fail) as green.

### GitHub build dependency blocker and approved fallback

Run [45218229378](https://github.com/vgbn2/personal_finance_draft/actions/runs/45218229378)
failed before container tests: ONNX1.17.1 upstream archive404. API probes for the
upstream repository/releases also returned404; no version upgrade was inferred.
The operator approved reusing the exact existing deployment artifact, published
as a non-latest dependency prerelease
[`sv-dependency-onnx-1.17.1`](https://github.com/vgbn2/personal_finance_draft/releases/tag/sv-dependency-onnx-1.17.1).

- Source image: `sha256:c37f7774d70e72884c5b90c923fd5a48d2399849b96ca4647aafe82ed96312a1`.
- Original library SHA256: `a34d8c226994dd4af2b2250442fc236ebba97aefc7ec451c35a86216588d2f69`.
- Repacked archive SHA256: `c389a5f69a57dfc798dde1170fc81184b594c4fb03c36f48ad1d4a746e1f71f8`.
- Headers, original license and third-party notices retained. Extracted from a
  newly created but never started network-disabled container; production unchanged.
- This is recovered deployment provenance, **not independent upstream signature
  verification**. ONNX stays enabled; linkage is not actual model inference proof.

The build workflow must create `/tmp/opencode` as the container's normal user
before the rule gate. Independent fresh-tmp reproduction failed12/2 without it
and passed14/0 with it. This test-environment setup does not alter assertions.
Run the staged harness inside the same image with
`node /tmp/generated-rule-differential.js`; expected exit **1** until the rule
execution contract is implemented. No orders, staging, YAML or AI calls are
performed by this probe; it reads the recorded dataset and evaluates in memory.

A positive control changing only holding horizon to one day produced **9 trades,
Sharpe −10.369**, confirming evaluation responds to numeric inputs rather than
returning a constant result. Independent source tracing confirmed model prediction
drives entries and horizon drives exits (`shared/lib/strategy/backtest.js:764–795`);
the C++ frame path serializes those predictions at lines 1033–1084. Textual rules
instead feed YAML documentation (`interval_discovery.js:998–1000`).

### Rule-contract decision required before implementation

Current source has the same gap as the published image. The AI output contract
(`shared/lib/ai/ai_client.js:179–199`) requests free-text causal conditions, not
a versioned executable schema. Built-in archetypes also contain prose such as
“MACD crosses below zero or trailing ATR stop reached”
(`shared/lib/strategy/interval_discovery.js:100–106`). Those strings cannot safely
be treated as JavaScript or assumed to specify fill timing, missing-feature
behavior, crossing semantics or competing exit priority.

Two materially different corrections require a deliberate domain decision:

1. Restrict discovery to existing executable models and numeric settings; mark
   rule text hypothesis-only and prohibit claiming arbitrary rule execution.
   This is the smallest honest contract but does not implement custom AI rules.
2. Define a bounded structured rule schema before implementing execution:
   allowed fields/operators, entry fill timing, exits and their precedence,
   holding-period units and missing-feature rejection. Human approval of these
   trading invariants is required; never execute generated strings with `eval`.

Neither path authorizes lowered gates or automatic promotion. No corrective
image has been published while this behavior choice remains unresolved.

## 4. Rollback / Emergency Exit

### 2026-11-23 local rule correction — partial, not deployed

Structured `rules.version: 1` now flows from AI JSON into discovery, checksum,
validated feature decisions and the JS research simulator. This replaces neither
legacy model strategies nor broker execution. It is a checklist that now reaches
the simulator instead of being replaced by the default model at the next desk.

- Owner: `shared/lib/strategy/strategy_rules.js`. Finite feature comparisons,
  crossings and bounded `all`/`any` groups only; no generated JavaScript execution.
- One symbol/timeframe, long-only, one position, next-open entry/exit, conservative
  gap stops and stop-first ambiguous bars, two-sided costs and bar-count timeout.
- Raw OHLC is validated before indicators; missing/mismatched genuine data rejects.
  Rule research does not use the legacy loader that can relabel BTC fixture data.
- Binary-store latest observations share the same rule/feature owner. They emit
  zero executable trade logs. Rule staging and generic CLI portfolio backtests
  reject; YAML exports are disabled and marked `research_only`.
- Realized-only metrics exclude open-position portfolio risk and are explicitly
  not promotion-qualified. No holdout sufficiency or live AI quality is proved.

Verification: 100 recorded Binance bars distinguish always-enter **14 trades**
from never-enter **0 trades**. Local HTTP response testing covers actual
HTTP/JSON → AI spec → rules → backtest, not a live model. Binary codec/latest
decision parity, dataset identity and invalid raw prices were also exercised.

Combined rule tests: **13 passed, 1 failed**. The failing assertion at
`tests/scripts/strategy/strategy_rules.test.js:68` incorrectly requires one open
position at the end of the full fixture. Actual timeout exit is 09:00 UTC; final
10:00 entry has no following bar, so flat is correct. The assertion is preserved
pending explicit approval to correct the test, not production behavior. A bounded
four-bar prefix separately verifies retention of an actually unfinished position.

Legacy focused tests: **23 passed**. Structure runner completed successfully;
anti-cheat reported **0 strikes**, YAGNI passed. Classifier reports six legacy
owner-placement warnings; no rule-owner warning. Full patches and raw logs:
`/tmp/opencode/runtime-goal/rule-execution-D1-complete.patch` and
`/tmp/opencode/runtime-goal/rule-D1-tests.log`.

No new image, CT104 replacement, production change or credential operation was
performed for this local correction. Deployment remains blocked.

#### 1. Inspection / Probe

```bash
git diff --stat # inspect tracked local scope; untracked rule files are additional
```

#### 2. Remediation

No operational command: local source is implemented; do not deploy the failing batch.

#### 3. Verification

```bash
node --test tests/scripts/strategy/strategy_rules.test.js tests/scripts/strategy/strategy_rules_seams.test.js tests/scripts/strategy/strategy_rules_boundaries.test.js # full gate; currently expected exit 1
```

#### 4. Rollback

Leave the running image pinned. Do not reset the shared worktree or remove evidence.

```bash
ssh -o BatchMode=yes delloptiplex 'pct shutdown 104 --timeout 30' # stop only test CT; retain disks and diagnostic evidence
```

Do not destroy CTs, remove credentials or replace production services as rollback.
