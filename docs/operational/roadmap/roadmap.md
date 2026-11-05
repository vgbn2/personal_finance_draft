# Project Roadmap

## Classified platform plan — 2026-11-04

Status: **planned, not approved for implementation**. This section owns the cross-platform sequence; linked subsystem documents own their details. Existing milestones below are historical claims, not current provider, security, deployment, or end-to-end certification. No credentials, authentication changes, remote operations, live ingestion, or trading are authorized by this plan.

### 1. What exists, and what works?

Evidence labels: **source** = inspected implementation; **offline-tested** = specific local contracts exercised; **unverified** = not established at runtime; **proposed** = future work. These labels are not interchangeable.

| Workstream | Current evidence and owner | Remaining boundary |
|---|---|---|
| Ingestion families | **Source:** `backend/scripts/data_ops/ingest_market_data/manifests.js` dispatches providers/families and reports explicit unavailable adapters | Configured does not mean implemented or live-ready; follow the [ingestion readiness plan](../../research/ingestion/2026-11-04-ingestion-readiness-plan.md) |
| Price-bearing instrument universe | **Offline-tested:** `shared/lib/market/configured_universe.js`; configured instruments, exclusions, writer/monitor agreement | Full provider-to-reader qualification for every enabled metric remains outstanding |
| Analysis asset/evidence taxonomy | **Offline-tested:** `shared/lib/analysis/assets/inventory.js`; real configuration, duplicate/conflict/unsupported handling | Explicit cross-layer identity mappings and downstream consistency, not a blind schema merge |
| Provider aliases and CLI symbol selection | **Source:** `shared/lib/market/provider_symbols.js`, `symbol_resolver.js` | Alias semantics, ambiguous selection, venue/currency identity and execution resolution need dedicated seam proof |
| Strategy classification | **Offline-tested:** strategy classification tests exercise real strategy files and the classifier CLI | Classification alone does not prove research quality, supported data, or safe execution |
| Custom API keys / 9Router / MCP | **Unverified:** no end-to-end custom-provider credential integration established by this bounded review | Trace existing configuration owners first; qualify actual endpoint/protocol/auth requirements before implementing |
| Human login / SSO | **Source:** `frontend/dashboard/src/lib/supabase.ts` is explicitly offline/null; backend Supabase service reports unconfigured | Password/OTP callsites and frontend local sessions do not establish working SSO or backend authorization |
| Research workflow | **Source/documentation:** [strategy explorer workflow](../../how_to/strategy_explorer_workflow.md), `backend/mcp_server/index.ts` and `lib/access_control.ts` are existing integration surfaces | Scraper/Tavily-to-research-to-paper workflow not exercised end to end here |
| Web/TUI testing | **Source:** existing responsive CDP and interactive virtual-terminal tests | No fresh app headless run or integrated RAM screenshot/computer-vision pipeline in this planning slice |
| Networking / remote access | **Documentation:** [security and deployment architecture](../../engineering/architecture/07_SECURITY_API_TESTING_DEPLOYMENT.md) and [deployment/TUI guide](../../how_to/docker_deployment_and_tui.md) | Actual listener exposure, proxy trust, access policy, SSO and revocation require separate authorized verification |

#### Data-family classification

Keep three independent questions: **what is it?**, **can this adapter acquire it?**, and **who may access it?**

| Domain | Configured families / meaning | Readiness treatment |
|---|---|---|
| Price-bearing instruments | `crypto`, `equities`, `indices`, `commodities`, `fx`, `prediction_market` in the configured universe | Validate symbol, venue, currency/unit, timeframe and provider mapping before writer jobs |
| Non-price coordinates/evidence | `macro`, `macro_alt`, `pmi`, `breadth`, `sentiment`, `onchain`, `crypto_tx`, `weather`, `flight`, `holdings`, `reserves`, `satellite_nrt`, `cargo` | Do not force these into price-series or scoreable-asset schemas; define metric units, dimensions and publication time |
| Analysis scoreable assets | `equity`, `cryptoasset`, `fx_pair`, `commodity`, `index` | Analysis eligibility is a domain policy, not ingestion readiness |
| Analysis evidence | Includes prediction markets and other context families | A prediction market can be price-bearing for storage yet evidence-only for this analysis policy; map deliberately |
| Operational configuration | For example `quote_feeds` | Not an asset or evidence series merely because it appears in the same configuration |

