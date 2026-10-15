# Module: Polymarket CLOB Reference Pricing & Microstructure

> **Status:** Implemented  
> **Audience:** Quantitative Traders, Strategy Developers, Gateway Engineers  
> **Canonical owners:** `shared/lib/strategy/polymarket_clob_model.js`, `backend/gateway/src/adapters/polymarket_adapter.ts`, `backend/gateway/src/polymarket/polybolt_bbo_monitor.ts`  
> **Review triggers:** CLOB or PolyBolt API updates, market microstructure changes, orderbook depth weighting adjustments  

## Purpose And Non-Goals

This module defines price valuation, depth imbalance ($DIR_5$), and probability estimation for Polymarket binary outcome instruments.

**Goals:**
- Implement Polymarket's official reference pricing rule: use bid-ask midpoint for tight markets ($\text{spread} \le \$0.10$), and switch to the **last trade price** when wide markets ($\text{spread} > \$0.10$) render the midpoint illiquid or unrepresentative.
- Compute volume-weighted micro-price and top-5 harmonic decay depth imbalance ($DIR_5$).
- Evaluate bounded logit drift probability forecasts with pin-risk protection for extreme outcomes ($< 0.03$ or $> 0.97$).
- Use PolyBolt `price.polymarket` as a per-connection/channel sequence sentinel and recover authoritative full depth through the public CLOB REST orderbook after a gap.

**Non-Goals:**
- It does not infer sequence numbers for the CLOB market channel: that channel documents full `book`/`price_change` events but no monotonic sequence field.
- It does not place orders or sign transactions (handled by `PolymarketExecution` in `backend/gateway/src/polymarket_execution.ts`).
- It does not manage wallet private keys or L2 API secrets.

---

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `calculatePolymarketReferencePrice(bestBid, bestAsk, lastTradePrice)` | `shared/lib/strategy/polymarket_clob_model.js` | Returns `{ referencePrice, source: 'midpoint' \| 'last_trade' \| 'bid' \| 'ask' \| 'default', spread }`. |
| `calculateDepthImbalance(bids, asks, depth)` | `shared/lib/strategy/polymarket_clob_model.js` | Computes $DIR_5 \in [-1, 1]$, microPrice, and best bid/ask levels. |
| `forecastBinaryProbability(pMid, dir5, ofiZ, weights)` | `shared/lib/strategy/polymarket_clob_model.js` | Computes bounded logit drift with pin-risk tail clamping ($< 0.03$ or $> 0.97$). |
| `PolymarketAdapter.getQuote(symbol)` | `backend/gateway/src/adapters/polymarket_adapter.ts` | Fetches the CLOB orderbook and returns the numeric reference price. Rich spread/source metadata remains owned by the model helpers above. |
| `startPolyBoltBboMonitor(options)` | `backend/gateway/src/polymarket/polybolt_bbo_monitor.ts` | Tracks the documented dense `price.polymarket` sequence per connection/channel; a gap invalidates all subscribed BBO/depth caches, fetches public REST orderbooks, then reconnects into a fresh epoch. |

### Mathematical Reference Pricing Formulation

$$\text{ReferencePrice}(P_{\text{bid}}, P_{\text{ask}}, P_{\text{last}}) = \begin{cases} 
P_{\text{last}} & \text{if } (P_{\text{ask}} - P_{\text{bid}}) > 0.10 \text{ and } P_{\text{last}} > 0 \\ 
\frac{P_{\text{bid}} + P_{\text{ask}}}{2} & \text{if } P_{\text{bid}} > 0 \text{ and } P_{\text{ask}} > 0 \text{ and } (P_{\text{ask}} - P_{\text{bid}}) \le 0.10 \\ 
P_{\text{last}} & \text{if one side is empty and } P_{\text{last}} > 0 \\ 
P_{\text{bid}} \text{ or } P_{\text{ask}} & \text{if one side is empty and } P_{\text{last}} \text{ is missing} \\ 
0.50 & \text{if the orderbook is completely empty} 
\end{cases}$$

---

## Dependencies And Data Flow

