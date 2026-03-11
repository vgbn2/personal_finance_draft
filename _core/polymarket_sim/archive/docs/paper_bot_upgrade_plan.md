# Polymarket Sim Upgrades (Paper Bot Port)

## Goal
Integrate the multi-signal strategies and risk management features from the Google Drive `paper_bot.py` into the existing `polymarket_sim` engine. 

## Proposed Implementation

### 1. Dual Websocket Support (`ws_binance.py`) 
- [x] The SIM engine currently connects only to Polymarket's Gamma WS.
- [x] We will add a background connection to Binance's WSS stream passing BTC price updates and sliding 60-sec deltas directly to the strategies via `TickData` extensions or a shared state object.

### 2. Multi-Signal Strategy (`strategy_multi_signal.py`)
- [x] We will port the 3 core signals from `paper_bot.py`:
  1. **MOM (Momentum Divergence)**
  2. **MR (Mean Reversion)**
  3. **EXP (Expiry Convergence)**
- [x] Implement them as a single comprehensive strategy extending `BaseStrategy` that evaluates all 3 on each tick and returns `VirtualOrder`s.

### 3. Strategy-level Risk Management
- [x] **Quarter-Kelly Sizing**: Use the existing `sizing.py` which exactly matches the `paper_bot.py` math.
- [x] **Take Profit / Stop Loss**: Since the SIM engine doesn't natively support conditional orders yet, the strategy will self-manage exits:
  - Track active positions.
  - If current mid reaches TP (60% of original edge) or SL (50% adverse edge), emit a matching CLOSE order.
- [x] **Cooldowns & Caps**: Implement 30s trade cooldowns and active trade caps.

## Verification
- [x] Run the simulation engine with the new `multi_signal` strategy on an active BTC 15m market and observe the new Binance WS inputs and Kelly-sized MOM/MR/EXP order firing.
