"""
Sentinel-MT5 — Chart Snapshot Generator
=========================================
Creates a candlestick PNG at the moment of trade execution,
annotated with entry/SL/TP lines and AI confidence score.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # headless backend
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import pandas as pd

import MetaTrader5 as mt5

from core.config import Config

log = logging.getLogger("sentinel.chart")


def generate_snapshot(
    symbol: str,
    action: str,
    entry: float,
    sl: float,
    tp: float,
    ai_score: float,
    timeframe: int = Config.TF_MED,
    bars: int = 80,
    save_disk: bool = True,
) -> io.BytesIO:
    """
    Generate an annotated candlestick chart for a trade signal.

    Parameters
    ----------
    symbol : str      e.g. "XAUUSD"
    action : str      "BUY" or "SELL"
    entry, sl, tp : float
    ai_score : float  0.0–1.0
    timeframe : int   MT5 timeframe constant
    bars : int        Number of candles to display
    save_disk : bool  Also save to Config.SNAPSHOT_DIR

    Returns
    -------
    io.BytesIO
        PNG image buffer ready for Discord upload.
    """
    # ── Fetch candle data ─────────────────────────────────────
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, bars)
    if rates is None or len(rates) < 10:
        log.warning("Not enough data for %s snapshot", symbol)
        return _placeholder_chart(symbol, action, ai_score)

    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s")
    df.set_index("time", inplace=True)

    # ── Plot ──────────────────────────────────────────────────
    fig, (ax_price, ax_vol) = plt.subplots(
        2, 1,
        figsize=(12, 7),
        gridspec_kw={"height_ratios": [3, 1]},
        sharex=True,
    )
    fig.patch.set_facecolor("#0d1117")

    # Candlestick body (simplified OHLC bar chart)
    colors = [
        "#26a69a" if c >= o else "#ef5350"
        for o, c in zip(df["open"], df["close"])
    ]
    ax_price.bar(
        df.index, df["close"] - df["open"],
        bottom=df["open"], color=colors, width=0.0005, zorder=2,
    )
    # Wicks
    ax_price.vlines(
        df.index, df["low"], df["high"],
        colors=colors, linewidth=0.6, zorder=1,
    )

    # ── Overlay entry / SL / TP ───────────────────────────────
    ax_price.axhline(entry, color="#00e5ff", linestyle="--", linewidth=1.2, label=f"Entry {entry}")
    ax_price.axhline(sl, color="#ff1744", linestyle="--", linewidth=1.0, label=f"SL {sl}")
    ax_price.axhline(tp, color="#00e676", linestyle="--", linewidth=1.0, label=f"TP {tp}")

    # ── Styling ───────────────────────────────────────────────
    confidence_pct = ai_score * 100
    color_conf = "#00e676" if confidence_pct >= 70 else "#ffc107" if confidence_pct >= 40 else "#ff1744"

    ax_price.set_title(
        f"  {symbol}  │  {action}  │  AI: {confidence_pct:.0f}%",
        fontsize=14,
        fontweight="bold",
        color="white",
        loc="left",
    )
    ax_price.set_facecolor("#0d1117")
    ax_price.tick_params(colors="white")
    ax_price.yaxis.label.set_color("white")
    ax_price.legend(loc="upper left", fontsize=8, facecolor="#161b22", edgecolor="#30363d", labelcolor="white")

    # Volume bars
    vol_colors = ["#26a69a80" if c >= o else "#ef535080" for o, c in zip(df["open"], df["close"])]
    ax_vol.bar(df.index, df["tick_volume"], color=vol_colors, width=0.0005)
    ax_vol.set_facecolor("#0d1117")
    ax_vol.tick_params(colors="white")
    ax_vol.set_ylabel("Vol", color="white", fontsize=9)

    # AI confidence badge
    fig.text(
        0.97, 0.96,
        f"🧠 {confidence_pct:.0f}%",
        fontsize=16,
        fontweight="bold",
        color=color_conf,
        ha="right",
        va="top",
        transform=fig.transFigure,
        bbox=dict(boxstyle="round,pad=0.3", facecolor="#161b22", edgecolor=color_conf, alpha=0.9),
    )

    fig.autofmt_xdate()
    plt.tight_layout()

    # ── Export ─────────────────────────────────────────────────
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight", facecolor=fig.get_facecolor())
    buf.seek(0)

    if save_disk:
        snap_dir = Path(Config.SNAPSHOT_DIR)
        snap_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        path = snap_dir / f"{symbol}_{action}_{ts}.png"
        with open(path, "wb") as f:
            f.write(buf.getvalue())
        log.info("Snapshot saved: %s", path)

    plt.close(fig)
    return buf


def _placeholder_chart(symbol: str, action: str, ai_score: float) -> io.BytesIO:
    """Minimal fallback chart when candle data is unavailable."""
    fig, ax = plt.subplots(figsize=(6, 3))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#0d1117")
    ax.text(
        0.5, 0.5,
        f"{symbol} {action}\nAI: {ai_score*100:.0f}%\n(No chart data)",
        ha="center", va="center", fontsize=14, color="white",
        transform=ax.transAxes,
    )
    ax.set_xticks([])
    ax.set_yticks([])
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=80, facecolor=fig.get_facecolor())
    buf.seek(0)
    plt.close(fig)
    return buf