Requested incomplete adapters remain: Yahoo breadth ETF ratios (not constituent advance/decline breadth), OpenSky regional aggregates (not historical flight tracks), Blockchair chain/mempool aggregates (not transaction archives), and SEC filing metadata (not a defined institutional 13F portfolio feed). Define the intended SEC product before implementation. Kalshi historical exports were removed; current Kalshi remains. Polymarket history exists but coverage and effective sampling remain unqualified: see the [history assessment](../../research/ingestion/2026-11-04-polymarket-history-check.md).

#### Symbol classification and identity

| Layer | Existing representation | Required interpretation |
|---|---|---|
| Configured instrument | `${family}:${symbol}`, e.g. `crypto:BTCUSDT` | Acquisition/storage identity under current configured-universe policy |
| Analysis asset | `${family}:${market}:${symbol}`, e.g. `cryptoasset:GLOBAL:BTC` | Analysis normalizes crypto quote suffixes and retains the legacy provider symbol; not the same key |
| Provider identifier | Yahoo aliases such as `SPX → ^GSPC`, `XAUUSD → GC=F` | Some are proxies/futures, not economic equivalence to spot; preserve contract type and units |
| Human selection | CLI exact match, then first prefix/suffix match | Convenience search, not an unambiguous execution identity resolver |
| Strategy mode | `single_asset`, `multi_asset_strategy`, `portfolio_management` | Declares strategy scope, not provider entitlement or trading permission |

**Does classification work?** The focused offline run passed **12/12**, zero failures/skips: four asset-taxonomy tests, two strategy-classification tests, and six configured-universe/monitor tests. They exercise actual market configuration, real strategy files/CLI, writer/monitor universe agreement and real binary TS write/read without modifying the stored file during monitoring. This is useful boundary evidence, not an all-symbol/all-provider guarantee.

Real-config analysis inventory: 323 configured inputs, 114 matrix inputs, 92 raw inputs, 120 scoreable assets, 117 evidence descriptors, 30 unsupported entries, 45 duplicate declarations, zero identity conflicts, 57 duplicate legacy symbols and zero bare-symbol collisions. These counters overlap; do not sum them into a coverage percentage. Explicit unsupported states include ambiguous classification or missing subtype metadata. SPY/GLD are not treated as common stock by the analysis policy.

Reproduce the focused check, with temporary storage isolated:

```bash
TMPDIR="$CLAUDE_JOB_DIR/tmp" node --test \
  tests/scripts/architecture/analysis/asset_taxonomy.test.js \
  tests/scripts/architecture/strategy_contracts/strategy_asset_classification.test.js \
  tests/scripts/data/cache/market_monitor_snapshot.test.js
```

Outside the job runner, substitute an existing private temporary directory. No keys or provider calls are needed.

### 2. Credential, identity and networking boundaries

Proposed flow, not deployed topology:

```text
Human/device → private network admission → HTTPS ingress → app login/session
                                                        → API authorization
Agent        → separately scoped tool authorization     → research/paper tools
Backend      → endpoint policy + server-side secret      → data/LLM/search provider
Reviewed strategy → explicit execution approval + risk gates → broker
```

These are separate credentials and decisions:

| Layer | Purpose | Not a substitute for |
|---|---|---|
| Tailscale device/user admission | Reach an allowed private service | App authorization or provider entitlement |
| Tailscale OAuth client | Scoped automation against the Tailscale API | 9Router, Tavily, market-data, or broker API keys |
| App SSO/session | Establish human identity and session lifecycle | Backend route/tool permission checks |
| Agent capability | Bound which tools/data an agent may use | Human execution approval or unrestricted shell access |
| Provider credential | Authenticate a specific upstream service | App login, tailnet membership or permission to trade |

