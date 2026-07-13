# Asset Analysis and UI Overhaul Plan - 2026-07-13

Status: planning only. No production implementation is approved by this document.

## Objective

Replace the one-size-fits-all technical scorecard with a family-aware research system that keeps one
canonical scorecard contract while using different evidence and scoring policies for equities, crypto,
FX, commodities, and indices. Redesign the research UI around family screening and asset drill-down
without duplicating provider, scoring, API, or navigation ownership.

## Current Repo Evidence

- `backend/cli/commands/research/scorecard.js` sends every universe entry through the same OHLC technical
  analyzer and ranks by heuristic vote strength.
- `backend/cli/lib/utils.js:get_Full_Universe_Symbols()` mixes assets with macro, PMI, sentiment,
  reserves, holdings, and prediction-market evidence series. It also deduplicates by bare symbol.
- `config/markets/data_sources.yaml` mixes stocks, ETFs, indices, macro series, providers, and evidence
  families in one ingestion-oriented file.
- The frontend declares `/api/scorecard` but has no typed scorecard client, scorecard view, or browser
  viewport test harness.
- `onchain`, `crypto_tx`, `holdings`, and `breadth` are structured `not_implemented` lanes. They must not
  appear as successful empty data in the new UI.
- Macro normalization is partially present, but release/vintage timestamps and the committed Supabase
  schema need alignment before macro observations can support point-in-time scores.
- Current Yahoo support is chart-price ingestion only. No earnings or statement adapter exists.

## Core Correction

Do not model macro, holdings, sentiment, breadth, or on-chain observations as assets.

### Asset families

- `equity`
- `cryptoasset`
- `fx_pair`
- `commodity`
- `index`
- Later, only with separate approval: `prediction_market`, `rate`, `fund`, `bond`

### Evidence domains

- `technical`
- `fundamental`
- `macro`
- `onchain`
- `market_structure`
- `breadth`
- `supply_demand`
- `positioning`
- `sentiment`
- `catalyst`
- `data_quality`

Macro is cross-cutting evidence. It is not a generic replacement for technical analysis on every
non-equity/non-crypto asset. FX, commodities, rates, and indices need different macro mappings.

## Canonical Contracts

Create one shared contract package before adding a provider or UI page.

### AssetDescriptor

Required fields:

```json
{
  "asset_id": "equity:US:AAPL",
  "symbol": "AAPL",
  "family": "equity",
  "subtype": "common_stock",
  "market": "US",
  "sector": "technology",
  "quote_currency": "USD",
  "region": "US",
  "provider_ids": {
    "sec_cik": "0000320193"
  }
}
```

`asset_id`, not bare symbol, is the identity and deduplication key. ETFs, indices, commodity proxies,
native commodities, companies, tokens, chains, and protocols must have distinct subtypes.

### Observation

Required fields:

```json
{
  "subject_id": "equity:US:AAPL",
  "metric_id": "fundamental.revenue",
  "value": 0,
  "unit": "USD",
  "period_end": "2026-06-30T00:00:00Z",
  "released_at": "2026-07-30T20:05:00Z",
  "available_at": "2026-07-30T20:05:00Z",
  "ingested_at": "2026-07-30T20:06:00Z",
  "provider": "sec_edgar",
  "provider_ref": "accession-or-series-id",
  "vintage": null,
  "quality": "verified"
}
```

Point-in-time scoring must join on `available_at`, not merely `period_end`. Macro revisions require
vintage or real-time interval fields. Provider payload shapes must stop at the normalization boundary.

### FactorResult

```json
{
  "domain": "fundamental",
  "score": 0.42,
  "strength": 0.61,
  "coverage": 0.8,
  "quality": "verified",
  "data_as_of": "2026-07-30T20:05:00Z",
  "valid_until": "2026-10-30T20:05:00Z",
  "evidence_ids": ["observation-id"],
  "drivers": ["revenue growth positive", "margin trend weakening"]
}
```

### ScorecardRow v3

Common fields only:

- asset descriptor
- horizon
- direction
- composite strength
- component factor results
- coverage
- data quality
- `data_as_of` and `valid_until`
- decision state: `eligible`, `degraded`, or `excluded`
- exclusion reasons
- scoring policy id and version

