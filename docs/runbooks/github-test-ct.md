# GitHub-image test CT

## Scope and identity

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

## 4. Rollback / Emergency Exit

```bash
ssh -o BatchMode=yes delloptiplex 'pct shutdown 104 --timeout 30' # stop only test CT; retain disks and diagnostic evidence
```

Do not destroy CTs, remove credentials or replace production services as rollback.
