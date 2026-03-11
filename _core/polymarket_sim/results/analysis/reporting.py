"""
Polymarket Paper Trading Simulator — Session Reporting
Generates JSON reports at the end of each market cycle for historical analysis.
"""

import json
import logging
import os
import time
from dataclasses import asdict
from typing import Dict, List, Any

from ..core import config
from ..core.models import PortfolioSnapshot

logger = logging.getLogger(__name__)


class SessionReporter:
    """
    Saves session results (market cycle Performance) to disk.
    """

    @staticmethod
    def save_cycle_report(
        session_id: int,
        market_slug: str,
        market_title: str,
        winning_outcome: str,
        start_time: float,
        end_time: float,
        final_snapshot: PortfolioSnapshot,
        trade_history: List[Dict[str, Any]],
    ) -> str:
        """
        Save a JSON report for the completed market cycle.
        Returns: Path to the saved file.
        """
        # Ensure directory exists
        report_dir = os.path.join(config.DATA_DIR, "sessions")
        os.makedirs(report_dir, exist_ok=True)

        duration = end_time - start_time
        
        # Build report structure
        report = {
            "session_id": session_id,
            "timestamp": time.time(),
            "market": {
                "slug": market_slug,
                "title": market_title,
                "resolution": winning_outcome
            },
            "duration_seconds": duration,
            "performance": {
                "bankroll_start": 0.0, # Not strictly tracked here, but inferable?
                "bankroll_end": final_snapshot.bankroll,
                "total_pnl": final_snapshot.total_pnl,
                "roi_pct": 0.0, # TODO: Track starting bankroll per cycle if needed
                "num_trades": final_snapshot.num_trades,
                "win_rate": final_snapshot.win_rate,
                "sharpe": final_snapshot.sharpe,
                "ev_per_trade": final_snapshot.ev,
                "max_drawdown": final_snapshot.max_drawdown_pct,
            },
            "trades": trade_history[-final_snapshot.num_trades:] if final_snapshot.num_trades > 0 else []
            # Note: trade_history might be huge. Maybe limit it?
        }

        # Filename: session_{id}_{slug}_{timestamp}.json
        safe_slug = "".join([c if c.isalnum() else "_" for c in market_slug])
        filename = f"session_{session_id}_{safe_slug}_{int(end_time)}.json"
        filepath = os.path.join(report_dir, filename)

        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, default=str)
            logger.info("📄 Saved session report: %s", filepath)
            return filepath
        except Exception as e:
            logger.error("❌ Failed to save session report: %s", e)
            return ""