Reserve `confidence` for calibrated predictive reliability. Until calibration exists, keep the honest
label `heuristic_vote_strength` or `composite_strength`.

## Family Research Policies

Weights below are research questions, not approved production constants. Store final policies in one
versioned family-policy registry rather than scattering `if (family)` branches across scorers and UI.

| Family | Required evidence to research | Important applicability rules |
|---|---|---|
| Equity | earnings and revenue growth, reported-versus-prior performance, margin and cash-flow quality, leverage, valuation, sector relative strength, macro exposure, catalysts | Separate common stocks from ETFs and foreign listings. Do not claim earnings surprise without a documented consensus source. |
| Crypto native chain | active addresses, transactions, fees, issuance/burn, staking/hash security, exchange flows, stablecoin liquidity, technical and market structure | Chain and provider coverage must be discovered, not assumed. Map exchange symbols to chain assets. |
| Crypto protocol token | TVL, fees/revenue, volume, utilization, treasury, unlocks, dilution, governance and bridge exposure | TVL is not applicable to every token; prevent double-counting across protocols and chains. |
| Crypto exchange/meme token | liquidity, holder concentration, unlocks/burns, exchange or issuer risk, funding/open interest, technicals | Do not fake network fundamentals for tokens without meaningful chain activity. |
| FX pair | policy-rate and real-rate differential, inflation/growth surprises, central-bank stance, carry, current-account/terms-of-trade exposure, positioning, technicals | Every metric is relative between base and quote economies. |
| Commodity | inventories, production/consumption, futures curve, seasonality, weather/logistics, CFTC positioning, USD and real-rate sensitivity, technicals | Energy, metals, and agriculture need different supply-demand inputs. ETF proxies are not the underlying commodity. |
| Index | constituent breadth, earnings/valuation breadth, concentration, sector leadership, macro regime, volatility and technicals | SPY/QQQ are funds tracking indices, not operating companies. Avoid company-style statement metrics. |

Do not initially compare composite values across families. Rank within family and horizon. Cross-family
allocation requires a later portfolio/risk-normalized policy.

## Provider Research

### Equity fundamentals

Recommended first slice: US common stocks only.

- Use SEC EDGAR Submissions and Company Facts for filings and standardized reported facts.
- Preserve CIK, accession, form, fiscal period, filed time, unit, and taxonomy concept.
- Use SEC bulk archives for broad refreshes and incremental submissions for recent changes.
- SEC data does not provide analyst consensus. Select a documented licensed estimates provider before
  implementing earnings surprise or revisions.
- Yahoo's official developer directory does not document a public Yahoo Finance API. Do not expand the
  repo's undocumented Yahoo chart dependency into the canonical earnings source.
- Global equities require a separate provider/geography decision. Do not silently give US coverage to
  VN, IN, UK, or German symbols.

### Macro, FX, and indices

- Use FRED/ALFRED series and vintage dates for US macro and point-in-time backtests.
- Use World Bank for lower-frequency structural and cross-country indicators.
- Research official central-bank release APIs and calendars for every currency included in the FX
  universe. A US-only FRED set cannot score EURUSD, USDJPY, or AUDUSD adequately.
- Store observed period, release time, real-time interval/vintage, revision, unit, and source.
- Research consensus-surprise data separately; actual releases alone are not economic surprises.

### Commodities

- Use EIA for energy inventories, production, consumption, and related energy fundamentals.
- Use CFTC COT data for weekly aggregate positioning with report-family-specific schemas.
- Research official USDA and relevant exchange data for agriculture and futures curves.
- Keep spot symbols, futures contracts, continuous series, and ETF proxies distinct.

### Crypto

- Use Coin Metrics catalog discovery for covered network metrics and rate-limit-aware ingestion.
- Use DefiLlama for protocol/chain TVL, stablecoins, volumes, fees, revenue, yields, and open interest,
  preserving methodology and double-counting metadata.
- Research token supply/unlock, contract-address, chain, protocol, and subtype registries before scoring.
- Keep CoinGecko market cap/volume as market data, not proof of chain fundamentals.
- Current Blockchair on-chain lanes are `not_implemented`; replace or implement one canonical owner rather
  than adding a parallel Glassnode/CryptoQuant/Blockchair path.

### Primary documentation reviewed

- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- Yahoo Finance plans: https://finance.yahoo.com/about/plans/
- Yahoo terms: https://legal.yahoo.com/xw/en/yahoo/terms/otos/index.html
- FRED releases: https://fred.stlouisfed.org/docs/api/fred/fred/releases.html
- FRED vintage dates: https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html
- US Treasury rate feeds: https://home.treasury.gov/treasury-daily-interest-rate-xml-feed
- World Bank Indicators API: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
- IMF data APIs: https://data.imf.org/en/Resource-Pages/IMF-API
- OECD SDMX API: https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html
- EIA API v2: https://www.eia.gov/opendata/documentation.php
- CFTC COT notes: https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm
- CFTC historical archives: https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm
- DefiLlama API: https://api-docs.defillama.com/
- Coin Metrics API v4: https://docs.coinmetrics.io/api/v4/
- Yahoo developer API directory: https://developer.yahoo.com/api/

Provider availability is not redistribution permission. Review current terms, licensing, rate limits,
commercial-use rules, and attribution before production deployment.

## Target Dependency Direction

```text
provider adapters
  -> normalized observations and provenance store
  -> pure domain analyzers
  -> versioned family composer
  -> canonical scorecard service
  -> CLI/API adapters
  -> typed frontend client
  -> research UI
```

Forbidden dependencies:

- UI components calling external data providers directly
- analyzers performing network or filesystem ingestion
- provider adapters assigning investment scores
- CLI renderers owning canonical scorecard fields
- separate API and CLI scorecard schemas
- a second asset, metric, command, or family registry

## Proposed Ownership Map

Exact filenames remain subject to Batch 1, but ownership should converge toward:

```text
shared/contracts/analysis/       canonical schemas shared by JS, API, and frontend types
shared/lib/analysis/assets/      asset registry and provider identifier mapping
shared/lib/analysis/metrics/     metric definitions, units, cadence, freshness, applicability
shared/lib/analysis/analyzers/   pure technical, macro, fundamental, on-chain, and supply-demand factors
shared/lib/analysis/policies/    versioned family and horizon composition rules
shared/lib/providers/            raw external provider adapters only
backend/api/server/routes/       thin authenticated analysis API adapters
Frontend/dashboard/src/features/research/  research pages and family panel registry
```

Do not create a second frontend-only score model or a second CLI manifest for these surfaces. The
canonical schema should be machine-validated and contract-tested across the runtime JS payload and
frontend TypeScript types before either side is implemented.

## UI Information Architecture

### 1. Research home

- family workspaces: Equities, Crypto, FX, Commodities, Indices
- data readiness and freshness per family
- current macro/regime context
- top ranked assets within each family
- no execution controls or operational health grids mixed into research ranking

### 2. Family screener

- at most seven persistent common columns: asset, direction, composite strength, coverage, freshness,
  strongest positive driver, strongest negative driver
- family-specific columns selected through a details preset, not appended to one giant table
- filters for horizon, region/subtype, data quality, coverage, and required evidence domains
- explicit excluded/degraded counts

### 3. Asset workbench

- thesis and score decomposition
- technical chart
- family-specific evidence panels
- macro exposures and catalysts
- evidence/provenance ledger with source, timestamps, revisions, and freshness
- same-family comparison mode

### 4. Operational separation

Keep data ingestion health, execution, bot control, settings, and deployment status outside the research
workspace. Link to them through status badges rather than rendering their full controls beside analysis.

Responsive acceptance must be established at 375, 768, and 1440 pixels before implementing the new UI.
Use progressive disclosure; do not render every metric on the landing page.

## Anti-Sloppiness Rules

1. One canonical asset registry and stable `asset_id`.
2. One metric registry with unit, frequency, freshness, applicability, and normalization metadata.
3. One ScorecardRow schema consumed by CLI, API, and UI.
4. One versioned family-policy registry.
5. Every provider lane declares availability, coverage, rate limit, license notes, freshness, and owner.
6. Every observation retains provenance and point-in-time availability.
7. Missing required evidence excludes or degrades a row; weights do not silently renormalize to hide it.
8. Provider adapters, normalization, analyzers, composition, and presentation remain separate modules.
9. New family-specific UI is registered through the same route/workspace registry, not copied navigation.
10. No deletion or schema-v2 retirement until shadow parity, browser contracts, and user approval pass.

## Ranked Implementation Batches

