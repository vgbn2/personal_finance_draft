# Ingestion, configuration, and test review

Date: 2026-11-04. Scope: **connective-tissue**, **Hard Reading Mode**, audit only. Baseline: `26245ae7` on local `main`; upstream changes were not merged. No production/test changes, installs, live orders, account probes, credential-file reads, or deployment qualification.

## Follow-up requested after the audit

The audit below describes baseline `26245ae7`. The user subsequently requested removal of incomplete Kalshi historical markets/candlesticks and assessment of existing Polymarket backfilling. The two Kalshi history function declarations and their imports/exports were removed; current Kalshi snapshot support remains. History dispatch still rejects unsupported Kalshi requests rather than silently returning current data. Updated real-module contract tests failed before removal and passed afterward: eight focused ingest/research tests, syntax checks, and anti-cheat (zero strikes). No live backfill was run. This follow-up does not repair the seven baseline audit findings.

Requested retained capabilities, traced to `configs/markets/data_sources.yaml`:

- Yahoo breadth (`154–157`, `190–193`): ETF ratios `SPY/RSP`, `QQQ/SPY`, `IWM/SPY`, not constituent advance/decline counts. The fetcher remains incomplete.
- OpenSky (`102–106`): regional aircraft count, average velocity/altitude, and on-ground share; not individual flight histories.
- Blockchair (`107–112`, `149–152`): Bitcoin/Ethereum aggregate chain and mempool statistics; not a declared full individual-transaction archive.
- SEC (`119–123`, `195–197`): AAPL/MSFT company filing metadata, SIC, and insider flags. Despite the `holdings` name, no explicit 13F institutional-portfolio contract is defined. SEC company-facts analytics elsewhere are a separate surface. Official Form 13F concerns institutional-manager securities holdings, not this declared company-filings schema; reference: https://www.sec.gov/files/480.pdf . Retaining these declarations is not implementation of their fetchers.

## Verdict

The repository has real HTTP ingestion, storage validation/quarantine, binary time-series storage, native analytics, and intentional zero-key paper/fixture paths. It is not an ingestion stub repository. Several declared provider capabilities deliberately throw `not_implemented`, and some setup/runtime contracts disagree. A passing default test run is not evidence that every test's logical oracle has been reviewed.

**Execution baseline:** default Node runner exited 0: **1,658 total; 1,651 passed; 7 skipped; 0 failed**. Native CTest passed **35/35 Debug and 35/35 Release** in isolated RAM builds. These are separate runs, not additive unique-test counts. Exact-path reconciliation now covers all **318 tracked test-naming paths**, including all **266 default Node targets**, with no missing paths; source review is distinct from execution and production coverage.

## Confirmed findings

All findings below have primary fault domain `our_source`, confidence **proven within the stated boundary**, and stub involvement `none` unless stated otherwise. They do not establish live deployment or provider-account failures.

