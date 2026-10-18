# Module: Alpaca Asymmetric Exit Cap & Multi-Position Deduplication

> **Status:** Implemented & Verified (ALPACA-EXIT-01)  
> **Audience:** Algorithmic Developers, Execution Engineers, Risk Officers  
> **Canonical owners:** `shared/lib/runtime/alpaca_bot_cycle.js`, `backend/gateway/src/index.ts`  
> **Review triggers:** Broker order sizing, notional limits, sub-position attribution, sell deduplication  

## Purpose And Non-Goals

This module provides deterministic, attribution-preserving order execution and asymmetric risk limit enforcement for the Alpaca Paper Bot trading cycle. It specifically resolves the `ALPACA-EXIT-01` operational failure where exposure-limiting entry caps blocked risk-reducing exits, and multiple virtual sub-positions on the same symbol generated redundant broker orders and multiplied warning storms.

**Goals:**
- **Asymmetric Notional Cap Enforcement**: Provider-paper notional caps (`ALPACA_PAPER_MAX_NOTIONAL`, default: $5.00) apply strictly to exposure-increasing buy orders (`order.side === 'buy'`). Risk-reducing sell orders (`order.side === 'sell'`) are completely exempt, ensuring open positions can always be fully closed regardless of equity appreciation.
- **Multi-Position Net Order Deduplication**: When multiple independent strategies generate exits for the same symbol (e.g. 10 attributed sub-positions on `AAPL`), the execution loop aggregates them into a single consolidated broker market sell order for the net quantity.
- **Attribution Preservation**: Individual strategy virtual sub-positions, entry prices, realized PnL, and timestamps are preserved in `cycleHistory` and `alpaca_bot_state.json`.
- **Consolidated Error Reporting**: Gateway rejections emit exactly one diagnostic error per asset symbol rather than multiplying warnings across every sub-position row (eliminating 10:1 warning storms).

**Non-Goals:**
- It does not alter real-money production broker risk limits on `hpdesk-1` (real live execution enforces separate C++ `PreTradeRisk` constraints).
- It does not merge distinct asset symbols across brokers.

---

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `runAlpacaBotCycle(options)` | `shared/lib/runtime/alpaca_bot_cycle.js` | Evaluates active Alpaca paper strategies, aggregates same-symbol exits into single market orders, updates attribution state, and records history. |
| `submitOrder(order)` | `backend/gateway/src/index.ts` | Gateway execution router; enforces `ALPACA_PAPER_MAX_NOTIONAL` strictly when `order.side === 'buy'`. |
| `AlpacaAdapter.getPositions()` | `backend/gateway/src/adapters/alpaca_adapter.ts` | Returns broker positions preserving sellable `qty_available` alongside gross `quantity`. |
| `reconcilePositions(positions)` | `shared/lib/runtime/sub_positions_ledger.js` | Reconciles broker positions with virtual sub-positions, preserving `qty_available`. |
| `AlpacaAdapter.cancelAllOrders()` | `backend/gateway/src/adapters/alpaca_adapter.ts` | Atomically cancels all open Alpaca broker orders. |

---

## Dependencies And Data Flow

```text
Strategy Evaluator (10 AAPL Sub-Positions)
       │
       ▼
shared/lib/runtime/alpaca_bot_cycle.js
  ├── Aggregate Symbol Quantities (Sum Qty = 100.91 USD)
  ├── Single Net Exit Dispatch ──► backend/gateway/src/index.ts
  │                                  └── Check side === 'buy' (false: PASS without cap)
  └── Preserve Attribution ────► storage/data/cache/alpaca_bot_state.json
```

---

## Invariants And Safety Boundaries

1. **Asymmetric Cap Invariant**:
   $$\text{NotionalCapApplied}(\text{order}) \iff \text{order.side} = \text{'buy'}$$
   Risk-reducing exits are never rejected due to maximum order notional limits.
2. **Netted Broker Execution**: Exactly one broker market order is dispatched per unique symbol per exit cycle:
   $$\forall s \in \text{ExitSymbols}, \quad \text{DispatchedOrders}(s) \le 1$$
3. **Fail-Closed State Preservation**: If the consolidated broker exit is rejected (e.g. network timeout or API error), all underlying strategy sub-positions remain intact in state; no positions are prematurely pruned without verified broker fills.
4. **Attribution Conservation**: Sum of sub-position quantities equals the net dispatched order quantity:
   $$\sum_{i=1}^{N} Q_i = Q_{\text{broker}}$$
5. **Sellable Availability & Open Order Retention Invariant**:
   Broker positions distinguish gross quantity from available sellable quantity (`qty_available`). When an exit sell order is submitted and pending fill, `qty_available` reflects shares held for the open order:
   $$\text{AggregateSellQty}(s) = \min\left(\sum Q_i, \text{qty\_available}(s)\right)$$
   If $\text{AggregateSellQty}(s) = 0$ while $\text{quantity}(s) > 0$, shares are held by an already-open order: duplicate sell dispatch is inhibited, and tracked sub-positions are preserved in `remaining` state rather than pruned as stale. Pruning occurs only when verified broker gross quantity reaches zero.

---

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| Gateway network timeout on exit | `error: 'alpaca_exit_failed'` | Sub-positions preserved in state; retried next cycle | Gateway / Network |
| Broker rejects market sell | Single warning logged for symbol | Position retained; fail-closed protection | Risk Engine |
| Partial broker fill | Broker position < state position | State reconciled on next portfolio sync | Alpaca Adapter |
| Shares held by open order | `Shares for ${symbol} are held by an open order... skipping duplicate exit` | Duplicate order dispatch inhibited; positions retained until fill | Alpaca Bot Cycle |

---

## Observability

- **State File**: `storage/data/cache/alpaca_bot_state.json` (active positions and strategy attribution).
- **History Ledger**: `cycleHistory` array records net exit execution ID, gross proceeds, and per-strategy PnL attribution.
- **Structured Logs**: Single error log format `[ALPACA-BOT] Exit order failed for ${symbol}: ${error}` replacing legacy multi-row warning loops.

---

## Tests And Evidence

- **Composite Seam Test**: `tests/scripts/lib/alpaca_bot_cycle.test.js`
  - Verifies 10 attributed AAPL sub-positions against 1 broker position.
  - Confirms exactly 1 market order dispatched to gateway.
  - Confirms deterministic state reduction and 22/22 test assertions passing.
  - Verifies pending exit with shares held by open order (`qty_available: 0`, broker `quantity > 0`) skips duplicate sell and retains position in state.
  - Verifies backward compatibility when `qty_available` is omitted, falling back to gross quantity.
- **Sub-Positions Ledger**: `tests/scripts/lib/sub_positions_ledger.test.js`
  - Verifies `reconcilePositions` preserves `qty_available` through the attribution layer.
- **Gateway Notional Cap Contract**: Verified in `tests/scripts/operational/alpaca_paper_notional_cap.test.js`.
