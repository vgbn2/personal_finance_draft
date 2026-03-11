"""
Polymarket Paper Trading Simulator — Strategy Grader
Rates a strategy's viability based on live performance metrics.
Gives a letter grade (A+ through F) and a deploy / monitor / avoid verdict.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from ..core import config
from ..core.models import PortfolioSnapshot, StrategyGrade

logger = logging.getLogger(__name__)


class StrategyGrader:
    """
    Evaluates a strategy's real-time performance and assigns a letter grade.

    Grading dimensions (configurable weights in config.py):
        - Sharpe Ratio  (35%) — risk-adjusted returns
        - Win Rate      (25%) — consistency
        - EV per Trade  (25%) — edge magnitude
        - Max Drawdown  (15%) — risk control (inverted: lower is better)

    Letter scale:
        A+  (90-100)  →  DEPLOY   — Strategy is production-viable
        A   (80-89)   →  DEPLOY   — Strong performer
        B   (65-79)   →  MONITOR  — Promising, needs more data
        C   (50-64)   →  MONITOR  — Marginal, watch closely
        D   (35-49)   →  DO NOT USE — Underperforming
        F   (0-34)    →  DO NOT USE — Dangerous, likely losing money

    Minimum trades threshold: Grade is marked as "INSUFFICIENT DATA" until
    the strategy has completed at least config.GRADE_THRESHOLDS["min_trades"] trades.
    """

    @staticmethod
    def grade(snapshot: PortfolioSnapshot) -> StrategyGrade:
        """
        Grade a strategy based on its current PortfolioSnapshot.

        Returns:
            StrategyGrade with letter, score, sub-scores, verdict, and reason.
        """
        thresholds = config.GRADE_THRESHOLDS
        weights = config.GRADE_WEIGHTS
        min_trades = thresholds["min_trades"]
        min_trades_met = snapshot.num_trades >= min_trades

        # ── Score each dimension (0-100) ─────────────────────

        sharpe_score = StrategyGrader._score_metric(
            snapshot.sharpe,
            thresholds["sharpe"]["acceptable"],
            thresholds["sharpe"]["good"],
            thresholds["sharpe"]["excellent"],
        )

        win_rate_score = StrategyGrader._score_metric(
            snapshot.win_rate,
            thresholds["win_rate"]["acceptable"],
            thresholds["win_rate"]["good"],
            thresholds["win_rate"]["excellent"],
        )

        ev_score = StrategyGrader._score_metric(
            snapshot.ev,
            thresholds["ev_per_trade"]["acceptable"],
            thresholds["ev_per_trade"]["good"],
            thresholds["ev_per_trade"]["excellent"],
        )

        # Drawdown is inverted — lower is better
        drawdown_score = StrategyGrader._score_metric_inverted(
            snapshot.max_drawdown_pct,
            thresholds["max_drawdown_pct"]["acceptable"],   # 20% → low bar
            thresholds["max_drawdown_pct"]["good"],          # 10% → mid bar
            thresholds["max_drawdown_pct"]["excellent"],     # 5%  → high bar
        )

        # ── Weighted composite score ─────────────────────────

        composite = (
            sharpe_score * weights["sharpe"]
            + win_rate_score * weights["win_rate"]
            + ev_score * weights["ev_per_trade"]
            + drawdown_score * weights["max_drawdown_pct"]
        )

        # ── Letter grade + verdict ───────────────────────────

        letter, verdict = StrategyGrader._letter_and_verdict(composite, min_trades_met)

        # ── Build reason string ──────────────────────────────

        if not min_trades_met:
            reason = (
                f"Only {snapshot.num_trades}/{min_trades} trades completed. "
                f"Need more data before grade is meaningful."
            )
        elif composite >= 80:
            reason = (
                f"Strong performance across all metrics. "
                f"Sharpe {snapshot.sharpe:.2f}, WR {snapshot.win_rate:.1%}, "
                f"EV ${snapshot.ev:.2f}/trade, MaxDD {snapshot.max_drawdown_pct:.1f}%."
            )
        elif composite >= 50:
            weak_areas = []
            if sharpe_score < 50:
                weak_areas.append(f"Sharpe ({snapshot.sharpe:.2f})")
            if win_rate_score < 50:
                weak_areas.append(f"Win Rate ({snapshot.win_rate:.1%})")
            if ev_score < 50:
                weak_areas.append(f"EV (${snapshot.ev:.2f})")
            if drawdown_score < 50:
                weak_areas.append(f"Drawdown ({snapshot.max_drawdown_pct:.1f}%)")
            reason = f"Needs improvement in: {', '.join(weak_areas) if weak_areas else 'overall consistency'}."
        else:
            reason = (
                f"Strategy is underperforming. "
                f"PnL ${snapshot.total_pnl:.2f}, WR {snapshot.win_rate:.1%}. "
                f"Consider stopping or redesigning."
            )

        grade = StrategyGrade(
            letter=letter,
            score=round(composite, 1),
            sharpe_score=round(sharpe_score, 1),
            win_rate_score=round(win_rate_score, 1),
            ev_score=round(ev_score, 1),
            drawdown_score=round(drawdown_score, 1),
            verdict=verdict,
            reason=reason,
            min_trades_met=min_trades_met,
        )

        logger.info(
            "📊 Strategy Grade: %s (%.1f/100) — %s",
            grade.letter, grade.score, grade.verdict,
        )

        return grade

    # ── Scoring Helpers ───────────────────────────────────────

    @staticmethod
    def _score_metric(value: float, low: float, mid: float, high: float) -> float:
        """
        Score a metric on 0-100 scale. Higher value = better.
            < low  → 0-33
            low–mid → 33-66
            mid–high → 66-90
            ≥ high  → 90-100
        """
        if value <= 0:
            return max(0.0, 10.0 + value * 5)  # negative values penalised
        if value < low:
            return 10 + (value / low) * 23
        if value < mid:
            return 33 + ((value - low) / (mid - low)) * 33
        if value < high:
            return 66 + ((value - mid) / (high - mid)) * 24
        return min(100.0, 90 + (value - high) / high * 10)

    @staticmethod
    def _score_metric_inverted(value: float, high_bad: float, mid: float, low_good: float) -> float:
        """
        Score a metric where LOWER is better (e.g., max drawdown).
            ≤ low_good  → 90-100
            low_good–mid → 66-90
            mid–high_bad → 33-66
            > high_bad   → 0-33
        """
        if value <= low_good:
            return 95.0
        if value <= mid:
            return 90 - ((value - low_good) / (mid - low_good)) * 24
        if value <= high_bad:
            return 66 - ((value - mid) / (high_bad - mid)) * 33
        # Worse than threshold
        return max(0.0, 33 - (value - high_bad) / high_bad * 33)

    @staticmethod
    def _letter_and_verdict(score: float, min_trades_met: bool) -> tuple[str, str]:
        """Map composite score to letter grade and verdict."""
        if not min_trades_met:
            return ("?", "INSUFFICIENT DATA")

        if score >= 90:
            return ("A+", "DEPLOY")
        if score >= 80:
            return ("A", "DEPLOY")
        if score >= 65:
            return ("B", "MONITOR")
        if score >= 50:
            return ("C", "MONITOR")
        if score >= 35:
            return ("D", "DO NOT USE")
        return ("F", "DO NOT USE")

    # ── Pretty Print ─────────────────────────────────────────

    @staticmethod
    def format_report(grade: StrategyGrade, strategy_name: str = "") -> str:
        """Format a human-readable strategy report card."""
        lines = [
            "",
            "╔══════════════════════════════════════════════════════╗",
            "║           📊  STRATEGY REPORT CARD  📊              ║",
            "╠══════════════════════════════════════════════════════╣",
        ]
        if strategy_name:
            lines.append(f"║  Strategy :  {strategy_name:<39}║")

        verdict_icon = {"DEPLOY": "✅", "MONITOR": "👀", "DO NOT USE": "🚫", "INSUFFICIENT DATA": "⏳"}
        icon = verdict_icon.get(grade.verdict, "❓")

        lines.extend([
            f"║  Grade    :  {grade.letter:<3}  ({grade.score:.0f}/100)                        ║",
            f"║  Verdict  :  {icon} {grade.verdict:<36}║",
            "╠══════════════════════════════════════════════════════╣",
            f"║  Sharpe      :  {grade.sharpe_score:5.1f}/100                         ║",
            f"║  Win Rate    :  {grade.win_rate_score:5.1f}/100                         ║",
            f"║  EV/Trade    :  {grade.ev_score:5.1f}/100                         ║",
            f"║  Drawdown    :  {grade.drawdown_score:5.1f}/100                         ║",
            "╠══════════════════════════════════════════════════════╣",
            f"║  {grade.reason:<52}║",
            "╚══════════════════════════════════════════════════════╝",
            "",
        ])
        return "\n".join(lines)