| ID / severity | Exact source boundary | Causal evidence and consequence | Repair owner / clearing check |
|---|---|---|---|
| CFG-01 / MEDIUM | `shared/lib/brokers/gateio_env.js:11` | Setup requires `GATEIO_API_PASSPHRASE`, but `resolveGateIoSettings` at line 24 consumes only key, secret, and URL. An inert A/B changes report `ok:false` to `true` by adding only passphrase, while adapter settings remain identical. Valid key+secret configuration is rejected by setup validation. | Broker environment spec; key+secret-only setup must validate without inventing a credential. |
| PKG-01 / MEDIUM | `tests/run_node_tests.js:239`; `package.json` engines | Package metadata accepts Node 20, while the runner requires `fs.globSync` and explicitly returns exit 2 without it. Host execution used Node 24; missing-feature simulation, not an actual Node 20 run, demonstrated the gate. | Runtime metadata/setup docs or runner compatibility; exercise the declared minimum runtime. |
| PKG-02 / LOW | `scripts/dev/setup_dev.js:100` | Setup prints `start:api` and `start:frontend`, neither of which exists in root scripts. Actual commands are `api:dev` and `dashboard:dev`. | Developer setup output; every printed command must resolve to a package script. |
| TST-01 / MEDIUM | `backend/go/pkg/sovt/sovt_test.go:10–20` | From the Go package directory, `../../../` resolves to repository `backend`, fails its package lookup, then selects a stale machine-specific absolute fallback. The unqualified Go run failed fixture lookup; the same run with `SOVEREIGN_REPO_ROOT` passed two tests and intentionally skipped one absent fixture. | Go fixture-root resolver; run from a relocated checkout without an override. |
| TST-02 / LOW | `scripts/mcp/test_mcp_agent.js:23` | `test().catch(console.error)` logs a rejected promise but does not set failure status. An inert child using that exact rejection-handler pattern logged the error and exited 0. The real agent was not invoked because it can backfill/backtest. | MCP smoke harness; a real asynchronous failure must exit nonzero. |
| TST-03 / LOW | `tests/integration/live_paths.test.js:93–106` | “At least 1 market” is tested with `marketsScanned >= 0`; 0 passes, and 0.5 also passes despite the integer wording. This is a proved test-oracle mismatch, not a demonstrated production backtest defect. Gate is `SOVEREIGN_LIVE_TEST=1`; it was not enabled. | Live-path test oracle; reject zero and nonintegers if that is the intended contract. |
| CFG-02 / MEDIUM, bounded | `shared/lib/profiles/mt5_profiles.js:104–129`; `shared/lib/runtime/environment_manifest.js:298–313` | The MT5 consumer accepts `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER`, and `SOVEREIGN_MT5_TERMINAL_PATH`, but these are absent from the manifest. Projection with inert MT5 values plus `PORT` retained only `PORT`. The scanner recognizes literal `process.env.KEY`, not dynamic `env[...]`/helper access, so its zero-unclassified result cannot establish completeness. **Local dotenv loading is not filtered**; this proves omission at bounded child/Compose projection, not every MT5 invocation failing. | Environment manifest/scanner owners; explicit inventory and surface-specific round-trip tests for dynamic credential families. |

### Additional verified limitations, not invented outages

- `backend/execution/src/adapters/gate_io_adapter.ts:220–235` refuses `getQuote` without credentials, although Gate documents public market ticker endpoints. This is **repository over-gating**, not an upstream requirement for market-data keys. Its return value is a logged `0` unavailable sentinel; downstream risk effects were not established.
- `shared/lib/providers/binance.js:60` implements a real public closed-kline WebSocket feed, persistence, reconnect, and stop handling. Exact named-reference search under `shared/`, `backend/`, and `tests/` found its definition and export only. **No direct named caller was found**; this is not proof against every possible dynamic/SDK wiring path.
- `tests/scripts/integration/polymarket/polymarket_tunable_backfill.test.js:130–148` asserts success for symbol/volume filter scenarios without asserting the selected market set. The oracle is narrower than the test title; no production filtering failure is claimed.

## Ingestion ownership and actual stubs

Network ingestion is owned by Node providers/dispatch. Validation and quarantine precede cache/binary storage; native analytics consume normalized/local data. `backend/core`'s `ingestion_adapter.cpp` is a real local-file parser: **adapter_not_stub**, not an unfinished network client. Paper ledgers, recorded fixtures, and explicit simulation modes are intentional test/development surfaces, not production feed implementations.

`backend/scripts/data_ops/ingest_market_data/manifests.js:48–53` creates an error with `code='not_implemented'` and throws. Reviewed incomplete branches include OpenSky flights, Blockchair on-chain transactions, SEC holdings, S&P Global PMI, FXAPI, Yahoo breadth proxy, and Kalshi historical markets/candlesticks. Classification: **production_stub / explicit unavailable capability**. These do not silently report successful ingestion. Provider support must be stated per function/family, not inferred from a provider name appearing in a manifest.

## REST, WebSocket, and credential matrix

“WS candidate” means an upstream capability suitable for an additional live path, **not** proof this repository already subscribes to it. Keys and WebSockets are independent axes. Keep REST for initial history, gap fill, snapshots, and reconnect recovery.

