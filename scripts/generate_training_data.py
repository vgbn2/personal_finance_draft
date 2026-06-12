#!/usr/bin/env python3
"""
Generate synthetic JSONL training data for Qwen2.5-Coder finetuning.
Covers: Broker setup, Strategy analysis, Codebase patterns.
"""

import json
import sys

# Domain 1: Broker & Platform Setup
BROKER_PAIRS = [
    {
        "instruction": "How do I connect MetaTrader 5 to Sovereign?",
        "input": "",
        "output": "To connect MT5:\n1. Go to Execution & Trading → MT5 / EA\n2. Select 'MT5 / EA Profiles'\n3. Add a new profile with your MT5 Terminal ID\n4. Use MT5 Connect to launch the terminal\n5. Platform will write a temporary INI config and auto-delete after 5s\nAlways verify account balance before executing live trades."
    },
    {
        "instruction": "What are the MT5 credential security requirements?",
        "input": "",
        "output": "MT5 credentials are stored using AES-256-GCM encryption in a vault (shared/lib/mt5_profiles.js):\n- Never store plaintext secrets\n- Use promptPassword() from CLI for secure input\n- Vault decrypts only when includeSecret:true is set\n- Temporary INI files are created in os.tmpdir() and deleted after 5s\n- Terminal ID is stored plaintext but password is always encrypted."
    },
    {
        "instruction": "How do I set up Alpaca trading in Sovereign?",
        "input": "",
        "output": "Alpaca setup:\n1. Open Execution & Trading → Alpaca\n2. Select balance, buy, sell, or orders\n3. Buy example: `trade buy AAPL 10 market`\n4. Sell example: `trade sell TSLA 5 limit 180`\n5. All orders default to dry-run; use --live to execute\n6. Preview orders before sending to the gateway\n7. Verify balance snapshot after each trade."
    },
    {
        "instruction": "What is the Add Broker / Platform wizard?",
        "input": "",
        "output": "The 'Add Broker / Platform' wizard guides custom broker integration:\n1. User selects: Alpaca, MT5, or Other\n2. For 'Other': Local AI agent provides guidance (via Ollama Qwen2.5-Coder)\n3. AI suggests authentication flow, data ingestion, and execution patterns\n4. Wizard scaffolds the command handler and wires it into the TUI\n5. All custom brokers follow the same execution/trading lifecycle."
    },
    {
        "instruction": "What does the Auto-Trade Loop do?",
        "input": "",
        "output": "Auto-Trade Loop (Execution → Auto-Trade):\n- Runs strategies continuously at a user-defined interval (default 15 minutes)\n- Loads strategy YAML from config/strategies/\n- Executes backtest → live signal generation → order placement\n- Supports --interval flag to set frequency (in minutes)\n- --live flag enables actual order execution; defaults to dry-run\n- Can be left running in a terminal for hands-free trading."
    },
    {
        "instruction": "How do I mass-backfill all symbols and timeframes?",
        "input": "",
        "output": "Mass Backfill (Data Operations → Mass Backfill):\n- Pulls all symbols from config and all configured timeframes (1h, 4h, 1d)\n- Uses concurrency control to limit simultaneous API calls\n- Merges results into partitioned snapshot cache\n- Flags: --timeframes '1h,4h,1d' --days 90 --concurrency 5 --dry-run\n- Dry-run mode shows what would be fetched without making calls\n- Progress shown on a single TTY line with rate/ETA."
    }
]

