# 🎯 Polymarket Paper Trading Simulator

> Live shadow-trading simulator for [Polymarket](https://polymarket.com) binary prediction markets.  
> Ingests real-time L2 orderbook data via WebSocket. Runs your Python strategies. Tracks everything. **No real money at risk.**

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
cd polymarket_sim
pip install -r requirements.txt

# 2. Run with the built-in example strategy
python -m polymarket_sim --strategy strategies/strategy_alpha.py

# 3. Run with custom bankroll
python -m polymarket_sim --strategy strategies/strategy_alpha.py --bankroll 5000

# 4. Target a specific market
python -m polymarket_sim --strategy strategies/strategy_alpha.py --market btc-updown-15m-1767186000

# 5. Run ALL strategies at once
start_all.bat
```

**Requirements:** Python 3.10+, internet connection for Polymarket WebSocket.

---

## 📖 User Guide

### What This Does

The simulator connects to Polymarket's live orderbook data and runs your trading strategy in a **shadow environment**. Every order your strategy makes is a virtual order — filled against real market prices but with zero financial risk.

```
You write a strategy → Simulator runs it live → You see if it makes or loses money
```

### What You See

Every 5 seconds, the simulator prints a live dashboard:

```
──────────────────────────────────────────────────────────────
📊 Tick #1420 | Mean Reversion Alpha | Bankroll: $1,023.50
   PnL: $23.50 (realized: $18.20, unrealized: $5.30)
   Trades: 14 | Win Rate: 64.3% | Sharpe: 1.82 | EV: $1.30
   StDev: 0.0234 | Max Drawdown: 3.2% | Open Orders: 2
   Grade: B (MONITOR) — Promising, needs more data
   Position [Up]: BUY 100 @ 0.5200 (uPnL: $5.30)
──────────────────────────────────────────────────────────────
```

### Stopping the Simulator

Press **Ctrl+C** at any time. The simulator will:
1. Disconnect cleanly from WebSocket
2. Print a final **Strategy Report Card**
3. Show your complete portfolio summary

---

## 🔄 How to Change Your Strategy

### Step 1: Create a New Strategy File

Create a new `.py` file anywhere. It must subclass `BaseStrategy`:

```python
# my_strategy.py
from polymarket_sim.base_strategy import BaseStrategy
from polymarket_sim.models import (
    Fill, OrderbookSnapshot, OrderSide, OrderType, TickData, VirtualOrder
)

class MyCustomStrategy(BaseStrategy):
    name = "My Custom Strategy"
    description = "Does something smart"
    version = "1.0.0"

    def on_tick(self, tick: TickData) -> list[VirtualOrder]:
        # Your logic here — return orders or empty list
        if tick.mid_price < 0.45:
            return [VirtualOrder(
                token_id=tick.token_id,
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                price=tick.best_ask,
                size=100,
            )]
        return []

    def on_orderbook_update(self, book: OrderbookSnapshot) -> list[VirtualOrder]:
        return []  # Optional: react to orderbook changes

    def on_fill(self, fill: Fill) -> None:
        pass  # Optional: track your fills
```

### Step 2: Run It

```bash
python -m polymarket_sim --strategy path/to/my_strategy.py
```

### What Happens When You Switch Strategies

| Action | Result |
|--------|--------|
| Change `--strategy` flag | New strategy loaded, fresh portfolio, clean slate |
| Edit strategy file while running | **No effect** — restart required to pick up changes |
| Strategy crashes | Engine continues running, logs the error, strategy calls return empty |
| Strategy times out (>1s) | Treated as a crash — logged, no orders submitted |
| Strategy returns bad data | Filtered out automatically, warning logged |

### The Strategy Interface

Your strategy gets 3 callbacks:

| Method | When Called | Input | Returns |
|--------|-----------|-------|---------|
| `on_tick(tick)` | Every orderbook update | `TickData` (mid_price, bid, ask, spread) | `list[VirtualOrder]` |
| `on_orderbook_update(book)` | Every orderbook update | `OrderbookSnapshot` (full bid/ask depth) | `list[VirtualOrder]` |
| `on_fill(fill)` | When your order fills | `Fill` (price, size, slippage) | `None` |

**Key rule:** All inputs are **read-only**. You cannot mutate the orderbook or engine state. You can only submit orders by returning `VirtualOrder` objects.

---

## 📊 Strategy Grading System

The simulator automatically rates your strategy in real-time using a **4-dimension scoring system**:

### Scoring Dimensions

| Dimension | Weight | What It Measures | Excellent | Good | Acceptable |
|-----------|--------|------------------|-----------|------|------------|
| **Sharpe Ratio** | 35% | Risk-adjusted returns | ≥ 2.0 | ≥ 1.0 | ≥ 0.5 |
| **Win Rate** | 25% | Trade consistency | ≥ 65% | ≥ 55% | ≥ 45% |
| **EV per Trade** | 25% | Edge magnitude ($) | ≥ $5.00 | ≥ $2.00 | ≥ $0.50 |
| **Max Drawdown** | 15% | Risk control (lower = better) | ≤ 5% | ≤ 10% | ≤ 20% |

### Letter Grades

| Grade | Score | Verdict | What to Do |
|-------|-------|---------|------------|
| **A+** | 90-100 | ✅ DEPLOY | Strategy is production-viable. Consider live trading. |
| **A** | 80-89 | ✅ DEPLOY | Strong performer. Run for a few more sessions to confirm. |
| **B** | 65-79 | 👀 MONITOR | Promising but needs more data. Keep running. |
| **C** | 50-64 | 👀 MONITOR | Marginal. May need parameter tuning. |
| **D** | 35-49 | 🚫 DO NOT USE | Underperforming. Redesign needed. |
| **F** | 0-34 | 🚫 DO NOT USE | Losing money. Stop immediately. |
| **?** | — | ⏳ INSUFFICIENT DATA | < 20 trades completed. Keep running. |

### Report Card

At shutdown, you get a formatted report:

```
╔══════════════════════════════════════════════════════╗
║           📊  STRATEGY REPORT CARD  📊              ║
╠══════════════════════════════════════════════════════╣
║  Strategy :  Mean Reversion Alpha                   ║
║  Grade    :  A   (82/100)                           ║
║  Verdict  :  ✅ DEPLOY                              ║
╠══════════════════════════════════════════════════════╣
║  Sharpe      :   85.2/100                           ║
║  Win Rate    :   78.0/100                           ║
║  EV/Trade    :   80.5/100                           ║
║  Drawdown    :   91.0/100                           ║
╠══════════════════════════════════════════════════════╣
║  Strong performance across all metrics.             ║
╚══════════════════════════════════════════════════════╝
```

---

## 🧭 When to Use / Not Use Strategies

### ✅ When to Use the Simulator

| Scenario | Why |
|----------|-----|
| Testing a new strategy idea | See if it makes money before risking real funds |
| Comparing strategies | Run multiple sessions, compare report cards |
| Parameter tuning | Try different thresholds, position sizes, lookback periods |
| Learning market microstructure | See how orderbooks move in real-time |
| Validating risk management | Check if your max drawdown stays within limits |

### ❌ When NOT to Use

| Scenario | Why |
|----------|-----|
| **Expecting exact real-money results** | Simulated fills don't include queue position, real latency, or market impact |
| **Testing HFT strategies** | 75ms simulated latency is generous — real latency may differ |
| **Markets with very low liquidity** | Thin orderbooks mean shadow fills are unrealistic |
| **As a replacement for backtesting** | This is live-forward testing, not historical backtesting |

### Strategy-Specific Guidance

**Mean Reversion (included example):**
- ✅ Use in: Oscillating markets, tight spreads, high liquidity
- ❌ Avoid in: Strong trending markets, wide spreads (>5¢), low volume

**Momentum/Trend Following (write your own):**
- ✅ Use in: Clear directional markets (e.g., during news events)
- ❌ Avoid in: Choppy, range-bound markets

**Market Making (write your own):**
- ✅ Use in: Stable markets with consistent spread
- ❌ Avoid in: Highly volatile or one-sided markets

---

## ⭐ Features Implemented

The simulator has been upgraded with advanced capabilities to ensure realism and robustness:

### 🔄 Continuous Market Rotation (24/7 Simulation)
- **Auto-Pivot**: The engine automatically detects when a market expires/resolves and seamlessly transitions to the next active BTC/ETH 15m market.
- **Robust Settlement**: Positions are settled at $1.00 (Win) or $0.00 (Loss) upon market resolution.
- **Session Reporting**: Generates detailed JSON summaries in `data/sessions/` after every cycle.

### 🛡️ Smart Entry Filters
- **Spread Protection**: Strategies automatically pause if the spread exceeds a defined threshold (e.g., > 3¢), preventing bad fills.
- **Bankroll Safety**: Pre-trade validation eliminates "Insufficient Funds" errors by checking available cash/collateral.
- **Price Banding**: Filters out trades at extreme prices (<2¢ or >98¢) to avoid binary outcome variance and slippage.

### 📉 Realistic Market Mechanics
- **Dynamic Spread Modeling**: Spreads widen during high volatility or low liquidity periods.
- **Slippage Simulation**: Large orders "walk the book" (VWAP execution), incurring realistic price impact based on order size and liquidity.
- **Fee Simulation**: Includes a configurable fee per share (default 1 cent) to simulate real trading costs.

### 🖥️ Advanced Dashboard (TUI)
- **Matrix-Style Interface**: Real-time console dashboard using `rich`.
- **Live Orderbook**: Visualizes the Bids/Asks depth and spread.
- **Sparklines**: Tracks PnL and Spread history visually.
- **Performance Metrics**: Real-time Sharpe Ratio, Win Rate, and EV/Trade updates.

### ⚡ Developer Experience
- **Windows Terminal Integration**: `start_all.bat` launches multiple strategies in clean, labeled tabs.
- **Research Tools**:
    - **Markov Analysis**: Calculates state transition probabilities.
    - **Monte Carlo**: Simulates equity curves based on historical performance.
    - **Market Impact**: Analyzes slippage costs for different order sizes.

---

## 🏗️ Architecture

```
WebSocket ──→ Orderbook ──→ Strategy ──→ Matching Engine ──→ Portfolio ──→ Metrics
   │              │              │              │                │           │
   │         SortedDict      Sandboxed      VWAP + Latency    PnL Track   Sharpe
   │         (bids/asks)     (timeout)      (shadow fills)    (mark-to-   Win Rate
   │                                                           market)    EV, StDev
   │
   └── Auto-reconnect with exponential backoff
```

### Files

| File | Purpose |
|------|---------|
| `config.py` | Constants, API URLs, grading thresholds |
| `models.py` | All dataclasses (Order, Fill, Position, etc.) |
| `rest_client.py` | Gamma API market discovery + REST snapshots |
| `ws_client.py` | WebSocket L2 orderbook subscription |
| `orderbook.py` | In-memory sorted LOB with VWAP traversal |
| `matching_engine.py` | Shadow fill engine with latency simulation |
| `portfolio.py` | Position tracking and PnL calculation |
| `metrics.py` | NumPy-based Sharpe, EV, Win Rate, StDev |
| `base_strategy.py` | Strategy ABC (interface to implement) |
| `strategy_runner.py` | Safe strategy loader with timeout isolation |
| `strategy_grader.py` | A+ through F grading system |
| `engine.py` | Main async orchestrator |
| `main.py` | CLI entry point |
| `strategies/strategy_alpha.py` | Example mean-reversion strategy |

---

## 🧪 Testing

```bash
cd polymarket_sim
pip install pytest
python -m pytest tests/ -v
```

Tests cover:
- **Orderbook:** Snapshot/delta ops, spread calculation, VWAP walk
- **Matching Engine:** Market/limit fills, multi-level VWAP, latency simulation
- **Metrics:** Division-by-zero guards, grading system edge cases

---

## ⚠️ Important Notes

1. **No real money.** This is strictly a paper-trading simulator.
2. **Simulated fills are optimistic.** Real execution has worse queue priority, higher latency, and market impact.
3. **API rate limits.** Polymarket enforces limits; the system handles this with exponential backoff.
4. **Strategy safety.** Your strategy runs in an isolated sandbox — if it crashes or times out, the engine keeps running.
5. **15-minute windows.** The simulator auto-switches to the next BTC Up/Down market every 15 minutes.

---

## 📋 Configuration

All tunable parameters are in `config.py`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `SIMULATED_LATENCY_MS` | 75 | Virtual network latency for shadow fills |
| `MAX_ORDER_SIZE` | 1000 | Maximum shares per virtual order |
| `DEFAULT_BANKROLL` | 1000 | Starting paper-trade bankroll (USD) |
| `RISK_FREE_RATE` | 0.05 | Annual risk-free rate for Sharpe calculation |
| `STRATEGY_TIMEOUT_S` | 1.0 | Max seconds per strategy callback |
| `METRICS_PRINT_INTERVAL_S` | 5 | Console refresh rate (seconds) |
| `GRADE_THRESHOLDS.min_trades` | 20 | Minimum trades before grading kicks in |

---

## 📚 Developer Guide & Code Encyclopedia

This section provides a deep dive into the codebase for developers modifying or debugging the simulator.

### 📂 Folder Structure

- **`polymarket_sim/`**: Root package.
  - **`engine.py`**: The "brain". Async event loop that coordinates everything.
  - **`main.py`**: CLI entry point. Parses args and launches `engine.py`.
  - **`core/`**: Infrastructure and utilities.
    - `config.py`: Central configuration. *Modify this to change bankroll, risks, etc.*
    - `logger.py`: Logging setup. Handles file vs console output.
    - `dns.py`: Custom DNS resolver (bypasses system DNS if needed).
  - **`data/`**: External connectivity.
    - `rest_client.py`: Gamma API (Market Discovery).
    - `ws_client.py`: WebSocket Client (Orderbook Data). *Contains 403 fix logic.*
  - **`models.py`**: Data structures (TickData, Order, Fill). *The language of the system.*
  - **`strategies/`**: User strategies.
    - `base_strategy.py`: Abstract Base Class for all strategies.
    - `strategy_runner.py`: Sandbox for running untrusted strategy code.
  - **`tests/`**: Unit tests, integration tests, diagnostics and regression tests.

---

### 🧠 Code Encyclopedia & Definitions

#### 1. The Engine (`engine.py`)
- **Definition:** The central async orchestrator.
- **Use Case:** Manages the lifecycle of the simulation (Connect -> Subscribe -> Loop -> Teardown).
- **Key Block:** `run()` method. It checks for market window expiry (15m) and rotates markets automatically.

#### 2. WebSocket Client (`data/ws_client.py`)
- **Definition:** Handles the persistent connection to Polymarket CLOB.
- **Use Case:** Streaming real-time L2 data (bids/asks).
- **Critical Logic (HTTP 403 Fix):**
  - **Problem:** Polymarket blocks default Python user agents.
  - **Fix:** We MUST send `Origin: https://polymarket.com` and a browser-like `User-Agent`.
  - **Code:** Inside `connect()`, we inject these headers into the `websockets` handshake.
  - **When to modify:** Only if Polymarket changes their WSS endpoint or protection logic (e.g. requires `Host` header strictly).

#### 3. Matching Engine (`matching_engine.py`)
- **Definition:** Simulates the exchange matching logic.
- **Use Case:** Determines if your `VirtualOrder` would have filled in real life.
- **Key Logic:**
  - **Latency Simulation:** It delays your order by `SIMULATED_LATENCY_MS` (75ms).
  - **VWAP Fills:** Large orders "walk the book" (eat through multiple price levels), creating realistic slippage.
  - **Bankroll Guard:** Prevents spending more than you have.

#### 4. Strategies (`strategies/`)
- **Definition:** Your trading logic subclasses `BaseStrategy`.
- **Use Case:** Taking `TickData` and deciding whether to buy/sell.
- **Rules:**
  - **Stateless:** Prefer not keeping complex state; rely on `on_tick` inputs.
  - **Safe:** If you raise an Exception, the engine catches it and logs it, preventing a crash.
  - **Fast:** You have 1 second to return orders. Slower = Timeout.

---

### 🛡️ Header & Connectivity Reference

**Header: `User-Agent`**
- **Value:** `Mozilla/5.0 ... (Chrome)`
- **When to use:** ALWAYS. Cloudflare blocks scripts without it.
- **Where defined:** `core/config.py` -> `WS_USER_AGENT`.

**Header: `Origin`**
- **Value:** `https://polymarket.com`
- **When to use:** ALWAYS for WebSocket connections to `ws-subscriptions-clob`.
- **Why:** The server checks this to prevent unauthorized cross-site scripting or non-browser bots.
- **Where defined:** `core/config.py` -> `WS_ORIGIN`.

**Header: `Host`**
- **Value:** `ws-subscriptions-clob.polymarket.com`
- **When to use:** Usually handled automatically by the WebSocket library.
- **Special Case:** If connecting to a raw IP address (e.g. to bypass DNS), you *must* manually set this header to the hostname, or Cloudflare will reject the request (403). *Current implementation relies on system DNS, so this is automatic.*

---

### 🔧 Common Development Tasks

**Q: How do I add a new metric?**
A: implementation in `metrics.py` class `MetricsTracker`, then update `engine.py` to print it.

**Q: How do I change the market being traded?**
A: The simulator auto-selects the nearest 15m BTC market. To override, use `--market` CLI flag or modify `rest_client.py` logic.

**Q: I'm getting "403 Forbidden" on WebSocket?**
A: Check `core/config.py`. Ensure `WS_USER_AGENT` and `WS_ORIGIN` are set. Verify `ws_client.py` uses them.


