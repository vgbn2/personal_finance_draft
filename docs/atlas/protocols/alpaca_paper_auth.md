---
id: atlas.protocol.broker.alpaca_paper_auth
kind: protocol
title: Alpaca Paper API Authentication — Diagnostic Protocol & Known Failure Modes
status: current
owners:
  source:
    - path: shared/lib/brokers/alpaca_paper_auth_diagnostic.js
      symbol: runAlpacaPaperAuthDiagnostic
    - path: shared/lib/brokers/alpaca_env.js
      symbol: resolveAlpacaSettings
  tests:
    - tests/scripts/lib/alpaca_paper_auth_diagnostic.test.js
    - tests/scripts/integration/trading/alpaca_env_scope.test.js
  docs:
    - docs/atlas/protocols/alpaca_paper_auth.md
review_triggers:
  - alpaca-sdk-major-version-bump
  - env-var-name-change
  - protocol-contract-change
last_verified:
  revision: working-tree
  base_commit: 988af178657193bef888a542b0a2276bf36155be
  method: source-read + bayesian-diagnostic + live-curl + sdk-introspection
  session: 133
  date: 2026-08-18
---

# Alpaca Paper API Authentication — Diagnostic Protocol & Known Failure Modes

## Participants, Authority, And Boundary

- **Provider:** Alpaca paper trading API at `https://paper-api.alpaca.markets`
- **Credential owner:** `.env` (active runtime) and `.env.central` (alternate account / hpdesk)
- **Resolver:** `shared/lib/brokers/alpaca_env.js` → `resolveAlpacaSettings(env, { paper: true })`
- **Diagnostic runner:** `shared/lib/brokers/alpaca_paper_auth_diagnostic.js` → `runAlpacaPaperAuthDiagnostic()`
- **Scope:** Read-only auth check (`GET /v2/account`). No orders or mutations.

## Message Shapes And Units

### Required env vars (canonical names — code reads these exact strings)

| Variable | Canonical name | Notes |
|---|---|---|
| Paper base URL | `ALPACA_PAPER_BASE_URL` | No trailing `/v2` — client appends path itself |
| Paper API key | `ALPACA_PAPER_API_KEY` | 26-char alphanumeric |
| Paper secret | `ALPACA_PAPER_SECRET_KEY` | 43–44-char alphanumeric |
| Live base URL | `ALPACA_LIVE_BASE_URL` | Only needed for live trading (blocked) |
| Live API key | `ALPACA_LIVE_API_KEY` | Only needed for live trading (blocked) |
| Live secret | `ALPACA_LIVE_SECRET_KEY` | Only needed for live trading (blocked) |

### Required HTTP headers (Alpaca paper API)

```
APCA-API-KEY-ID: <ALPACA_PAPER_API_KEY>
APCA-API-SECRET-KEY: <ALPACA_PAPER_SECRET_KEY>
Accept: application/json
```

No `Authorization: Bearer`, no lowercase variants. Any deviation causes silent 401.

### SDK constructor (current `@alpacahq/alpaca-trade-api`)

```js
const { Alpaca } = require('@alpacahq/alpaca-trade-api');   // named export, NOT default
const client = new Alpaca({ keyId, secret, paper: true });   // param is `secret`, NOT `secretKey`
await client.trading.account.getAccount();                   // NOT client.getAccount()
```

## Ordering And State Transitions

```
resolveAlpacaSettings(env, { paper:true })
  → paper mode selected if ALPACA_PAPER_{API_KEY,SECRET_KEY,BASE_URL} present
  → URL lookup: ALPACA_PAPER_BASE_URL → ALPACA_BASE_URL/ALPACA_URL → hardcoded default
  → key lookup: ALPACA_PAPER_API_KEY → ALPACA_API_KEY/ALPACA_KEY
  → secret lookup: ALPACA_PAPER_SECRET_KEY → ALPACA_SECRET_KEY/ALPACA_API_SECRET

runAlpacaPaperAuthDiagnostic()
  → redactedSettings() → resolveAlpacaSettings()
  → parallel: raw_http path + sdk path
  → raw_http: fetch /v2/account with APCA headers
  → sdk: new Alpaca({keyId, secret, paper:true}).trading.account.getAccount()
  → returns { ok, paths:[{path_kind, outcome, http_status, latency_ms}] }
```

## Success, Error, And Degraded Semantics

| Outcome | Meaning |
|---|---|
| `accepted` (200) | Key is valid and recognized by Alpaca |
| `rejected` (401/403) | Key is invalid, revoked, or wrong account |
| `rate_limited` (429) | Provider rate limit hit |
| `unavailable` | Network/transport error |
| `inconclusive` | Unexpected error (likely a code bug, not a provider rejection) |
| `not_configured` | Env vars missing or endpoint not paper |

