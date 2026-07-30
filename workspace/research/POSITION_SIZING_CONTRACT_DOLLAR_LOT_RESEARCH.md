# Position Sizing Research: Contracts, Dollars, Units, and Lots

Date: 2026-07-30  
Decision: **GO WITH FIXES** for a canonical sizing layer; **NO-GO** for MT5 order execution or a claim of cross-broker sizing parity.  
Scope: source-level research and planning only. No provider request, order, credential use, dependency installation, or runtime mutation was performed.

## Executive conclusion

The repository has three separate pieces of sizing logic, but it does not yet have one authoritative sizing contract:

1. The gateway accepts raw units or `amount:USD`, then converts dollars to `Math.floor(dollars / quote)`.
2. Strategy automation independently converts a risk-weighted dollar allocation to whole units.
3. The C++ core can size by stop-loss risk and a maximum-notional cap, but it is not the execution path's canonical normalizer.

That is adequate for a narrow whole-share equity dry run. It is not adequate for a mixed universe containing fractional Alpaca assets, prediction-market shares, futures/contracts, FX/CFD lots, or symbols with provider-specific minimums and step sizes.

The correct model is:

`SizingIntent -> instrument contract -> reference-price snapshot -> risk and buying-power caps -> step-aware normalized quantity -> broker order`

The original intent and every conversion input must remain attached to the proposed order and audit record.

## Terminology

| Mode | User means | Conversion before submission |
|---|---|---|
| Unit/share sizing | Buy a count of shares, coins, or prediction tokens | Validate the requested quantity against the instrument quantity step and minimum |
| Dollar/notional sizing | Allocate a currency amount | `units = notional / (price * contract_multiplier * FX)` and round down to the valid quantity step |
| Contract sizing | Buy a discrete number of standardized contracts | Validate integer/step count, then compute exposure from `contracts * multiplier * price` |
| Lot sizing | Buy a broker-defined number of lots | Convert lots through `units_per_lot` or contract size; apply the broker's min/max/step |
| Risk-budget sizing | Risk a currency amount or fraction of equity at a stop | `quantity = risk_budget / loss_per_quantity_at_stop`, then cap and round down |

Contracts and lots are not synonyms. A contract is a tradeable instrument count with an economic multiplier. A lot is a broker quantity convention that may represent many base units or contracts. A field named only `quantity` cannot safely express which one the caller intended.

## Formula set

For a linear instrument:

```text
gross_notional = quantity * price * contract_multiplier * quote_fx_rate
risk_budget = equity * risk_fraction
loss_per_quantity_at_stop =
    abs(entry_price - stop_price) * contract_multiplier * quote_fx_rate
risk_quantity = risk_budget / loss_per_quantity_at_stop
final_quantity = round_down_to_step(min(requested_quantity, risk_quantity, cap_quantity))
```

For lot-based FX/CFD sizing, prefer provider metadata rather than assuming one standard lot:

```text
base_units = lots * units_per_lot
loss_per_lot = stop_distance_in_points * point_value_per_lot
lots_by_risk = risk_budget / loss_per_lot
```

For a Polymarket BUY at a limit price between 0 and 1:

```text
estimated_cash_cost = shares * limit_price
shares_by_budget = dollar_budget / limit_price
```

That is an upfront-cost projection, not a universal formula for every prediction-market side, collateral model, fee, partial fill, or settlement state.

## Current source map