### Batch 0 - Research decisions

Objective: define the decision horizon, target label, provider budget, supported geography, and minimum
coverage for each family.

Gate: a reviewed decision table exists; no score weights are invented before this.

### Batch 1 - Asset and evidence taxonomy

Objective: create `AssetDescriptor` and separate evidence-series metadata from tradeable assets.

Required work:

- inventory every current symbol and classify its actual subtype
- replace bare-symbol deduplication with stable `asset_id`
- move macro/PMI/sentiment/reserves/holdings out of the scoreable universe
- lock compatibility mapping for existing CLI symbols

Gate: every scoreable entry has exactly one asset id and every evidence series has zero scorecard rows.

### Batch 2 - Scorecard v3 contracts

Objective: define Observation, FactorResult, policy, and ScorecardRow contracts with fixtures.

Gate: CLI, worker, API, and frontend type generation consume the same fixture/schema; schema v2 remains
unchanged in production.

### Batch 3 - Extract technical analyzer

Objective: move current technical scoring out of the CLI command into a pure analyzer behind v3.

Gate: schema-v2 rankings remain byte/field equivalent for the same fixtures; no renderer or provider I/O
exists in the analyzer.

### Batch 4 - Repair macro temporal truth

Objective: align storage/migration columns and preserve release/vintage timestamps.

Gate: point-in-time fixture proves revised macro values cannot leak into an earlier decision date.

### Batch 5 - US equity vertical slice

Objective: ingest SEC reported fundamentals for a small US universe, normalize them, produce research-only
fundamental factors, and compose them with technical and macro evidence in shadow mode.

Gate: filing provenance, restatement handling, units, TTM logic, stale/missing behavior, and sector-relative
normalization pass fixtures. Do not implement consensus surprise without a documented provider.

### Batch 6 - Family-specific vertical slices

Order:

1. FX macro/rates
2. indices breadth/constituents
3. energy commodity fundamentals and positioning
4. BTC/ETH native-chain fundamentals
5. DeFi protocol-token fundamentals

Each slice must ship ingestion, normalization, analyzer, policy, shadow output, and tests together. Do not
add five provider trees first and leave them disconnected.

### Batch 7 - Research UI

Objective: implement research home, family screener, and asset workbench against shadow v3 fixtures before
live provider integration.

Gate: browser tests at 375/768/1440, keyboard and screen-reader navigation, common-column budget, evidence
drill-down, family-specific panel registry, and no direct provider calls.

### Batch 8 - Validation and promotion

Objective: evaluate factor distributions, coverage, stability, and out-of-sample usefulness by family and
horizon.

Gate: research-only shadow reports show point-in-time inputs, baseline comparison, turnover, missing-data
sensitivity, and calibrated reliability. Only then consider changing the visible ranking.

### Batch 9 - Retirement

Objective: remove schema-v2, dead React shells, duplicate configs, and old scorecard ownership.

Gate: parity, full suite, browser contracts, docs, migration notes, and explicit deletion approval.

## Research Checklist Before Coding

- What user decision does each family score support, and over what horizon?
- What is the target variable and baseline for validation?
- Which instruments and geographies are in the first supported slice?
- Which metrics are causal/contextual versus merely correlated?
- What timestamp was each observation actually available to the user?
- How do revisions, restatements, currency, units, fiscal calendars, and corporate actions behave?
- Which metrics apply to each crypto subtype?
- What are provider rate limits, retention, history, licensing, and commercial-use terms?
- What coverage/freshness is required before a row is eligible?
- What does the UI need to show so a user can explain and challenge the rank?

## Non-Goals

- One universal formula for all assets
- Cross-family ranking in the first release
- Treating macro series as tradeable assets
- Treating all crypto tokens as chains or protocols
- Using undocumented Yahoo endpoints as the canonical fundamentals source
- Adding all providers before one vertical slice is proven
- Rewriting CLI, API, and web independently
- Claiming the new composite is predictive before point-in-time validation

## First Next Action

Run Batch 0 and Batch 1 only: decide the first family/horizon and produce the asset/evidence taxonomy
inventory. Recommended default is US common equities on a quarterly-to-6-month research horizon because
SEC data provides an official point-in-time foundation. Keep schema v2 and the current UI unchanged while
the v3 contracts are designed.
