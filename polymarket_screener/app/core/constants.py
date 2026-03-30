"""
Centralized constants for the Polymarket Screener engine.

All magic numbers, guard values, and time conversions live here.
Any module needing these values MUST import from this file
instead of hardcoding inline.
"""

# ─── Time Conversions ───
MINUTES_PER_DAY = 1440
DAYS_PER_YEAR = 365

# ─── Math Guards ───
EPSILON = 1e-9          # Division-by-zero protection
MIN_SPREAD = 0.0001     # Minimum spread for scoring (prevents infinite edge/spread)
MIN_VOLUME_USD = 10.0   # Minimum volume for log10 calculation

# ─── Black-Scholes Defaults ───
DEFAULT_RISK_FREE_RATE = 0.05   # 5% annualized
DEFAULT_VRP_DISCOUNT = 0.85     # Volatility Risk Premium haircut

# ─── Scoring Defaults ───
MIN_LIQUIDITY_LOG_BASE = 10.0   # Floor for log10(volume) in MarketScorer
DEFAULT_SCORE_MULT_MIN = 0.5    # Minimum score multiplier
DEFAULT_SCORE_MULT_MAX = 1.5    # Maximum score multiplier
SCORE_DIVISOR = 15.0            # Normalizer for score → multiplier conversion

# ─── Correlation Tracker ───
MIN_CORRELATION_SAMPLES = 10    # Minimum data points before calculating correlation
DEFAULT_CORRELATION_WINDOW = 50 # Rolling window size for correlation tracker

# ─── Imbalance Thresholds ───
IMBALANCE_SUPPRESS_THRESHOLD = 0.5  # Absolute imbalance above which signals are suppressed
