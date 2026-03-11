"""
Tests for Metrics Calculator and Strategy Grader.
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from polymarket_sim.analysis.metrics import MetricsCalculator
from polymarket_sim.analysis.strategy_grader import StrategyGrader
from polymarket_sim.core.models import PortfolioSnapshot


class TestMetrics:
    def test_empty_trades(self):
        result = MetricsCalculator.compute([], 1000)
        assert result["sharpe"] == 0.0
        assert result["ev"] == 0.0
        assert result["win_rate"] == 0.0
        assert result["stdev"] == 0.0

    def test_single_trade(self):
        result = MetricsCalculator.compute([10.0], 1000)
        assert result["win_rate"] == 1.0
        assert result["ev"] == 10.0
        assert result["stdev"] == 0.0  # can't compute with n=1
        assert result["sharpe"] == 0.0  # can't compute with n=1

    def test_win_rate(self):
        trades = [10.0, -5.0, 8.0, -3.0, 15.0]
        result = MetricsCalculator.compute(trades, 1000)
        assert result["win_rate"] == pytest.approx(3 / 5)

    def test_all_wins(self):
        trades = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = MetricsCalculator.compute(trades, 1000)
        assert result["win_rate"] == 1.0
        assert result["ev"] == pytest.approx(3.0)

    def test_all_losses(self):
        trades = [-1.0, -2.0, -3.0]
        result = MetricsCalculator.compute(trades, 1000)
        assert result["win_rate"] == 0.0
        assert result["ev"] == pytest.approx(-2.0)

    def test_stdev_sample(self):
        trades = [10.0, 20.0, 30.0]
        result = MetricsCalculator.compute(trades, 1000)
        assert result["stdev"] == pytest.approx(10.0)

    def test_sharpe_nonzero(self):
        # Enough trades with variance → should produce non-zero Sharpe
        trades = [5.0, 3.0, 7.0, 2.0, 6.0]
        result = MetricsCalculator.compute(trades, 1000)
        assert result["sharpe"] != 0.0

    def test_sharpe_zero_variance(self):
        # All same value → std=0 → Sharpe should be 0
        trades = [5.0, 5.0, 5.0, 5.0]
        result = MetricsCalculator.compute(trades, 1000)
        assert result["sharpe"] == 0.0

    def test_individual_helpers(self):
        trades = [10.0, -5.0, 8.0]
        assert MetricsCalculator.win_rate(trades) == pytest.approx(2 / 3)
        assert MetricsCalculator.expected_value(trades) == pytest.approx(13 / 3)
        assert MetricsCalculator.stdev(trades) > 0


class TestStrategyGrader:
    def _make_snapshot(self, **kwargs) -> PortfolioSnapshot:
        defaults = {
            "timestamp": 0.0,
            "bankroll": 1000.0,
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "total_pnl": 0.0,
            "num_trades": 100,
            "win_rate": 0.60,
            "sharpe": 1.5,
            "ev": 3.0,
            "stdev": 2.0,
            "max_drawdown_pct": 8.0,
        }
        defaults.update(kwargs)
        return PortfolioSnapshot(**defaults)

    def test_good_strategy_gets_high_grade(self):
        snap = self._make_snapshot(
            sharpe=2.5, win_rate=0.70, ev=6.0, max_drawdown_pct=3.0
        )
        grade = StrategyGrader.grade(snap)
        assert grade.score >= 80
        assert grade.letter in ("A+", "A")
        assert grade.verdict == "DEPLOY"

    def test_bad_strategy_gets_low_grade(self):
        snap = self._make_snapshot(
            sharpe=-0.5, win_rate=0.30, ev=-2.0, max_drawdown_pct=30.0
        )
        grade = StrategyGrader.grade(snap)
        assert grade.score < 35
        assert grade.letter in ("D", "F")
        assert grade.verdict == "DO NOT USE"

    def test_insufficient_trades(self):
        snap = self._make_snapshot(num_trades=5)
        grade = StrategyGrader.grade(snap)
        assert grade.letter == "?"
        assert grade.verdict == "INSUFFICIENT DATA"
        assert not grade.min_trades_met

    def test_mediocre_strategy(self):
        snap = self._make_snapshot(
            sharpe=0.6, win_rate=0.50, ev=1.0, max_drawdown_pct=12.0
        )
        grade = StrategyGrader.grade(snap)
        assert 35 <= grade.score <= 79
        assert grade.letter in ("B", "C", "D")

    def test_report_format(self):
        snap = self._make_snapshot()
        grade = StrategyGrader.grade(snap)
        report = StrategyGrader.format_report(grade, "Test Strategy")
        assert "STRATEGY REPORT CARD" in report
        assert "Test Strategy" in report
