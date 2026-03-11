"""
Sentinel-MT5 — Centralized Configuration
==========================================
All secrets loaded from environment variables / .env file.
No hardcoded credentials.
"""
import os
from pathlib import Path


try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # python-dotenv not installed; rely on system env vars


class Config:
    """Singleton-style configuration namespace."""

    # ─── MT5 Credentials (from .env) ──────────────────────────
    LOGIN_ID: int = int(os.environ.get("MT5_LOGIN_ID", "0"))
    PASSWORD: str = os.environ.get("MT5_PASSWORD", "")
    SERVER: str = os.environ.get("MT5_SERVER", "")

    # ─── Discord ──────────────────────────────────────────────
    WEBHOOK_URL: str = os.environ.get("DISCORD_WEBHOOK_URL", "")
    BOT_TOKEN: str = os.environ.get("DISCORD_BOT_TOKEN", "")
    CHANNEL_ID: int = int(os.environ.get("DISCORD_CHANNEL_ID", "0"))

    # ─── FRED API (macro economic data) ───────────────────────
    FRED_API_KEY: str = os.environ.get("FRED_API_KEY", "")

    # ─── Safety ───────────────────────────────────────────────
    DEMO_ONLY: bool = os.environ.get("DEMO_ONLY", "true").lower() == "true"

    # ─── Risk & Strategy ──────────────────────────────────────
    BASE_RISK_PCT: float = 0.01        # 1% Standard Risk
    GOLD_MAX_RISK_PCT: float = 0.05    # 5% Max Risk for Gold A+
    RISK_REWARD: float = 3.0           # Target 3R
    SL_BUFFER_POINTS: int = 50         # 5 Pip Buffer for SL

    # ─── Hard Risk Limits (kill switches) ─────────────────────
    MAX_DRAWDOWN_PCT: float = 0.10     # 10% max drawdown → halt
    MAX_DAILY_LOSS_PCT: float = 0.05   # 5% daily loss → halt
    MAX_OPEN_PER_SYMBOL: int = 1       # 1 position per symbol max
    MAX_SPREAD_MULT: float = 3.0       # Block if spread > 3× average
    ROLLOVER_START_UTC: int = 22       # Rollover window start (UTC)
    ROLLOVER_END_UTC: int = 23         # Rollover window end (UTC)

    # ─── Confluence & Quality ─────────────────────────────────
    MIN_CONFLUENCE_SCORE: int = 60     # Reject setups below this

    # ─── Performance Tracker ──────────────────────────────────
    PERF_MIN_TRADES: int = 100         # Law of large numbers threshold
    MAX_CONSEC_LOSSES: int = 3         # Consecutive losses → cooldown
    COOLDOWN_MINUTES: int = 30         # Cooldown duration

    # ─── Swing Mode ───────────────────────────────────────────
    SWING_MODE_ENABLED: bool = True    # Enable H4 swing entries
    MACRO_UPDATE_INTERVAL: int = 3600  # Seconds between regime checks

    # ─── Reporting ────────────────────────────────────────────
    PNL_REPORT_HOUR: int = 23          # Hour to send report (0-23)
    TIMEZONE_OFFSET: int = 7           # UTC+7 (Vietnam/Bangkok)

    # ─── Assets & Timeframes ──────────────────────────────────
    ASSETS: list = [
        "XAUUSD", "EURUSD", "GBPUSD",
        "USDJPY", "AUDCAD", "BTCUSD",
    ]

    # ─── Scalping Mode (New) ──────────────────────────────────
    SCALP_MODE: bool = os.environ.get("SCALP_MODE", "false").lower() == "true"

    # NOTE: MT5 Timeframes
    # H1=16385, M15=15, M5=5, M1=1
    
    # Dynamic Timeframes based on Mode
    # Swing (Default): HTF=H1, MED=M15, LTF=M5
    # Scalp:           HTF=M15, MED=M5, LTF=M1
    TF_HTF: int = 15 if SCALP_MODE else 16385
    TF_MED: int = 5 if SCALP_MODE else 15
    TF_LTF: int = 1 if SCALP_MODE else 5

    MAX_RUNTIME_HOURS: float = float(os.environ.get("MAX_RUNTIME_HOURS", "0.0")) # 0 = Infinite

    MAGIC_NUMBER: int = 999003
    DEVIATION: int = 20

    # ─── ZMQ Bridge ───────────────────────────────────────────
    ZMQ_ADDRESS: str = os.environ.get(
        "ZMQ_ADDRESS", "tcp://127.0.0.1:5560"
    )

    # ─── Database (TimescaleDB) ───────────────────────────────
    DB_DSN: str = os.environ.get(
        "TIMESCALE_DSN",
        "postgresql://postgres:postgres@localhost:5432/sentinel"
    )

    # ─── AI Model ─────────────────────────────────────────────
    ONNX_MODEL_PATH: str = os.environ.get(
        "ONNX_MODEL_PATH",
        str(Path(__file__).parent.parent / "ai" / "models" / "trade_scorer.onnx")
    )
    AI_LOOKBACK: int = 50              # Number of candles for feature tensor
    AI_FEATURES: int = 4               # Tensor width

    # ─── Polling ──────────────────────────────────────────────
    ENGINE_POLL_INTERVAL: float = 1.0  # seconds between deal checks
    WATCHDOG_INTERVAL: float = 30.0    # seconds between MT5 health checks

    # ─── Snapshots ────────────────────────────────────────────
    SNAPSHOT_DIR: str = str(Path(__file__).parent.parent / "snapshots")