| Surface | Current behavior | Source evidence | Grade |
|---|---|---|---|
| Manual gateway | Accepts units or `amount:USD`; dollar mode floors to an integer | `backend/gateway/src/index.ts:2039-2070` | C |
| Strategy automation | Allocates `min(equity * risk_weight, position_size)` and floors to whole units | `backend/cli/commands/strategy/strategy.js:885-898` | D |
| Native position sizer | Uses stop distance, risk fraction, and maximum-notional fraction | `backend/core/src/position_sizing/position_sizer.hpp:9-48` | B- in isolation, D as an execution integration |
| Asset metadata | Declares tick and lot size, but assigns `0.01` and `1.0` to every configured asset | `backend/core/src/assets/asset.hpp:9-20`; `asset_universe.hpp:137-149` | D |
| Alpaca adapter | Sends quantity and explicitly supports fractional quantities | `backend/gateway/src/index.ts:504-519` | B for quantity transport |
| Polymarket guided order | Prompts for shares; enforces orderbook minimum and tick-aligned limit price | `backend/cli/commands/trade/trade_polymarket.js:526-578` | B- for this entrypoint |
| Polymarket direct core | Accepts any positive quantity; the local minimum-order contract is not applied here | `backend/gateway/src/index.ts:1862-1893` | C |
| MT5 | Installs/launches a quote and calendar exporter; Rust bridge types do not carry quantity, lots, price, stop, or submit behavior | `tools/mt5/SovereignExport.mq5:134-166`; `backend/cli/src/broker_api/mt5_native.rs`; `order_executor.rs` | F for order/lot sizing |
| MCP trade tool | Exposes number or `amount:USD`, but no explicit sizing-mode schema | `backend/mcp_server/tools/trade.ts:6-13`; `backend/mcp_server/index.ts:125-138` | C |

Overall source grade: **D+** for cross-asset sizing. Whole-unit and prediction-share paths exist, but contract/lot normalization and one authoritative policy do not.

## Confirmed findings and attribution

### SIZ-01 — P1: missing strategy price silently becomes `$1`

- First failing boundary: strategy signal output -> allocation-to-quantity conversion.
- Fault domain: `our_source`.
- Repair owner: strategy automation and the canonical sizing owner.
- Causal mechanism: `const currentPrice = signalPrice || 1` treats missing, zero, or non-finite price as one dollar, then sizes a quantity from that fabricated price.
- Stub involvement: `silent_fallback`.
- Confidence: high.
- Alternative checked: the downstream gateway fetches a broker quote for risk notional, which may reject an excessive order, but it does not make the proposed quantity correct and cannot justify creating it from a fake price.
- Discriminating check: tests must prove `undefined`, `null`, zero, negative, and `NaN` prices fail closed before quantity calculation or command dispatch.

### SIZ-02 — P1: contract and lot sizing have no executable instrument contract

- First failing boundary: sizing intent -> instrument metadata normalization.
- Fault domain: `our_source`.
- Repair owner: core sizing plus gateway/broker integration.
- Causal mechanism: execution assumes `price * quantity` is notional; there is no multiplier, units-per-lot, quantity step, point value, margin currency, or FX conversion in the order contract.
- Stub involvement: `production_stub` for the current MT5 bridge surface; its production-source structs only identify the endpoint/profile and route broker/symbol/side, while the MQL5 artifact exports market data rather than orders.
- Confidence: high.
- Alternative checked: `Asset` declares `lot_size`, but the loader hardcodes it to `1.0`; no consumer was found in the reviewed sizing or execution paths.
- Discriminating check: a table-driven normalization test must produce different exposure for one share, one futures contract, and one FX lot at the same quoted price.

### SIZ-03 — P2: dollar sizing incorrectly forces every asset to whole units

- First failing boundary: dollar intent -> broker-valid quantity.
- Fault domain: `our_source`.
- Repair owner: gateway sizing normalizer.
- Causal mechanism: `Math.floor(usdAmount / price)` ignores fractional support and quantity-step metadata.
- Stub involvement: none; the Alpaca adapter is a real adapter and already transports fractional quantities.
- Confidence: high.
- Alternative checked: whole-share flooring is valid for instruments that explicitly require a step of one, but that property is never resolved here.
- Discriminating check: `$50` at a `$200` price must become `0.25` for a fractional-enabled asset, `0`/rejected for a whole-share-only asset, and a step-rounded value for crypto.

### SIZ-04 — P2: sizing intent and conversion evidence are erased

- First failing boundary: CLI/MCP input -> proposed-order and audit contract.
- Fault domain: `our_source`.
- Repair owner: gateway order schema and persistence.
- Causal mechanism: `amount:USD` becomes a bare numeric `quantity`; sizing mode, requested notional, quote, quote time/source, rounding rule, and residual cash are not retained.
- Stub involvement: none.
- Confidence: high.
- Alternative checked: logs print the conversion for an interactive non-JSON call, but logs are not a typed, durable execution contract.
- Discriminating check: a proposed order created from dollar sizing must round-trip through persistence with the original intent and normalization evidence intact.

