"""
3D Risk Management Matrix (Triple Gate System).

Every order must pass ALL three gates before execution:
  Gate A — Exposure Gate (max portfolio capital at risk)
  Gate B — Liquidity Gate (min orderbook depth requirement)
  Gate C — Conviction Gate (position size capped by win probability tier)

Mathematical Reference (math.md §6):
  Gate 1: Exposure_Global ≤ 30%
  Gate 2: Exposure_Temporal ≤ 15%
  Gate 3: Size_Conviction ∈ [1.5%, 5%]
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from app.utils.config import config_manager
from app.utils.logger import log


# ─── Gate Result Models ───

class GateResult(BaseModel):
    """Result of a single risk gate check."""
    gate_name: str
    passed: bool
    value: float = 0.0
    limit: float = 0.0
    reason: str = ""


class RiskVerdict(BaseModel):
    """Aggregate result of all risk gate checks."""
    approved: bool = False
    gates: List[GateResult] = []
    rejection_reason: Optional[str] = None
    suggested_size_pct: float = 0.0

    @property
    def summary(self) -> str:
        status = "APPROVED" if self.approved else "REJECTED"
        failed = [g for g in self.gates if not g.passed]
        if failed:
            return f"{status}: {failed[0].reason}"
        return status


# Conviction Tier Mapping is now handled via config_manager.risk.conviction_tiers
# Default mapping provided in config.py: {0.6: 0.10, 0.7: 0.15, 0.8: 0.25}


def get_conviction_cap(win_prob: float) -> float:
    """Get maximum position size based on win probability tier from config."""
    tiers = config_manager.risk.conviction_tiers
    # Sort tiers by threshold descending to find the highest applicable
    sorted_thresholds = sorted(tiers.keys(), reverse=True)
    for threshold in sorted_thresholds:
        if win_prob >= threshold:
            return tiers[threshold]
    return 0.015  # Default conservative floor


class RiskManager:
    """
    Triple-gate risk manager for Polymarket execution.

    Usage:
        rm = RiskManager()
        verdict = rm.check_order(signal_prob=0.65, size_pct=0.03,
                                  liquidity_usd=2000, market_price=0.55)
        if verdict.approved:
            execute_trade()
    """

    def __init__(
        self,
        max_global_exposure: Optional[float] = None,
        max_temporal_exposure: Optional[float] = None,
        min_liquidity_usd: Optional[float] = None,
        max_trades_per_hour: int = 10,
    ):
        self.max_global_exposure = max_global_exposure or config_manager.risk.max_global_exposure_pct
        self.max_temporal_exposure = max_temporal_exposure or config_manager.risk.max_temporal_exposure_pct
        self.min_liquidity_usd = min_liquidity_usd or config_manager.risk.min_liquidity_usd
        self.max_trades_per_hour = max_trades_per_hour

        # State
        self.current_exposure: float = 0.0
        self.window_exposure: float = 0.0
        self.recent_trades: List[datetime] = []
        self.positions: Dict[str, float] = {}  # market_id -> exposure_pct

    def check_order(
        self,
        signal_prob: float,
        size_pct: float,
        liquidity_usd: float,
        market_price: float,
        market_id: str = "",
    ) -> RiskVerdict:
        """
        Run all three risk gates on a proposed order.

        Args:
            signal_prob: Model's fair probability (0-1)
            size_pct: Proposed position size as fraction of portfolio
            liquidity_usd: Available orderbook liquidity in USD
            market_price: Current YES token price
            market_id: Market identifier for position tracking

        Returns:
            RiskVerdict with gate-by-gate results
        """
        gates: List[GateResult] = []

        # ── Gate A: Global Exposure ──
        new_exposure = self.current_exposure + size_pct
        gate_a = GateResult(
            gate_name="Exposure Gate",
            passed=new_exposure <= self.max_global_exposure,
            value=new_exposure,
            limit=self.max_global_exposure,
            reason=f"Global exposure {new_exposure:.1%} exceeds {self.max_global_exposure:.0%} limit"
            if new_exposure > self.max_global_exposure else "",
        )
        gates.append(gate_a)

        # ── Gate B: Liquidity Gate ──
        gate_b = GateResult(
            gate_name="Liquidity Gate",
            passed=liquidity_usd >= self.min_liquidity_usd,
            value=liquidity_usd,
            limit=self.min_liquidity_usd,
            reason=f"Liquidity ${liquidity_usd:.0f} below ${self.min_liquidity_usd:.0f} minimum"
            if liquidity_usd < self.min_liquidity_usd else "",
        )
        gates.append(gate_b)

        # ── Gate C: Conviction Gate ──
        conviction_cap = get_conviction_cap(signal_prob)
        gate_c = GateResult(
            gate_name="Conviction Gate",
            passed=size_pct <= conviction_cap,
            value=size_pct,
            limit=conviction_cap,
            reason=f"Size {size_pct:.1%} exceeds {conviction_cap:.1%} cap for P={signal_prob:.2f}"
            if size_pct > conviction_cap else "",
        )
        gates.append(gate_c)

        # ── Temporal density check (soft gate) ──
        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)
        self.recent_trades = [t for t in self.recent_trades if t > hour_ago]
        if len(self.recent_trades) >= self.max_trades_per_hour:
            gate_temporal = GateResult(
                gate_name="Temporal Density",
                passed=False,
                value=float(len(self.recent_trades)),
                limit=float(self.max_trades_per_hour),
                reason=f"Rate limit: {len(self.recent_trades)} trades in last hour",
            )
            gates.append(gate_temporal)

        # ── Verdict ──
        all_passed = all(g.passed for g in gates)
        first_failure = next((g for g in gates if not g.passed), None)

        verdict = RiskVerdict(
            approved=all_passed,
            gates=gates,
            rejection_reason=first_failure.reason if first_failure else None,
            suggested_size_pct=min(size_pct, conviction_cap) if all_passed else 0.0,
        )

        if not all_passed:
            log.warning(f"Risk REJECTED: {verdict.rejection_reason}")
        else:
            log.info(f"Risk APPROVED: {size_pct:.1%} at P={signal_prob:.2f}")

        return verdict

    def record_fill(self, market_id: str, size_pct: float) -> None:
        """Record a filled trade for exposure tracking."""
        self.current_exposure += size_pct
        self.positions[market_id] = self.positions.get(market_id, 0.0) + size_pct
        self.recent_trades.append(datetime.now(timezone.utc))
        log.info(f"Exposure updated: {self.current_exposure:.1%} "
                 f"(+{size_pct:.1%} on {market_id})")

    def release_exposure(self, market_id: str, size_pct: float) -> None:
        """Release exposure when a position is closed or expired."""
        self.current_exposure = max(0.0, self.current_exposure - size_pct)
        if market_id in self.positions:
            self.positions[market_id] = max(0.0, self.positions[market_id] - size_pct)
        log.info(f"Exposure released: {self.current_exposure:.1%} "
                 f"(-{size_pct:.1%} on {market_id})")

    def reset(self) -> None:
        """Full state reset (used on startup reconciliation)."""
        self.current_exposure = 0.0
        self.window_exposure = 0.0
        self.positions.clear()
        self.recent_trades.clear()
        log.warning("RiskManager state fully reset")


# ─── Module-level singleton ───
risk_engine = RiskManager()