| Provider / repository boundary | Market-data authentication | WS role and constraints | Private/account/trading distinction |
|---|---|---|---|
| Binance | Public spot candles/market streams need no API key. Repository has public REST and exported kline WS. | Strong live-polling replacement candidate; direct caller not found in searched trees. Keep REST backfill. | Signed private/trading operations require appropriate authentication; public WS does not authorize orders. [1] |
| Coinbase | Repository historical candles use the Exchange HTTP interface; do not conflate it with Advanced Trade/CDP. | Public market channels exist; product-specific subscription/auth rules apply. Repository live wiring not demonstrated. | Advanced Trade private/user APIs have their own JWT authentication. [2] |
| Alpaca | Repository candle provider explicitly requires paper key+secret. Market streams authenticate; feed/plan entitlements matter. | Candidate for live bars/quotes; an IEX entitlement is not a SIP entitlement. | Account/order streaming is a separate authenticated interface. Paper credentials do not imply live authorization. [3] |
| Polymarket | Public market data/market WS separate from authenticated user WS. | Market book updates can replace polling; retain CLOB REST snapshots and sequence-gap recovery. Existing PolyBolt monitor is separate from blanket ingestion support. | User stream uses CLOB credentials; orders involve signer/L2/funder/signature configuration. [4] |
| Gate.io | Vendor public REST/WS market data are distinct from private signing. Repository `getQuote` currently over-gates. | Candidate for live ticker/book updates; REST remains for history/recovery. | APIv4 private signing uses key+secret; the repository-required passphrase is not used by its resolver. [5] |
| Deribit | Public methods can be unauthenticated. | HTTP and JSON-RPC WebSocket interfaces; subscribe for live updates where implemented. | Private methods use OAuth/client authentication and authorized account scope. [6] |
| Twelve Data | Repository/API require a key; subscription/credits constrain access. | WS prices are a candidate subject to plan limits. | A data subscription is not broker order authorization. [7] |
| Finnhub | Repository requires a Finnhub key. | Upstream WS/entitlement details were not independently confirmed from extractable official docs in this audit. | Do not promise a free/keyless socket or account execution. |
| FRED | Official web-service API key required. | No verified official WS replacement; scheduled economic series are not tick feeds. | Not a broker trading credential. [8] |
| CoinGecko | Repository sends anonymous HTTP requests; current official setup documents API keys. Anonymous code is not an upstream production-access guarantee. | Official overview includes WS; exact plan entitlement not established here. | Market-data access only; do not equate with order authorization. [9] |
| Frankfurter | Official public service explicitly needs no key. Repository uses v1 HTTP with legacy fallback. | Daily/reference and historical FX, not live trading; no verified WS replacement. | Self-host key settings are separate from public-service access. [10] |
| Yahoo | Repository HTTP adapter; unofficial access is not a supported upstream API guarantee. | No verified official developer WS contract in this audit. | Do not paste invented Yahoo keys. |
| ECB, World Bank, NASA, Alternative.me | Real endpoint-specific HTTP adapters. No universal key requirement should be inferred across their products. | Scheduled/reference datasets; no verified official WS replacement for the reviewed endpoints. | Alternative.me Fear & Greed is a separate endpoint from its coin listings API. [11] |
| Google interest/search proxy | Repository requires Google API key and custom-search engine ID. | Not interchangeable with a market tick stream. | Search-service credentials, never frontend/public variables. |
| TradingView | Repository uses a third-party client. | Official chart-library Datafeed API is an integration contract, not a free vendor market-data service. Do not promise official WS entitlement from client presence. | Product/auth/terms must be checked separately. [12] |
| Kalshi | Repository historical capability remains fail-loud incomplete. | Official WS handshake authenticates; documentation supports Ed25519 and RSA-PSS signing. WS does not fill in the repository's historical stub. | Account credentials/signing required for the authenticated connection. [13] |
| MT5 | Local terminal/profile/TCP bridge. | Not a generic public WebSocket replacement. | Broker terminal credentials and operator authorization are separate from public feeds. |
| OpenSky, Blockchair, SEC, S&P Global, FXAPI | Reviewed repository families incomplete. | Exact current endpoint auth/WS entitlements not fully verified. | Do not present these names as working, credential-ready integrations. |

## Copyable newcomer setup

Use **Node 22+**, **npm 10+**, CMake 3.15+, and a C++20 compiler. Go is needed only for the separate Go surface. Python/venv is not a repository runtime prerequisite. The dashboard path is lowercase **`frontend/dashboard`**.

