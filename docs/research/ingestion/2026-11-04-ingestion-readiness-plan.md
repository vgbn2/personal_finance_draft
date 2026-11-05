# Ingestion readiness and credential plan

Date: 2026-11-04. Proposed plan, not authorization for implementation, provider polling, credential access, or canonical-data writes.

## Current verdict

Not all configured data points work. Yahoo breadth, OpenSky regional flight aggregates, Blockchair chain/mempool aggregates, and SEC filing metadata remain explicit incomplete adapters. Kalshi's two incomplete historical exports were removed; current-market support remains. Polymarket historical archive support exists and passed 15 offline archive tests, but live-provider coverage and effective sampling are not qualified.

## Access classification from the completed audit

| Data path | Implementation evidence | Credential policy |
|---|---|---|
| Binance public market data | Implemented | No API key for public data; trading separate |
| Polymarket Gamma/CLOB public history | Implemented, offline archive tests pass | No API key for public history; optional PMXT and trading separate |
| Yahoo prices | Adapter exists; unofficial access | No user API key; availability not guaranteed |
| Yahoo company financial statements | Website access verified from official plan documentation; repository statement ingestion not assessed here | Free: up to 5 years of financials. Gold: roughly 40 years of statements and downloads. Neither establishes supported API access |
| Yahoo breadth ratios | Incomplete | Intended to derive from keyless Yahoo prices |
| Frankfurter FX | Implemented | No API key |
| SEC filing metadata | Incomplete | Public EDGAR, no API key; identify client and respect access limits |
| OpenSky / Blockchair | Incomplete | Endpoint-specific auth and quotas not qualified; do not promise keyless coverage |
| FRED / Twelve Data | Implemented paths | Users supply their own provider API keys |
| Alpaca market data | Adapter exists | User account credentials and data entitlements required |
| Gate public quotes | Adapter exists but unnecessarily credential-gated | Upstream public data keyless; repo gate needs repair before promising this |
| S&P Global PMI / FXAPI | Incomplete | Access/entitlement contract must be qualified before onboarding |

No row is certified live-ready by this plan. Kalshi history was removed and is excluded; current Kalshi support remains separate.

## Yahoo company financial statements — access check, 2026-11-04

**Partly public, partly paywalled—not an all-free ingestion contract.** Yahoo's [official plan help](https://help.yahoo.com/kb/SLN36623.html) lists **up to 5 years of financials** in Free. The [plan comparison](https://finance.yahoo.com/plus/select-plan) lists roughly **40 years of income statements, balance sheets and cash-flow reports**, plus downloadable financial statements, under Gold. Availability is not a guarantee of complete history for every company. These pages describe website/subscription features, not a supported developer API or API-key entitlement. A website subscription must not be treated as permission or a reliability guarantee for automated extraction; no paywall bypass or undocumented-endpoint probe was attempted. Repository statement ingestion and per-company payloads were not exercised.

Yahoo's [statement migration notice](https://help.yahoo.com/kb/finance/SLN37694.html?impressions=true) says the Morningstar dataset expands line items by 2.5x: opt-in began October 26, 2026; everyone moves November 9, 2026. Labels, methodology and some historical values change; expenses and capital spending change sign conventions, and saved templates/download columns may need updates. Qualify the actual dataset version, fields, signs and point-in-time semantics before quantitative use; do not combine old/new series blindly. This is vendor-announced behavior, not a tested repository regression.

Evidence: targeted official-source search followed by direct retrieval of all three pages. The required Tavily extraction attempt returned HTTP 429, so direct WebFetch retrieval supplied confirmation; no subscription login, financial-data download, keys or provider ingestion was used. Paid website access and unofficial programmatic access remain separate readiness rows.

## Ordered gates

1. **Inventory and define:** list each enabled provider/family/metric with one of implemented, incomplete, or unverified. Define SEC filings versus institutional 13F holdings; Blockchair aggregates versus individual transactions; OpenSky regional snapshots versus historical flight tracks. Do not imply broader coverage than the chosen schema.
2. **Prove functionality:** exercise recorded provider payloads through the real parser, validation, temporary storage, and downstream reader. Test missing/invalid fields, empty history, duplicates, pagination, and resume where applicable. Incomplete or unverified paths are not ready merely because config lists them.
3. **Classify access before external calls:** keyless public data, user API key/account required, or optional paid enrichment. Separate market-data access from private account/trading credentials. A credential must not be requested for an unused or unsupported path.
4. **Qualify public paths:** after explicit network approval, perform bounded keyless smoke checks in isolated storage; confirm actual metrics, history depth, sampling units, and limits. Record partial coverage instead of replacing missing history with synthetic evidence.
5. **Qualify optional key-required paths:** users obtain their own provider credentials and accept provider terms/quotas. Store credentials locally, never in shared examples or fixtures. Missing credentials must produce a clear disabled/unavailable state, not a false success.
6. **Publish onboarding:** one copyable keyless setup plus an optional-provider table specifying credential names, acquisition instructions, limits, and test status. Enable only paths that passed their gates; report other capabilities explicitly unavailable.

## Acceptance

Every enabled metric has an exercised parser/storage/reader path and declared access policy. Live readiness requires a separately recorded provider smoke result. Keyless development and fixture tests remain usable without any user keys. No trading authorization is implied by a successful data fetch.

Evidence: [ingestion/configuration/test audit](2026-11-04-ingestion-config-test-review.md) and [Polymarket history assessment](2026-11-04-polymarket-history-check.md). Existing audit findings remain unapproved for repair.
