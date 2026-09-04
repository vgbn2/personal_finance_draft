# Autonomous AI Strategy Research, Backtesting & Registry Guide

This guide describes how autonomous AI agents (Claude, GPT, Ollama, local LLMs, or background daemons) can research quantitative market alpha, execute native C++ backtests, and register valid strategy YAML configurations into Sovereign Trading Platform.

---

## 1. Overview & Protocol Architecture

Autonomous AI agents do not need special external access or proprietary tooling. They interact with Sovereign through three standard integration surfaces:

```text
               +-------------------------------------------+
               | Autonomous AI Agent / Researcher / LLM   |
               +-------------------------------------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
  [1. MCP Server Tool]       [2. CLI Subcommand]      [3. YAML Registry Direct]
  `explore_strategy`         `sovereign strategy       `config/strategies/`
  `run_backtest`              explore [--once]`         Canonical YAML Plan
         |                           |                           |
         +---------------------------+---------------------------+
                                     |
                                     v
                 +---------------------------------------+
                 | Native C++20 Sovereign Core Engine   |
                 | (`FrameBacktester::runFromAnnotated`) |
                 +---------------------------------------+
                                     |
                                     v
                 +---------------------------------------+
                 | Discovery History & State Ledger      |
                 | `storage/data/strategy_explorer_state |
                 +---------------------------------------+
```

---

## 2. Integration Modes for AI Agents

### Mode A: Model Context Protocol (MCP) Tools
Any MCP-compatible client (Claude Desktop, Cursor, Cline, OpenDevin, custom agent runners) can call the registered MCP tool:

- **Tool**: `explore_strategy`
- **Capability**: `research:run`
- **Arguments**: `{ "save_yaml": true }`
- **Behavior**: Generates a novel candidate ($\ge 50\%$ parameter novelty distance via SHA-256 fingerprinting), pulls continuous market data, runs the native C++ backtest, and writes `config/strategies/<name>.yaml`.

### Mode B: Direct CLI Execution
Autonomous scripts, cron jobs, or container runners can invoke the explorer directly:

```bash
# Run a single discovery cycle and output JSON
node backend/cli/sovereign_cli.js strategy explore --once --json

# Run continuous 30-minute background daemon
npm run strategy:explore -- --interval 30
```

### Mode C: Custom AI Agent YAML Generation & Native Backtest
If an AI agent creates a new strategy hypothesis independently, it can:
1. Write a canonical YAML definition to `config/strategies/<custom_name>.yaml`.
2. Execute the native C++ backtester:
   ```bash
   node backend/cli/sovereign_cli.js bt --strategy config/strategies/<custom_name>.yaml --timeframe 1h --sample --json
   ```
3. Evaluate metrics (win rate, Sharpe, Sortino, max drawdown, tail risk).

---

## 3. Canonical Strategy YAML Specification

Every strategy in `config/strategies/*.yaml` follows the standard format:

```yaml
name: auto_mean_reversion_knn_pattern_v0_1h_mtmp1n7y
kind: mean_reversion
family: mean_reversion
lane: single_asset
role: strategy
status: draft
enabled: false
model: knn_pattern_v0
timeframe: 1h
sections:
  hypothesis: "Mean reversion alpha using KNN pattern matching on RSI and return momentum."
  universe:
    - SPY
    - BTCUSDT
    - GLD
  signals:
    entry: "Bullish divergence with RSI < 35 and KNN positive prediction."
    exit: "Mean touch or holding horizon reached."
  data:
    required_sources:
      - price_volume
      - sentiment
    validation: strict
  features:
    technical:
      - rsi
      - return_fast
      - return_slow
      - bollinger
  indicators:
    return_fast: true
    return_slow: true
    volatility: false
    rsi: true
    atr: false
    bollinger: true
  indicator_periods:
    return_fast: 1
    return_slow: 5
    volatility: 20
    rsi: 14
    atr: 14
    bollinger: 20
  risk:
    signal_threshold: 0.65
    max_holding_days: 8
    risk_weight: 0.10
    fail_closed: true
  promotion:
    require_backtest: true
    require_walk_forward: true
    require_paper_trade: true
    review_required: true
```

---

## 4. Zero-Key Development & Safe Execution Policy
- **Zero-Key Invariant**: Strategy exploration and backtesting work out-of-the-box with synthetic bar generation (`generateSampleBars` / `--sample`) and cached fixtures without requiring external broker API keys.
- **Fail-Closed Boundary**: Autonomous exploration is strictly sandboxed for research and paper-trading simulation (`LIVE_TRADING=false`, `SOVEREIGN_EXECUTION_AUTHORIZED=false`).