`ok: true` requires **both** paths to return `accepted`. If `ok: false`, check `paths[].outcome` individually.

## Retry, Timeout, Idempotency, And Cancellation

- Default timeout: 10 seconds per path (`AbortSignal.timeout(10000)`)
- No retry in diagnostic — single shot by design
- Idempotent: GET only, no side effects

## Trust And Compatibility Boundaries

### ⚠️ Two env files, two paper accounts

`.env` and `.env.central` contain **different** Alpaca paper account key pairs:
- `.env` → Docker container runtime (mounted as `required: false` root env layer)
- `.env.central` → hpdesk / non-Docker host invocations

**Never assume the two files point to the same Alpaca account.** The key in `.env` was found revoked in session 133 while `.env.central` was active. Always raw-`curl` both independently when diagnosing auth.

### SDK version contract

The installed `@alpacahq/alpaca-trade-api` uses a **namespaced API** (not the legacy flat API):

| Wrong (old SDK) | Correct (current SDK) |
|---|---|
| `const Alpaca = require(...)` | `const { Alpaca } = require(...)` |
| `new Alpaca({ secretKey })` | `new Alpaca({ secret })` |
| `client.getAccount()` | `client.trading.account.getAccount()` |

All three mistakes produce different failure signatures — `TypeError: Alpaca is not a constructor`, `AuthError` on construction, and `TypeError: not a function` — none of which produce a numeric HTTP status, causing `normalizeError` to classify them as `inconclusive` rather than exposing the real bug.

### URL suffix contract

`ALPACA_PAPER_BASE_URL` must **not** include `/v2`. The diagnostic constructs:
```js
`${settings.baseUrl.replace(/\/$/, '')}/v2/account`
```
If the env var were `https://paper-api.alpaca.markets/v2`, the request would go to `.../v2/v2/account` → 404, not 401.

## Observability And Recovery

### Bayesian diagnostic runbook (session 133, confirmed order)

Run these in sequence. Stop at first confirmed cause.

1. **Raw curl with `.env` key** — bypasses all Node code:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -H "APCA-API-KEY-ID: $ALPACA_PAPER_API_KEY" \
     -H "APCA-API-SECRET-KEY: $ALPACA_PAPER_SECRET_KEY" \
     "https://paper-api.alpaca.markets/v2/account"
   ```
   - `200` → key is valid; Node code has a bug (headers, URL, or env loading)
   - `401` → continue to step 2

2. **Raw curl with `.env.central` key** — cross-validates endpoint health:
   ```bash
   source .env.central
   curl -s -o /dev/null -w "%{http_code}" \
     -H "APCA-API-KEY-ID: $ALPACA_PAPER_API_KEY" \
     -H "APCA-API-SECRET-KEY: $ALPACA_PAPER_SECRET_KEY" \
     "https://paper-api.alpaca.markets/v2/account"
   ```
   - `200` → endpoint works; `.env` key is revoked → regenerate at app.alpaca.markets
   - `401` → both keys bad; check clock skew, then account status at Alpaca dashboard

3. **Key encoding check** — invisible chars or trailing newlines:
   ```bash
   node -e "require('./shared/lib/runtime/env.js'); const k=process.env.ALPACA_PAPER_API_KEY; console.log(JSON.stringify(k), 'len:', k?.length);"
   ```
   Expected: 26 chars, all ASCII 32–126.

4. **Env loading check** — confirm vars actually reach the resolver:
   ```bash
   node -e "require('./shared/lib/runtime/env.js'); console.log({ALPACA_PAPER_BASE_URL: process.env.ALPACA_PAPER_BASE_URL, key_set: !!process.env.ALPACA_PAPER_API_KEY});"
   ```

5. **Clock skew check** — Alpaca tolerates some skew but verify:
   ```bash
   date -u && curl -sI "https://paper-api.alpaca.markets/v2/account" | grep -i date
   ```

### Container env is baked at image build time

`config/` is **not** bind-mounted — only `storage/` is. After any env or config change:
```bash
cd infra/docker
docker compose build bot-alpaca-paper
docker compose up -d --no-deps bot-alpaca-paper
docker logs --tail 30 docker-bot-alpaca-paper-1
```

## Verification

- Session 133 (2026-08-18): all 8 hypotheses tested; `ok:true` confirmed after key swap + SDK three-bug fix
- `test:structure` 28/28 ✅
- Container logs post-rebuild: `paper_dca_test` scanning, `Total Equity: $100000` ✅
- RAG incident record: `storage/logs/rag/test_failures.jsonl` → `incident_id: alpaca-paper-auth-401-session-133`