# Domain 2: Strategy & Analysis
STRATEGY_PAIRS = [
    {
        "instruction": "What does the Mean Reversion strategy do?",
        "input": "",
        "output": "Mean Reversion Strategy (config/strategies/mean_reversion.yaml):\n- Trades reversion on indices (SPY) and major crypto (BTCUSDT)\n- Entry signal: RSI > 0.65 (oversold bounce)\n- Hold: 5 days maximum\n- Features: return_fast (1), return_slow (5), volatility (20), RSI (14), ATR (14), Bollinger (20)\n- Risk: max_holding_days=5, risk_weight=0.05, fail_closed=true\n- Requires strict validation of price_volume data\n- Model: CNN v3 for signal generation"
    },
    {
        "instruction": "What indicators does Sovereign support?",
        "input": "",
        "output": "Sovereign Indicators (config/trading/indicator_config.yaml):\n- Kalman Filter (process_noise: 0.001, measurement_noise: 1.0)\n- RSI (period: 14)\n- MACD (fast: 12, slow: 26)\n- Volatility (period: 20)\n- Bollinger Bands (period: 20)\n- ATR (period: 14)\n- Stochastic (period: 14, signal: 3)\n- Returns (fast: 1, slow: 5 day rolling)\n- SMA (slow: 50 day)\nAll indicators calculated from cached market snapshots."
    },
    {
        "instruction": "How do I validate a strategy before backtesting?",
        "input": "",
        "output": "Strategy Validation (CLI: `sovereign strategy validate <file>`):\n1. YAML schema check: name, kind, family, sections (hypothesis, universe, signals, data, features)\n2. Data validation: required_sources (price_volume, etc.)\n3. Indicator availability: verify all indicators in feature list exist\n4. Universe validation: symbols must be in asset_mapping.yaml\n5. Risk parameters: thresholds, holding days, max loss\n6. Signal logic: entry/exit conditions must be numeric\n7. Fail-safe mode: catch invalid signals and revert to no-trade state"
    },
    {
        "instruction": "What is the backtest framework?",
        "input": "",
        "output": "Backtest Framework (backend/core C++ + Node CLI wrapper):\n1. Loads historical OHLCV data from cache (must be pre-backfilled)\n2. Replays bars in sequence, calculating indicators per-bar\n3. Generates entry/exit signals from strategy rules\n4. Simulates execution at bar close (slippage configurable)\n5. Tracks P&L, drawdown, Sharpe ratio, win rate\n6. Outputs: metrics JSON, trade ledger CSV, confidence score\n7. CLI: `sovereign backtest <symbol> <strategy> --days 365`"
    },
    {
        "instruction": "How do I interpret backtest results?",
        "input": "",
        "output": "Backtest Results Interpretation:\n- Return %: total profit/loss as percentage of starting capital\n- Sharpe Ratio: risk-adjusted return (>1 is good)\n- Max Drawdown: largest peak-to-trough decline\n- Win Rate: % of profitable trades\n- Profit Factor: gross profit / gross loss (>1.5 is profitable)\n- Confidence Score: model's internal confidence in signal quality\nAlways backtest on at least 1 year of historical data before live trading."
    },
    {
        "instruction": "How do I optimize a strategy?",
        "input": "",
        "output": "Strategy Optimization:\n1. Identify tunable parameters (RSI period, holding days, risk_weight)\n2. Define search space (e.g., RSI: 10-30, holding: 3-10 days)\n3. Run grid/random search: `sovereign optimize <strategy> --params grid`\n4. For each combo: backtest and record metrics\n5. Rank by Sharpe ratio or custom fitness function\n6. Export top N variants to new YAML files\n7. Backtest top variant on out-of-sample data to verify (avoid overfitting)"
    }
]

