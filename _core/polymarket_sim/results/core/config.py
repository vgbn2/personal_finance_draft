"""
Polymarket Paper Trading Simulator — Configuration
All constants, API URLs, and default parameters.
"""

# ============================================================
# 🌐  API ENDPOINTS
# ============================================================

GAMMA_API_BASE = "https://gamma-api.polymarket.com"
CLOB_API_BASE = "https://clob.polymarket.com"
WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"

# -------------------------------------------------------------------------
# WS HEADERS (Required to bypass Cloudflare 403 Forbidden)
# -------------------------------------------------------------------------
# The User-Agent must look like a real browser (not default Python/websockets)
# The Origin must match the expected Polymarket frontend origin.
WS_ORIGIN = "https://polymarket.com"
WS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# ============================================================
# ⏱  MARKET WINDOW
# ============================================================

WINDOW_SECONDS = 15 * 60          # 15-minute window size
WINDOW_SWITCH_BUFFER_S = 2        # seconds buffer after window boundary

# ============================================================
# 🎯  SIMULATION DEFAULTS
# ============================================================

SIMULATED_LATENCY_MS = 75         # virtual network latency (ms)
MAX_ORDER_SIZE = 1_000            # max shares per virtual order
DEFAULT_BANKROLL = 1_000.0        # starting paper-trade bankroll (USD)
RISK_FREE_RATE = 0.05             # annualised risk-free rate for Sharpe

# ── Spread Cost Model ─────────────────────────────────────
# "dynamic": fee = max(half_spread, MIN_SPREAD_COST) per share
# "flat":    fee = FLAT_FEE_PER_SHARE per share (legacy)
SPREAD_COST_MODEL = "dynamic"     # "dynamic" or "flat"
MIN_SPREAD_COST = 0.005           # floor 0.5¢/share (min round-trip 1¢)
FLAT_FEE_PER_SHARE = 0.01        # fallback flat fee when no book data
# Alias so old code doesn't break:
SIMULATED_FEE_PER_SHARE = FLAT_FEE_PER_SHARE

# ============================================================
# 🔧  ENGINE TUNING
# ============================================================

STRATEGY_TIMEOUT_S = 1.0          # max seconds per strategy callback
METRICS_PRINT_INTERVAL_S = 0.1      # console metrics refresh rate
ORDERBOOK_DEPTH = 20              # price levels to display / track
WS_PING_INTERVAL_S = 30           # WebSocket keepalive ping
WS_RECONNECT_MAX_DELAY_S = 60     # max backoff for WS reconnection

# ── Liquidity Alert Thresholds ────────────────────────────
MAX_SAFE_SPREAD = 0.03            # 3¢ — alert when spread exceeds this
MIN_SAFE_DEPTH = 500              # shares — alert when depth < this within ±2¢

# ============================================================
# 📊  STRATEGY GRADING THRESHOLDS
# ============================================================

GRADE_THRESHOLDS = {
    "sharpe": {
        "excellent": 2.0,
        "good": 1.0,
        "acceptable": 0.5,
    },
    "win_rate": {
        "excellent": 0.65,
        "good": 0.55,
        "acceptable": 0.45,
    },
    "ev_per_trade": {
        "excellent": 5.0,
        "good": 2.0,
        "acceptable": 0.5,
    },
    "max_drawdown_pct": {
        "excellent": 5.0,
        "good": 10.0,
        "acceptable": 20.0,
    },
    "min_trades": 100,         # minimum trades before grading is valid
}

# Letter-grade weights  (sum = 1.0)
GRADE_WEIGHTS = {
    "sharpe": 0.35,
    "win_rate": 0.25,
    "ev_per_trade": 0.25,
    "max_drawdown_pct": 0.15,
}

# ============================================================
# 🪵  LOGGING
# ============================================================

import logging

LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s"
LOG_LEVEL = logging.INFO

# NOTE: The actual setup_logging() function lives in core/logger.py
# It is imported by engine.py from there. Do not duplicate it here.