**Proposed custom-key wiring:** operator selects an approved provider and endpoint → backend resolves a logical secret reference → provider-specific adapter authenticates → UI receives only redacted configuration/status. Do not put upstream keys in frontend bundles, localStorage, strategy YAMLs, screenshots, fixtures, shared examples, or model prompts. Prefer existing backend owners over a new generic secrets framework. Qualify the actual 9Router deployment and its protocol before choosing header names, routes, model IDs or configuration fields; none are invented here.

Credential work must cover explicit configuration precedence, missing/invalid/expired keys, endpoint allowlists, SSRF/redirect controls, TLS, timeout/size limits, quotas/cost budgets, rotation/revocation and redacted errors. Development fixtures must remain keyless. Public data, optional paid enrichment and private trading remain distinct access classes.

**SSO choice to evaluate before implementation:** private single-operator access can start with Tailscale plus existing app authorization; multi-user access needs a defined OIDC/session/role contract. Tailscale documents Serve identity headers and an identity-provider option (`tsidp`), but neither is configured or tested here. Trust identity headers only across a controlled proxy path; prevent direct backend access and reject spoofed client headers. Serve user identity headers do not cover tagged devices in the same way as human users.

Acceptance includes listener/bind inventory, ingress/egress diagram, explicit grants, HTTPS, allowed origins, HTTP and WebSocket authorization parity, session expiry/logout/revocation, direct-backend/header-spoof rejection, denied-device checks, and a recovery route that does not expose the service publicly. No public exposure or remote-host changes are part of this plan.