```text
PolyBolt price.polymarket (BBO + connection/channel seq)
          │ sequence gap / disconnect
          ▼
Invalidate all subscribed BBO/depth caches
          │
          ▼
CLOB REST getOrderBook(tokenId) ─────► recovered full depth
          │                                  │
          └──── reconnect sequence epoch ◄───┘
                                             │
Gamma API (Discovery & Token IDs) ───────────┤
                                             ▼
                                  calculateDepthImbalance()
                                             │
Data API (Last Matched Trade) ───────────────► calculatePolymarketReferencePrice()
                                             │
                                             ▼
                                  forecastBinaryProbability()
                                             │
                                  (Pin-Risk Clamping Check)
                                             ▼
                              Downstream Strategy Execution Signals
```

PolyBolt assigns a dense sequence per connection and channel, not per asset; snapshots consume sequence numbers and reconnects reset the epoch. Because a missed envelope may belong to any subscribed asset, recovery invalidates every subscribed cache before restoring each book from public CLOB REST.

---

## Invariants And Safety Boundaries

1. **Spread Threshold Boundary**: The $\$0.10$ spread threshold is an exact constant matching Polymarket's published platform documentation.
2. **Zero-Key Public Reads**: Price quotes and orderbook depth calculations are 100% public reads requiring no private keys or signing credentials.
3. **Pin-Risk Boundary Protection**: When forecast probability approaches extreme tails ($p < 0.03$ or $p > 0.97$), new directional risk is inhibited (`signal = 0`, `pinRisk = true`) to prevent toxic inventory accumulation near expiry.
4. **Probability Clamping**: All probability inputs are clamped to the open interval $[0.001, 0.999]$ before logit transformation to prevent division-by-zero or $\pm\infty$.
5. **Sequence Scope**: One `lastSeq` is tracked for the `price.polymarket` channel on the active connection. Per-asset counters are forbidden because interleaved assets would create false gaps.
6. **Fail-Closed Recovery**: A gap clears every subscribed BBO/depth entry before REST recovery; only successful snapshots become `SYNCHRONIZED`.
7. **Connection Policy**: Subscription sets are deduplicated and capped at 64. Close code `4003` reconnects after randomized 0-10 second jitter; policy violation `4008` is terminal and never retried blindly.

---

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| Wide spread ($> \$0.10$) with no trade history | `source: 'midpoint'` | Uses midpoint with warning flag | Market liquidity / Model |
| Inverted orderbook ($P_{\text{ask}} < P_{\text{bid}}$) | `spread < 0` | Falls back to last trade price or quarantine | CLOB feed sync |
| Non-finite prices (`NaN`, `Infinity`) | Handled via `toFiniteNumber` | Degrades safely to default $0.50$ | Data parsing |
| PolyBolt sequence gap | `PolyBolt sequence gap: expected ..., received ...` warning | Clears subscribed BBO/depth, restores full books via REST, reconnects into a new epoch | Gateway market-data monitor |
| PolyBolt close `4008` | Cache remains `INVALID_AWAITING_SNAPSHOT` | Stops reconnecting until operator/protocol correction | Gateway operator |

---

## Observability

- **Adapter quote**: `PolymarketAdapter.getQuote(symbol)` returns the numeric `referencePrice`.
- **Model metadata**: `calculatePolymarketReferencePrice()` and `calculateDepthImbalance()` expose spread, source, and depth metadata for diagnostics.
- **Logit Signals**: Exposes `logitP`, `logitNext`, and `pinRisk` boolean for transparent signal inspection.
- **PolyBolt Status**: `getStatus()` exposes connection state, recovery state, last channel sequence, and per-asset synchronization/error state without exposing mutable internal maps.

---

## Tests And Evidence

- **Runnable verification**: `node tests/run_node_tests.js tests/scripts/integration/polymarket/polymarket_clob_spread_fallback.test.js`
  - Verifies tight spread ($\le 0.10$) selects midpoint.
  - Verifies wide spread ($> 0.10$) selects last trade price.
  - Verifies missing last trade gracefully reverts to midpoint without throwing.
  - Verifies pin-risk clamping on extreme probabilities.
- **Runnable sequence recovery verification**: `node tests/run_node_tests.js tests/scripts/integration/polymarket/polybolt_bbo_sequence.test.js`
  - Uses a recorded PolyBolt payload plus real loopback WebSocket and HTTP servers.
  - Verifies contiguous sequences, gap invalidation before recovery, REST full-book restoration, reconnect epoch reset, terminal `4008`, and the 64-subscription bound.
