# Core Logical Requirements (The Unified Blueprint)

This document serves as the absolute logical ground-truth for the "one-shot" implementation. It consolidates math from **Roan**, reliability from **Hyperglycemia**, and risk from **Old 317**.

---

## 1. Probability Logic (Black-Scholes / N(d2))
We extract risk-neutral probabilities from Deribit IV to find the "fair price" of Polymarket outcomes.

- **Inputs**: `spot`, `strike`, `t_years` (time to expiry), `iv` (implied volatility).
- **Core Formula**:
  1. `d1 = (ln(spot/strike) + (r + sigma²/2) * t) / (sigma * sqrt(t))`
  2. `d2 = d1 - sigma * sqrt(t)`
  3. `P(S > K) = norm.cdf(d2)`
- **Constraint**: If `t_years <= 0`, return `1.0` if `spot >= strike` else `0.0`.
- **VRP Haircut**: Divide input IV by `VRP_DISCOUNT` (e.g., 0.85) to strip the Volatility Risk Premium before calculating probability.

---

## 2. Portfolio Optimization (Frank-Wolfe Kelly)
Determines how much to bet on correlated brackets (e.g., ETH > 2500 vs ETH > 2600).

- **Objective**: Maximize `Expected Log Wealth`.
- **Algorithm**: Frank-Wolfe (Projection-free convex optimization).
- **Steps**:
  1. **Build State Probabilities**: N strikes create N+1 discrete price states (e.g., `<2500`, `2500-2600`, `>2600`).
  2. **Returns Matrix (R)**: Calculate ROI for each asset in each state.
  3. **Gradient Descent**: Use `grad = (p_states / wealth) @ R` to iteratively move weights toward the "best" vertex.
- **Damping**: Multiply final weights by `KELLY_FRACTION` (e.g., 0.25) to avoid catastrophic ruin.

---

## 3. 3D Risk Matrix (The Triple-Gate)
Every trade must pass **all three** gates.

1. **Gate A: Global Exposure (30%)**:
   - `Sum(All open position costs + All pending maker costs) / Capital <= 0.30`
2. **Gate B: Temporal Correlation (15%)**:
   - `Sum(Position costs for TargetDate) / Capital <= 0.15`
3. **Gate C: Conviction Tiers**:
   - `p > 0.80` -> Max 5.0% pos size.
   - `p > 0.40` -> Max 3.0% pos size.
   - `else` -> Max 1.5% pos size.

---

## 4. Execution Logic (Hybrid Taker/Maker)
- **Spread-Adjusted Edge**: `Edge = p_real - entry_price`.
- **Taker Threshold**: If `Edge >= (Spread * 1.15) + Buffer`, execute a **Market/FOK** order.
- **Maker Threshold**: If Taker fails but `Edge > Buffer`, post a **Limit/Post-Only** order at `bid + 0.001`.
- **Slippage Guard**: Reject any order if the effective price (VWAP) deviates from the signal by more than `MAX_PRICE_DEVIATION` ($0.35).

---

## 5. Lifecycle Logic (Greed-Decay TP)
Automated exit strategy to lock in gains and recycle capital.

- **Capital Recycling**: If `bid >= 0.99`, sell instantly.
- **Greed Decay Formula**: `target = p_real * exp(-k * max(0, ROI))`
  - `k` scales with `entry_price` (be patient with cheap $0.03 tokens, be aggressive with expensive $0.80 tokens).
- **Time Discount**: `exit_price = target - (days_to_expiry * discount_rate)`.

---

## 7. Strategy Plugin Architecture (How to add an idea)
To keep the engine modular, every strategy is a **Plugin**. You (the user) just need to create a new class in `strategy/my_strategy.py`.

- **Base Class**: `class AbstractStrategy(ABC)`
- **Key Method**: `async def on_tick(self, market_snapshot: MarketSnapshot) -> List[Signal]`
- **Parameterization**: Strategies pull their inputs (e.g., `momentum_lookback`, `min_edge`) from `config/strategy_params.yaml`.

## 8. Backtesting Flow (The "Time Machine")
Backtesting runs the *exact same* strategy code as live trading, but redirects the inputs.

1.  **Initialize**: The `BacktestEngine` loads a specific Parquet file (`data/cache/2026-03-BTC.parquet`).
2.  **Simulation Loop**:
    ```python
    for row in parquet_data:
        # 1. Update Strategy
        signals = await my_strategy.on_tick(row)
        # 2. Virtual Broker (Execution)
        for sig in signals:
            virtual_broker.execute(sig, row.orderbook)
        # 3. Mark to Market
        portfolio.track_equity(row.price)
    ```
3.  **Reporting**: After the loop, the engine generates the `PerformanceReport` (Sharpe, Drawdown, etc.).

---

## 10. Market-Rolling (Chronological Transition)
To ensure zero downtime when trading 15-minute window markets (e.g., BTC 9:00, 9:15, 9:30):

- **Global Window Orchestration**: The `WindowSequenceHandler` is a top-level service in the `data/` layer. It acts as the "Master Clock" for the entire system (Ingestion, Screener, and Portfolio).
- **Global Window Orchestration**: The `WindowSequenceHandler` is a top-level service in the `data/` layer. It acts as the "Master Clock" for the entire system (Ingestion, Screener, and Portfolio).
- **Auto-Increment Logic**: For any market marked as `recurring` (e.g., BTC 15m), the handler automatically generates the next time-bucket string (e.g., "9:30-9:45" -> "9:45-10:00") and searches the Gamma API for the matching `market_id`.
- **Window Handoff**: 
  1. **T-Minus 2m**: Start fetching the orderbook for the *next* window.
  2. **T-Minus 0m**: Cease all new entries for the *expired* window.
  3. **T-Plus 1s**: Transition the `ActiveMarket` pointer to the new window system-wide.
- **Fail-Safe**: If a specific window (e.g., 10:00) is skipped by Polymarket, the handler enters a "Global Search" mode to find the next available chronological market for that asset.
- **Safety Timeout**: If the next window is not detected by T-Minus 1m, the system triggers a **Critical Alert** and enters a recursive search mode until the next chronological bucket is found.
- **Cleanup**: Auto-archive the expired window's telemetry.

## 11. Settlement & Portfolio Vacuuming
When a 15-minute window expires (T=0):
- **Immediate Freeze**: The `Broker` cancels all remaining LMT orders for that specific MarketID.
- **Settlement Monitoring**: The `PortfolioManager` starts a 5-minute polling loop to check for the "Resolved" status on-chain.
- **Cash Vacuum**: Once resolved, the `Portfolio` credit-limit (or cash balance) is automatically updated with the PnL (0.00 or 1.00 per share).
- **History Lock**: The resolved position is moved from `active_positions` to `historical_trades` with a final ROI timestamp.

## 9. Performance & Hardening
- **CPU Cooling**: Vectorized math (NumPy) shift calculations to C-level.
- **Tick-Throttling**: Strategy logic skips redundant pulses (e.g., min 500ms interval) to save cycles.
- **VPN Heartbeat**: Emits `{"pulse": "active"}` every 2s to prevent WSL/Windows bridge timeouts.

---

## 6. Infrastructure Reliability (Circuit Breakers)
- **Volatility Breaker**: If 1-minute realized volatility > `MOMENTUM_THRESHOLD`, freeze all new entries.
- **Stale Data Guard**: If (CurrentTime - PacketTimestamp) > `MAX_LATENCY_MS`, drop the packet.
- **WSL/VPN Heartbeat**: Emit `{"ping": "heartbeat"}` every 2 seconds via the WebSocket bridge to prevent tunnel timeout.