# Domain 3: Codebase Patterns
PATTERN_PAIRS = [
    {
        "instruction": "How should I structure a new CLI command?",
        "input": "",
        "output": "CLI Command Structure (backend/cli/commands/):\n1. Create file: backend/cli/commands/mycommand.js\n2. Export async function: async function commandMyCommand(args, options) {...}\n3. Destructure utils: const { promptSelect, promptText, printPayload } = require('../lib/utils')\n4. Parse flags via hasFlag(args, '--flag') and optionValue(args, '--option')\n5. Return { status: 'ok'|'error', data: {...}, message: '...' }\n6. Register in sovereign_cli.js: import commandMyCommand, add route in switch\n7. Add TUI entry in backend/cli/tui/manifest.js under relevant category"
    },
    {
        "instruction": "How do I add a new route to the TUI?",
        "input": "",
        "output": "TUI Route Addition (backend/cli/tui/manifest.js):\n1. Add entry to DATA_MANIFEST under category:\n   { id: 'my-command', label: 'My Command', args: [] }\n2. For sub-menus, define flags:\n   flags: { '--option': { type: 'text', default: 'value', label: 'Label' } }\n3. Category structure: op (operations), data, trade (execution), strategy\n4. Each entry maps to a CLI command route\n5. TUI calls promptSelect() to build menu, passes args to CLI\n6. Command handler receives args and processes the request"
    },
    {
        "instruction": "How do I use the market snapshot cache?",
        "input": "",
        "output": "Market Snapshot Cache (shared/lib/market_validation.js):\n1. Read: readSnapshot(symbol, timeframe) → { bars: [...], timestamp }\n2. Validate: validateSnapshot(snapshot, symbol, timeframe) → boolean\n3. All bars must have OHLCV (open, high, low, close, volume)\n4. Cache stored in storage/data/market_snapshots/{symbol}_{timeframe}.json\n5. TTL checked via ttl_cache.js (default 24h)\n6. Backfill refreshes stale symbols (older_than 24h)\n7. Use in indicators: bars.map(bar => calculate_indicator(bar))"
    },
    {
        "instruction": "How does the MCP server expose Sovereign tools?",
        "input": "",
        "output": "MCP Server Integration (backend/mcp_server/):\n1. Tools defined in backend/mcp_server/tools/ (*.ts files)\n2. Schema: { name, description, input_schema: { type: 'object', properties: {...} } }\n3. Handler: async function that calls CLI or C++ backend\n4. Register in index.ts: ListToolsRequestSchema and CallToolRequestSchema\n5. Example: backfill_all → calls CLI mass-backfill → returns progress JSON\n6. MCP makes Sovereign callable from Claude, Codex, agents\n7. Tool output returned as { content: [{ type: 'text', text: '...' }] }"
    },
    {
        "instruction": "How do I use Ollama's ai_client for local guidance?",
        "input": "",
        "output": "Local Ollama AI Integration (shared/lib/ai_client.js):\n1. Import: const { ask, isAvailable } = require('./ai_client')\n2. Check availability: if (await ai_client.isAvailable()) {...}\n3. Ask question: const result = await ask('Your prompt', 'system context')\n4. Returns: { text: '...', source: 'ollama:qwen2.5-coder:7b' } or null\n5. No API keys needed (100% local, port 11434)\n6. Model: Qwen2.5-Coder:7b (lightweight, coding-optimized)\n7. Example use: commandAddPlatform asks for broker setup guidance"
    },
    {
        "instruction": "What is the shared library architecture?",
        "input": "",
        "output": "Shared Library (shared/lib/):\n- ai_client.js: Local Ollama integration\n- indicators.js: Technical indicator calculations (RSI, MACD, Kalman, etc.)\n- market_validation.js: Snapshot reading and validation\n- strategy_registry.js: Load/list strategy YAML files\n- mt5_profiles.js: Encrypted vault for MT5 credentials (AES-256-GCM)\n- ttl_cache.js: TTL-based caching for API responses\nAll exports are async/Promise-based. Use in CLI, API, and C++ via Node bridge."
    },
    {
        "instruction": "How do I test a new feature without affecting live trading?",
        "input": "",
        "output": "Safe Testing Workflow:\n1. All operations default to --dry-run (no real orders)\n2. Backtest uses historical data only (no live quotes)\n3. Use --json flag to capture output programmatically\n4. Test data in storage/data/test_fixtures/ (checked in)\n5. CI/CD runs automated tests via npm test before merging\n6. Only use --live when you're confident and have reviewed the order\n7. MFA PIN required for live orders (config SOVEREIGN_TRADE_PIN)"
    }
]

def generate_training_jsonl():
    """Generate and write synthetic training JSONL."""
    all_pairs = BROKER_PAIRS + STRATEGY_PAIRS + PATTERN_PAIRS

    output_path = "training_data.jsonl"
    with open(output_path, "w") as f:
        for pair in all_pairs:
            f.write(json.dumps(pair) + "\n")

    print(f"[OK] Generated {len(all_pairs)} training examples")
    print(f"[OK] Saved to: {output_path}")
    print(f"  - Broker/Platform: {len(BROKER_PAIRS)} examples")
    print(f"  - Strategy/Analysis: {len(STRATEGY_PAIRS)} examples")
    print(f"  - Code Patterns: {len(PATTERN_PAIRS)} examples")
    print(f"\nFormat: instruction + input + output (Alpaca format)")
    print(f"Ready for finetuning with Unsloth QLoRA on RTX 3050")

if __name__ == "__main__":
    generate_training_jsonl()