### SIZ-05 — P2: Polymarket minimum-size enforcement depends on entrypoint

- First failing boundary: direct Polymarket order input -> local preflight.
- Fault domain: `our_source`.
- Repair owner: Polymarket gateway normalization.
- Causal mechanism: the guided CLI checks `book.min_order_size`, while the shared direct core checks only that quantity is positive.
- Stub involvement: `adapter_not_stub`; the provider adapter may reject invalid size, but provider rejection is not a replacement for consistent local validation.
- Confidence: medium-high because provider/SDK validation after preparation was not externally requalified in this audit.
- Discriminating check: the same below-minimum request must fail with the same local reason through guided CLI, direct CLI, MCP, and bot paths before submit.

### SIZ-06 — P2: documentation and interface labels overstate sizing coherence

- First failing boundary: documented capability -> actual execution ownership.
- Fault domain: `our_source`.
- Repair owner: CLI documentation plus sizing owner.
- Causal mechanism: user-facing material describes quantity/USD sizing and risk-profile suggestions, while manual dollar mode is only quote division and the native risk sizer is not the canonical execution normalizer.
- Stub involvement: none.
- Confidence: high.
- Discriminating check: every documented sizing mode must map to one named implementation owner and a contract test.

## Broker-specific interpretation

### Alpaca

Use units for explicit share/coin quantities and notional for currency allocation. The local adapter can send fractional quantities, so whole-number flooring belongs only to an instrument whose resolved quantity step is one. Before live use, resolve broker asset/order metadata and preserve whether the user requested units or dollars.

### Polymarket

The natural unit is shares/tokens. Dollar sizing for a BUY can convert dollars to shares using an explicit limit price, then enforce the orderbook minimum and any size precision. Preserve the token ID, outcome, price, tick size, minimum size, and estimated worst-case cash cost. Do not reuse an equity or leveraged-contract formula without modeling prediction-market collateral and settlement semantics.

### MT5 / FX / CFDs

The natural broker input is usually volume in lots, but the economic meaning is symbol-specific. Required runtime metadata includes contract size, volume minimum, volume maximum, volume step, tick size, tick value, margin currency, profit currency, and current conversion rates. The repository's current MT5 artifact does not execute orders or expose those fields, so lot sizing is a future implementation, not a usable current feature.

### Futures or other standardized contracts

Size in discrete contracts only after resolving multiplier, tick value, margin, price limit/step, and expiry. Risk notional must use the multiplier. The current `price * quantity` risk projection is insufficient.

## Canonical data contract

Introduce a broker-neutral intent:

```ts
type SizingMode = 'units' | 'notional' | 'risk_budget' | 'contracts' | 'lots';

interface SizingIntent {
  mode: SizingMode;
  value: number;
  currency?: string;
  entryPrice?: number;
  stopPrice?: number;
}
```

Resolve it against provider-qualified instrument metadata:

```ts
interface InstrumentSizingContract {
  instrumentId: string;
  assetClass: string;
  quoteCurrency: string;
  quantityStep: number;
  minQuantity?: number;
  maxQuantity?: number;
  minNotional?: number;
  contractMultiplier: number;
  unitsPerLot?: number;
  tickSize: number;
  tickValuePerLot?: number;
  fractionalAllowed: boolean;
  metadataSource: string;
  observedAt: string;
}
```

The result must carry:

- requested intent;
- reference price, source, and timestamp;
- calculated raw quantity;
- rounded broker quantity and rounding rule;
- projected notional, cash cost, margin, and stop loss where applicable;
- binding cap or rejection reason;
- instrument metadata version/source.

Only the normalized result may become a broker order.

## Ranked fix plan

### Batch 0 — fail closed on invalid prices

1. Remove the `$1` fallback.
2. Reject non-finite/non-positive sizing prices before allocation.
3. Add adversarial strategy automation tests proving no gateway command is emitted.

Acceptance: missing or invalid price produces a structured skip/rejection, never a quantity.

