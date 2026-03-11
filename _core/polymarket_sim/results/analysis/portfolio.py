"""
Polymarket Paper Trading Simulator — Portfolio Tracker
Position management, PnL calculation, and trade history.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional

from ..core.models import Fill, OrderSide, Position, PortfolioSnapshot
from ..core import config

logger = logging.getLogger(__name__)


class Portfolio:
    """
    Tracks virtual positions, realized / unrealized PnL, and trade history.
    """

    def __init__(self, bankroll: float = config.DEFAULT_BANKROLL):
        self.initial_bankroll = bankroll
        self.bankroll = bankroll
        self._positions: Dict[str, Position] = {}
        self._trade_pnls: List[float] = []       # PnL per closed trade
        self._all_fills: List[Fill] = []
        self._peak_equity: float = bankroll
        self._max_drawdown_pct: float = 0.0

    # ── Fill Processing ───────────────────────────────────────

    def record_fill(self, fill: Fill):
        """
        Process a fill — open / add-to / close position.

        Binary market logic:
        - BUY at price P → cost = P per share, payout = $1 if win
        - SELL (close) at price P → receive P per share
        - PnL on close = (sell_price - avg_entry) × size
        """
        self._all_fills.append(fill)
        token = fill.token_id
        fee_per_share = self._compute_fee(fill)

        if token not in self._positions:
            # Open new position
            self._positions[token] = Position(
                token_id=token,
                side=fill.side,
                avg_entry=fill.price,
                size=fill.size,
            )
            # Deduct cost from bankroll + dynamic spread fee
            fee = fee_per_share * fill.size
            cost = (fill.price * fill.size) + fee
            self.bankroll -= cost
            logger.info(
                "📈 OPEN %s: %.0f @ %.4f (cost $%.2f [fee $%.4f/sh], spread %.4f, bankroll $%.2f)",
                token, fill.size, fill.price, cost, fee_per_share, fill.spread_at_fill, self.bankroll,
            )
            return

        pos = self._positions[token]

        if fill.side == pos.side:
            # Add to existing position (average up/down)
            total_cost_basis = pos.avg_entry * pos.size + fill.price * fill.size
            pos.size += fill.size
            pos.avg_entry = total_cost_basis / pos.size

            fee = fee_per_share * fill.size
            cost = (fill.price * fill.size) + fee
            self.bankroll -= cost
            logger.info(
                "📈 ADD %s: +%.0f @ %.4f (avg %.4f, fee $%.4f/sh, bankroll $%.2f)",
                token, fill.size, fill.price, pos.avg_entry, fee_per_share, self.bankroll,
            )
        else:
            # Closing / reducing position
            close_size = min(fill.size, pos.size)
            fee = fee_per_share * close_size

            gross_pnl = (fill.price - pos.avg_entry) * close_size
            if pos.side == OrderSide.SELL:
                gross_pnl = -gross_pnl

            net_pnl = gross_pnl - fee

            pos.realized_pnl += net_pnl
            pos.size -= close_size
            self._trade_pnls.append(net_pnl)

            # Proceeds = (Price * Size) - Fee
            proceeds = (fill.price * close_size) - fee
            self.bankroll += proceeds

            logger.info(
                "📉 CLOSE %s: %.0f @ %.4f (PnL $%.2f [fee $%.4f/sh], spread %.4f, bankroll $%.2f)",
                token, close_size, fill.price, net_pnl, fee_per_share, fill.spread_at_fill, self.bankroll,
            )

            if pos.size <= 0:
                del self._positions[token]

        self._update_drawdown()

    def _compute_fee(self, fill) -> float:
        """
        Compute per-share fee using the dynamic spread cost model.

        Dynamic: fee = max(half_spread, MIN_SPREAD_COST)
        Flat:    fee = FLAT_FEE_PER_SHARE (legacy)
        """
        if config.SPREAD_COST_MODEL == "dynamic" and fill.spread_at_fill > 0:
            half_spread = fill.spread_at_fill / 2.0
            return max(half_spread, config.MIN_SPREAD_COST)
        return config.FLAT_FEE_PER_SHARE

    # ── Mark-to-Market ────────────────────────────────────────

    def mark_to_market(self, token_id: str, mid_price: float):
        """Update unrealized PnL for a position."""
        if token_id not in self._positions:
            return
        pos = self._positions[token_id]
        if pos.side == OrderSide.BUY:
            pos.unrealized_pnl = (mid_price - pos.avg_entry) * pos.size
        else:
            pos.unrealized_pnl = (pos.avg_entry - mid_price) * pos.size

    def close_position(self, token_id: str, settle_price: float):
        """
        Close a position at a given price (for window settlement).
        Realizes PnL and returns capital to bankroll.
        """
        pos = self._positions.get(token_id)
        if pos is None:
            return
        
        # Calculate PnL
        if pos.side == OrderSide.BUY:
            net_pnl = (settle_price - pos.avg_entry) * pos.size
        else:
            net_pnl = (pos.avg_entry - settle_price) * pos.size
        
        pos.realized_pnl += net_pnl
        self._trade_pnls.append(net_pnl)
        
        # Return capital: cost basis + profit
        final_value = (pos.avg_entry * pos.size) + net_pnl
        self.bankroll += final_value
        
        logger.info(
            "Closed position [%s]: %.0f @ %.4f -> PnL: $%.2f",
            token_id[:12], pos.size, settle_price, net_pnl
        )
        
        del self._positions[token_id]
        self._update_drawdown()

    # -- Settlement ----------------------------------------

    def settle_positions(self, winning_outcome: str, outcomes: List[str], token_ids: List[str]):
        """
        Settle all open positions based on market resolution.
        - Winning outcome token (LONG) → $1.00
        - Losing outcome token (LONG) → $0.00
        - Short positions handle opposite logic.
        """
        if not self._positions:
            return

        logger.info("⚖️ Settling positions for winner: '%s'", winning_outcome)
        
        # Snapshot keys because we delete as we go
        active_tokens = list(self._positions.keys())

        for tid in active_tokens:
            if tid not in self._positions: continue
            pos = self._positions[tid]
            
            # Identify outcome name for this token
            idx = token_ids.index(tid) if tid in token_ids else -1
            outcome_name = outcomes[idx] if 0 <= idx < len(outcomes) else "Unknown"

            # Determine payout per share
            is_winner = (outcome_name.lower() == winning_outcome.lower())
            
            if pos.side == OrderSide.BUY:
                payout_price = 1.0 if is_winner else 0.0
            else:
                # Short: pay 1.0 if winner (loss), pay 0.0 if loser (profit)
                # PnL = Entry - Payout
                payout_price = 1.0 if is_winner else 0.0

            # Calculate Final PnL
            # Long: (Payout - Entry) * Size
            # Short: (Entry - Payout) * Size
            if pos.side == OrderSide.BUY:
                gross_pnl = (payout_price - pos.avg_entry) * pos.size
            else:
                gross_pnl = (pos.avg_entry - payout_price) * pos.size

            # No fee on settlement (exchange covers it, or already paid on exit)
            # Actually, simulated fee usually applies to TRADES. Settlement is administrative.
            # Let's assume NO fee for settlement to be generous, or add it if desired.
            # config.SIMULATED_FEE refers to "trading" fee. Settlement is free on PM.
            
            net_pnl = gross_pnl
            pos.realized_pnl += net_pnl
            self._trade_pnls.append(net_pnl)

            # Return principal + profit (or strictly payout)
            # Bankroll += Payout * Size (for Long)
            # Short logic is complex: Margin was locked. 
            # Simplified: Bankroll += (Entry + PnL) * Size? 
            # Let's use the payout math:
            # Value = Payout * Size. 
            # For Short, you sold at Entry. You buy back at Payout.
            # Profit = Entry - Payout.
            # You already received proceeds on Open (if using margin model). 
            # Our model deducts cost on Open. 
            # LONG: Cost = Price. Return = 1 or 0.
            # SHORT: Cost = 1 - Price (Collat). Return = 1 (if win) or 0 (if loss)? 
            # HOLD ON. Polymarket shorts are "Mint/Merge" or "Sell pre-owned".
            # Engine simplifies SHORT as "Sell" with valid price.
            # Let's stick to PnL delta addition for safety.
            
            pnl_change = net_pnl + (pos.avg_entry * pos.size) # This is strictly "Market Value" logic?
            # Simpler: We marked-to-market along the way.
            # Realized PnL is what matters.
            # Bankroll should increase by the FINAL VALUE of the position.
            
            # LONG value = 1.0 or 0.0
            # SHORT value = (1 - Payout)? No.
            
            # Let's use robust delta:
            # We already paid cost. 
            # We add (Cost + NetPnL) back to bankroll?
            # YES.
            
            final_value = (pos.avg_entry * pos.size) + net_pnl
            self.bankroll += final_value
            
            logger.info(
                "🏁 SETTLE %s (%s): %s at $%.2f (PnL $%.2f, Bankroll $%.2f)",
                outcome_name, pos.side.value, 
                "WON" if is_winner else "LOST", 
                payout_price, net_pnl, self.bankroll 
            )

            del self._positions[tid]

        self._update_drawdown()

    def _update_drawdown(self):
        """Track maximum drawdown percentage."""
        equity = self.total_equity
        if equity > self._peak_equity:
            self._peak_equity = equity
        if self._peak_equity > 0:
            dd = (self._peak_equity - equity) / self._peak_equity * 100.0
            self._max_drawdown_pct = max(self._max_drawdown_pct, dd)

    # ── Aggregate Metrics ─────────────────────────────────────

    @property
    def realized_pnl(self) -> float:
        return sum(p.realized_pnl for p in self._positions.values()) + sum(self._trade_pnls)

    @property
    def unrealized_pnl(self) -> float:
        return sum(p.unrealized_pnl for p in self._positions.values())

    @property
    def total_pnl(self) -> float:
        return self.realized_pnl + self.unrealized_pnl

    @property
    def total_equity(self) -> float:
        return self.bankroll + self.unrealized_pnl

    @property
    def num_trades(self) -> int:
        return len(self._trade_pnls)

    @property
    def trade_pnls(self) -> List[float]:
        return list(self._trade_pnls)

    @property
    def max_drawdown_pct(self) -> float:
        return self._max_drawdown_pct

    @property
    def positions(self) -> Dict[str, Position]:
        return dict(self._positions)

    # ── Snapshot ──────────────────────────────────────────────

    def snapshot(self) -> PortfolioSnapshot:
        """Create a PortfolioSnapshot with current metrics."""
        from .metrics import MetricsCalculator

        metrics = MetricsCalculator.compute(self._trade_pnls, self.initial_bankroll)

        return PortfolioSnapshot(
            timestamp=time.time(),
            bankroll=self.bankroll,
            realized_pnl=self.realized_pnl,
            unrealized_pnl=self.unrealized_pnl,
            total_pnl=self.total_pnl,
            num_trades=self.num_trades,
            win_rate=metrics["win_rate"],
            sharpe=metrics["sharpe"],
            ev=metrics["ev"],
            stdev=metrics["stdev"],
            max_drawdown_pct=self._max_drawdown_pct,
        )