The following commands are guidance only: they were **not executed as an install/setup** during this audit. Run from the repository root on a development machine. Review your local template before using setup; access to `.env.example` was denied in this audit, so its contents are not certified here.

```sh
node --version
npm --version
cmake --version
# Installs dependencies, initializes missing config, builds, seeds, and tests.
# setup_dev.js preserves an existing .env rather than overwriting it.
npm run setup:dev
npm test
npm run api:dev
# In a second terminal:
npm run dashboard:dev
```

Do not run a blanket `cp .env.example .env` over existing configuration. Do not use `SOVEREIGN_MOCK` as execution authorization. Zero-key tests use fixtures/paper state; they do not require broker credentials.

### Safe configuration fragment to merge, not overwrite

These names are traced to code, not copied from the denied template. Keep them in local backend configuration; never expose secrets through `VITE_` variables, source control, shared screenshots, or a client bundle. Empty values below are intentionally not working credentials.

```dotenv
# Baseline: private local development; no live authorization.
LIVE_TRADING=false
SOVEREIGN_EXECUTION_AUTHORIZED=false
SOVEREIGN_WEB_HOST=127.0.0.1
SOVEREIGN_WEB_PORT=8787

# Optional Alpaca paper DATA only; leave absent/empty for zero-key fixture tests.
ALPACA_PAPER_API_KEY=
ALPACA_PAPER_SECRET_KEY=
ALPACA_DATA_FEED=iex

# Optional paid/keyed data services: enable only the provider you use.
FINNHUB_API_KEY=
TWELVE_DATA_API_KEY=
FRED_API_KEY=
```

Binance public market-data REST/WS and Frankfurter public FX need no keys. Gate private settings are `GATEIO_API_KEY` and `GATEIO_API_SECRET`, but its current setup checker has CFG-01; do not fabricate a passphrase to claim the integration is fixed. MT5 has CFG-02 at bounded projection. Polymarket and Deribit private setup should remain separate, provider-specific operator workflows—not a universal paste-all-keys file.

## Test execution, logic, and limits

- Default discovery: 266 Node files under `tests/scripts`, `tests/web`, `tests/analysis`, and `backend/api/tests`. It does **not** mean every test in the repo.
- Tracked test-naming inventory: 318 paths. The 52 default-excluded paths include 35 C++, two Go, one documentation scaffold, one responsive MJS suite, one Python data-ops file, 11 benchmarks, and one live-path suite. Helpers and the unrelated untracked Python workflow test are additional surfaces.
- Runner/reporter focused checks passed 9/9; real passing/failing child probes demonstrated exit-status propagation in per-file and batch modes. Default per-file timeout is 120 seconds, not an artificial 20-second test budget.
- Native Debug/Release both passed 35/35. Release `-DNDEBUG` alone is not evidence that checks disappeared; no disabled-check defect was demonstrated.
- Separate ancillary checks passed 12 tests. Do not add overlapping run totals to the default suite.
- Go root failure is TST-01. An absent AAPL binary intentionally skips; it is not a codec crash.
- Responsive suite encountered missing Vite before browser assertions in an isolated checkout: **environment/prerequisite failure**, not a verified rendering defect or headless PASS. Isolated dashboard 404 likewise lacked built assets. An isolated kill-switch 503 remains unresolved/environment-dependent; the prepared main default API suite passed.
- Python files were source-reviewed only; no Python pass/fail is claimed. Heavy benchmark execution and live-path execution were not performed.
- Existing tests include injected-module stubs and in-memory payloads. Such tests can prove orchestration but do not alone establish real provider-payload parsing or end-to-end safety. Fixture-backed storage/codec tests carry a different evidence boundary.
- Architecture contracts often prove source shape, registrations, and marker presence. They complement rather than replace runtime behavior tests.
- The authored report page passed a separate Chromium check at 390px and 1280px in light/dark themes: no horizontal page overflow, all navigation anchors resolved, expected title and seven sections present. This verifies the report page, **not the application dashboard**. An initial harness assertion expected six sections; correcting that expectation required no page change.

### Fresh closeout verification