### Batch 1 — one sizing intent and normalizer

1. Add explicit `SizingIntent` and `NormalizedSizingDecision`.
2. Preserve intent through CLI, MCP, proposed orders, persistence, and audit output.
3. Move manual and strategy conversions to one owner.
4. Round down using resolved `quantityStep`, not `Math.floor`.

Acceptance: units and dollar sizing use the same normalizer and retain conversion evidence.

### Batch 2 — qualified instrument metadata

1. Replace hardcoded universal tick/lot values with broker/asset-specific metadata.
2. Fail closed when a requested sizing mode requires unavailable metadata.
3. Add freshness/source fields and cache rules.

Acceptance: the normalizer cannot silently assume multiplier one, lot one, or whole-unit precision.

### Batch 3 — broker-specific contracts

1. Alpaca: fractional/whole-unit and minimum-notional cases.
2. Polymarket: shares, limit-price dollar conversion, minimum order, and collateral-aware risk.
3. MT5: keep execution disabled until a real order bridge and symbol metadata contract exist.
4. Futures/contracts: add multiplier/tick-value/margin semantics before enabling.

Acceptance: table-driven tests prove equivalent intent and correct differing broker quantities, plus negative tests for stale or missing metadata.

### Batch 4 — documentation and qualification

1. Update CLI help to name units, notional, contracts, and lots precisely.
2. Run dry-run/source tests, then provider-paper qualification separately.
3. Do not infer live readiness from source tests or external CLI success.

## Alpaca CLI and Polymarket CLI assessment

Provided upstream repositories:

- `https://github.com/alpacahq/cli.git`
- `https://github.com/Polymarket/polymarket-cli.git`

Neither CLI should be a mandatory runtime dependency for the canonical sizing engine. They may be useful as optional operator/developer tools to compare account, asset, order, tick/minimum, and error behavior against this repository. Their outputs must not bypass local risk policy, and a CLI version must be pinned and contract-tested before it becomes qualification evidence.

The local `backend/polymarket-cli` path is an unmaterialized Git link at commit `9b18b5f...`; its contents and upstream contract were not available from the current checkout. Alpaca CLI is not present locally. The repository prompt-injection gate prohibited direct raw GitHub inspection in this run. Therefore:

- required install now: **neither**;
- optional after restricted source review: **both**, as diagnostic/reference tools;
- runtime sizing owner: **this repository**, not either external CLI.

Before adding either tool to an installation guide, verify its license, release/signing method, supported authentication boundary, non-interactive JSON behavior, order preview/dry-run support, sizing semantics, update policy, and whether installation brings a second credential store.

## Evidence boundary and unread surfaces

This is current-checkout source evidence. It does not prove upstream CLI behavior, current provider contracts, live/paper broker acceptance, fills, fees, slippage, margin, or production readiness. The focused review covered the gateway order/risk path, strategy automation conversion, native sizer, asset metadata, Alpaca and Polymarket adapter seams, MCP trade schema, MT5 bridge/exporter, focused tests, and related operational documentation. It did not run provider APIs, install CLIs, materialize the Polymarket gitlink, execute orders, or inspect external documentation.

## Implementation update — 2026-07-30

The user approved a paper-engine-focused mass implementation.

- Batch 0 closed SIZ-01: strategy automation now fails closed on invalid reference prices through the shared
  normalizer; the `$1` fallback was removed.
- Batch 1 added `shared/lib/trading/position_sizing.js` and integrated notional, unit, and stop-risk sizing into
  the canonical internal Polymarket paper ledger.
- Paper normalization now rounds down to a declared quantity step, enforces orderbook minimum size when
  available, caps by virtual cash and maximum position USD, and persists the full conversion evidence.
- Persistent paper-runner flags now forward the same sizing intent without adding live authorization.
- Contract and lot math is unit-tested, but Polymarket paper rejects those modes. MT5 execution, live gateway
  normalization, and external CLI qualification remain deferred.
- Post-implementation grade: **A- for the internal Polymarket paper-sizing path** and **C for cross-asset sizing
  overall**. The remaining cross-asset cap is provider-qualified metadata and live/broker-paper integration,
  not the paper ledger.