Reference pages inspected: [Tailscale OAuth clients](https://tailscale.com/docs/features/oauth-clients) and [Tailscale identity](https://tailscale.com/docs/concepts/tailscale-identity). These are retrieved vendor references, not evidence of local deployment or a historical-version guarantee.

### 3. Quantitative research and AI workflow

Extend the existing [strategy explorer workflow](../../how_to/strategy_explorer_workflow.md), rather than creating a competing orchestration owner. The proposed workflow is provider-neutral and is **not launched** by this document.

```text
Human hypothesis/invariant
 → bounded search (Tavily MCP or approved alternative)
 → source extraction + provenance
 → data-family/symbol/history qualification
 → reproducible offline experiment
 → holdout/walk-forward + cost/risk checks
 → human review → paper trial
 → separate promotion decision (never automatic live execution)
```

- Prefer official APIs/recorded data over scraping. A scraper is optional and comes after a demonstrated gap; honor terms, robots rules, licensing, quotas and personal-data boundaries. Record source URL/date, acquisition time, permitted use and parser version.
- Treat web pages, MCP results and papers as untrusted data, never tool instructions. Isolate prompt injection; retrieved content cannot grant capabilities or request credentials.
- Human owns the hypothesis, mathematical invariant and acceptance threshold. AI assists literature collection, parameter scaffolding, test generation and evidence summaries; citations do not establish alpha.
- Require point-in-time availability, publication lags, timezone/units, corporate actions where applicable, survivorship/leakage controls, holdout/walk-forward evaluation, fees/slippage and reproducible data/code/config versions.
- Start with one explicitly invoked bounded job, not a daemon or multi-agent fleet. Set fetch/token/CPU/time/storage budgets, cancellation and audit status. Failed or missing data must block the experiment, not become fabricated prices.
- A first integration test should replay recorded research input through real parsing, strategy configuration, offline data reader and actual backtest output. Verify rejected input and absence of broker side effects. Add an approved bounded external smoke separately.

### 4. UI/TUI, login and RAM visual testing

Proposed information architecture: **Data → Research → Paper → Operations**, with Settings/Access separate and live execution visibly gated. Reuse current domain/API owners. Start by inventorying screens, commands, duplicate controls and active callers; delete or consolidate only after parity and accessibility proof. The [CLI roadmap](ROADMAP_CLI.md) is historical candidate input, not authorization for a second symbol registry or blanket rewrites.

Web and TUI must present the same distinctions: configured/implemented/qualified, fresh/stale/missing/corrupt, keyless/key-required/unavailable, local/remote identity, and paper/live mode. Show unavailable integrations honestly. Keep keyboard navigation, focus order, responsive layout and understandable error recovery.

Testing order:

1. Deterministic domain/API/state assertions first; then current Chromium CDP and virtual-terminal harnesses (`frontend/dashboard/tests/responsive_viewport.test.mjs`, `tests/scripts/tui/core/tui_visual_interactive.test.js`).
2. Add screenshots only where layout/state matters: narrow/wide viewports, login/logout/expiry, keyboard focus, loading/empty/error/stale states and secret redaction. Use a real served application and actual parser/storage boundaries; do not replace the API with shallow success stubs.
3. Keep browser profiles, frames, screenshots, traces and visual intermediates in private `/dev/shm` directories with a space budget and cleanup on success/failure. Confirm the directory is RAM-backed, disable disk caches where applicable, and prevent persistent screenshot uploads by default.
4. Add computer vision only for assertions deterministic DOM/PTY checks cannot cover. Fix viewport/fonts/clock where needed, document comparison tolerances and require human review of baseline changes. CV is supplementary: it cannot prove auth correctness, data lineage or execution safety. Never send sensitive screenshots to an external model without separate approval.

### 5. Small batches and dependency order

All batches below are **planned**, not implementing. Load is a relative coordination estimate (1 = one local boundary; 5 = several trust boundaries), not a measured effort or schedule.

| Order / load | Smallest next batch | Dependency | Acceptance / stop gate |
|---|---|---|---|
| P0a / 2 | Document cross-layer family/symbol mappings and unsupported cases using existing owners | Existing 12-test baseline | Explicit price/evidence/provider identities; no silent fuzzy identity at safety boundaries; characterize any change before production edits |
| P0b / 3 | Qualify one selected incomplete ingestion metric at a time | Product definition and access classification | Recorded payload → actual parser → validation → isolated storage → real reader; then separately approved provider smoke |
| P1a / 3 | Trace one custom provider's existing config/endpoint/credential owner | Chosen provider/protocol, no secret inspection | Missing-key/denied-endpoint/redaction/rotation tests; no keys in browser or agent context |
| P1b / 5 | Specify network ingress, app session, roles and agent permissions | Actual topology inventory and explicit auth choice | Local authorization tests before any separately approved remote access; HTTP/WS parity and revocation proof |
| P2 / 3 | One bounded research-to-offline-backtest job | Qualified data, chosen research access, tool permissions | Recorded-input replay, reproducible results, leakage/cost checks, no broker effects; paper promotion requires review |
| P3 / 3 | One Web/TUI workflow parity and decluttering slice | Stable state/auth contracts | Keyboard/responsive/error-state proof; preserve existing callers and accessible alternatives |
| P4 / 2 | RAM-only visual regression for that single workflow | Deterministic P3 checks and headless prerequisites | Real-app screenshots, redaction, no disk intermediates, bounded memory and cleanup; optional CV later |

Access design can proceed alongside data qualification, but agent automation cannot claim trustworthy results before its data gates pass. Remote activation waits for backend authorization; UI polish must not disguise incomplete auth. Live execution remains outside these batches.

**Recommended first batch:** P0a only—freeze family/symbol mapping examples and rejection cases. Then choose one P0b product (Yahoo ratios, OpenSky snapshots, Blockchair aggregates, or precisely defined SEC data), rather than implementing all integrations and SSO together. Any production change needs its own approved scope and exercising test. No runtime code changed for this roadmap.

Detailed prior findings remain in the [ingestion/configuration/test audit](../../research/ingestion/2026-11-04-ingestion-config-test-review.md). This plan does not approve those repairs or supersede `workspace/STATE.md` project direction.

---

## Historical implementation milestones

The headings and checkboxes below are retained as historical records; current readiness is scoped by the evidence and gates above.

## Initial Platform Setup (COMPLETE)
- [x] Core directory structure (backend, shared, Frontend)
- [x] Documentation of data contracts
- [x] Config slots
- [x] Build system (CMake)

## Phase 2: Data Contracts And Asset Calculations (COMPLETE)
- [x] Asset identity system (`backend/core/src/data/data_snapshot.hpp`)
- [x] Universe loading (`loadMarketUniverse()` in `data_snapshot.cpp`)
- [x] OHLCV parsing/validation (`data_validator.cpp`)
- [x] Technical indicators (`indicators/indicator_engine.cpp`: RSI, MACD, ATR, Bollinger Bands, rolling vol)
- [x] Data quality reports (`DataQualityReport`, `data_quality_report.json`)
- [x] Ingestion adapters per family (equity, crypto, FX, index, macro, news, sentiment)
- [x] Stats engine (Sharpe, Sortino, Calmar, drawdown, Monte Carlo)
- [x] Risk guard (drawdown circuit-breaker)
- [x] Correlation engine (Pearson + Spearman matrix)
- [x] Quote feed contracts (MT5/Webull injectable adapters)

## Phase 3: Research, Backtesting, And Quantitative ML (COMPLETE)
- [x] Backtest engine (`backtester.cpp`, deterministic long-only & annotated paths)
- [x] Strategy runner / replay (`replay/strategy_runner.cpp`)
- [x] Transaction cost model (slippage drag and per-side fee deductions in backtester)
- [x] Feature frame builder (`backend/core/src/features/feature_frame.cpp`)
- [x] Model candidate registry (`backend/cli/sovereign_cli.js model compare`)
- [x] Autonomous Strategy Explorer daemon (6D novelty hypercube search)
- Canonical Spec: [03_NATIVE_CORE_AND_BACKTESTER.md](../../engineering/architecture/03_NATIVE_CORE_AND_BACKTESTER.md), [04_QUANTITATIVE_ALPHA_AND_ML_WORKBENCH.md](../../engineering/architecture/04_QUANTITATIVE_ALPHA_AND_ML_WORKBENCH.md)

## Phase 4: Macro/Market Model & Prediction Markets (COMPLETE)
- [x] Macro data ingestion (FRED, World Bank, news/sentiment adapters)
- [x] Regime classification (`backend/core/src/research/regime_classifier.cpp`)
- [x] Economy health scoring (`backend/core/src/research/economy_health.cpp`)
- [x] Polymarket Gamma & CLOB 1s L2 orderbook snapshotting
- [x] Prediction market virtual paper trading simulator (`backend/gateway/src/paper_ledger.js`)
- Canonical Spec: [06_PREDICTION_MARKETS_AND_ORDERBOOK_ARCHIVE.md](../../engineering/architecture/06_PREDICTION_MARKETS_AND_ORDERBOOK_ARCHIVE.md)

## Phase 5: Portfolio Monitoring, Dashboards & Execution (COMPLETE)
- [x] Sovereign Ink v7 TUI Terminal Dashboard (`backend/cli/sovereign_dashboard.mjs`)
- [x] React 19 + Vite Web Dashboard (`Frontend/dashboard/`) & Native HTTP API bridge (40 routes)
- [x] Broker adapters (Alpaca Paper/Live, Gate.io, Polymarket)
- [x] Virtual Sub-Positions Ledger (`shared/lib/trade/sub_positions_ledger.js`)
- [x] Pre-Trade Risk gates (<15µs C++ check, max drawdown circuit breakers, hardware PIN authorization)
- Canonical Spec: [05_EXECUTION_SUB_POSITIONS_AND_RISK.md](../../engineering/architecture/05_EXECUTION_SUB_POSITIONS_AND_RISK.md), [07_SECURITY_API_TESTING_DEPLOYMENT.md](../../engineering/architecture/07_SECURITY_API_TESTING_DEPLOYMENT.md)