- Focused runner/reporter suites: exit 0, **9/9 passed**, zero failures.
- `npm run test:structure`: exit 0, **35/35 passed**.
- `npm run hygiene`: exit 0, all checks passed; this does not mean the Git worktree is clean.
- `anti-cheat-enforcer --diff --require-tests`: exit 0, **zero strikes**.
- `doc-drift-sentinel --dir docs --strict`: **exit 1**, reporting 80 documentation-reference candidates. These were not individually confirmed; neither a documentation-clean pass nor 80 proved defects is claimed.

### Logical-review coverage gate

Final exact-path reconciliation covers **318/318 tracked test-naming paths** and **266/266 default Node targets**, with zero missing paths. Initial scan-only/truncated ingestion reads and unread trading paths were returned to their reviewers and completed; the native reviewer independently covers the ingestion-contract C++ file. The coordinator read both runner/reporter contract suites in full.

The tracked inventory comprises 306 non-benchmark/non-Python test paths with full logical reads, 11 benchmark paths with logical-only review, and one Python path with read-only review. The unrelated untracked Python workflow test and support/harness paths are recorded separately. This closes the enumerated all-tests **source logical-review** pass, not execution of every surface, proof of all possible test naming conventions, or certification of application behavior.

Per-path owners, review depths, inventory, and evidence limits: [`2026-11-04-test-review-coverage.json`](2026-11-04-test-review-coverage.json).

### Tool/access limitations

Private HTML Artifact publication was attempted but blocked by token-only session authentication; no hosted page was created. The repository Markdown and JSON ledger are the durable deliverables. To enable a hosted page later, use a claude.ai subscription login in a session without the overriding `ANTHROPIC_AUTH_TOKEN`; no authentication settings were changed here.

`.env.example` read was denied; no permission bypass was attempted and template claims from another worktree are excluded. `arch-drift-check` could not execute (permission denied); no chmod/interpreter bypass. Documentation drift scanning returned candidates that were not all verified, so it is not evidence that every listed document is broken. No clean-install, live-provider, host, recovery, soak, or production readiness certification is made.

## Recommended order, not an approved implementation

1. Align Gate setup fields and runtime floor; correct printed startup commands.
2. Repair Go test root resolution and MCP failure status; strengthen the demonstrated weak test oracles.
3. Inventory dynamic MT5 environment families and test intended projection surfaces without broadening private-secret exposure.
4. Wire a chosen live stream only after explicitly defining closed-bar semantics, provenance, disconnect/gap behavior, and REST recovery. Do not replace historical endpoints with sockets.
5. Complete provider-specific fixture-to-codec seams before claiming production feed coverage. Do not rewrite tests or production behavior during this audit.

## Primary sources verified during the audit

1. Binance: https://developers.binance.com/en/docs/products/spot/web-socket-api and https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md
2. Coinbase: https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/introduction and https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/overview
3. Alpaca: https://docs.alpaca.markets/us/docs/streaming-market-data ; https://docs.alpaca.markets/us/docs/websocket-streaming ; https://docs.alpaca.markets/us/docs/about-market-data-api
4. Polymarket: https://docs.polymarket.com/api-reference/wss/market ; https://docs.polymarket.com/api-reference/wss/user ; https://docs.polymarket.com/getting-started/api
5. Gate: https://www.gate.com/docs/developers/apiv4/en/ and https://www.gate.io/docs/developers/websocket
6. Deribit: https://docs.deribit.com/articles/authentication and https://docs.deribit.com/articles/deribit-quickstart
7. Twelve Data: https://twelvedata.com/docs and https://twelvedata.com/docs/introduction/quickstart
8. FRED: https://fred.stlouisfed.org/docs/api/api_key.html
9. CoinGecko: https://docs.coingecko.com/reference/introduction
10. Frankfurter: https://frankfurter.dev/
11. Alternative.me: https://alternative.me/crypto/fear-and-greed-index/
12. TradingView: https://www.tradingview.com/charting-library-docs/latest/connecting_data/Datafeed-API/
13. Kalshi: https://docs.kalshi.com/getting_started/quick_start_websockets and https://docs.kalshi.com/getting_started/api_environments

This is dated audit evidence, not a promise of future vendor access, plans, availability, or licensing.
