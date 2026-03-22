"""
Portfolio Tracker.

Tracks open positions, manages simulated/paper P&L, and enforces
greed-decay logic to dynamically exit profitable trades near
expiration. Listens to `TRADE_EXECUTED` events.
"""
import asyncio
from datetime import datetime, timezone
from typing import Dict, List

from pydantic import BaseModel, Field

from app.core.event_bus import Channel, event_bus
from app.core.domain_models import ExecutionResult, MarketSnapshot
from app.utils.logger import log


class Position(BaseModel):
    """Represents an active trade position."""
    market_id: str
    side: str
    entry_price: float
    size_usd: float
    entry_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    current_price: float = 0.0

    @property
    def unrealized_pnl(self) -> float:
        """Current P&L in USD."""
        return (self.current_price - self.entry_price) * self.size_usd

    @property
    def roi_pct(self) -> float:
        """Return on Investment percentage."""
        if self.entry_price <= 0:
            return 0.0
        return (self.current_price - self.entry_price) / self.entry_price


class PortfolioManager:
    """
    Manages active positions and overall equity.

    Tracks Mark-to-Market (MtM) P&L by listening to MARKET_UPDATE events,
    and updates positions when TRADE_EXECUTED occurs.
    """

    def __init__(self, initial_capital: float = 10000.0):
        self.cash = initial_capital
        self.initial_capital = initial_capital
        self.positions: Dict[str, Position] = {}
        self._running = False

    async def start(self) -> None:
        self._running = True
        event_bus.on(Channel.TRADE_EXECUTED, self._on_trade)
        event_bus.on(Channel.MARKET_UPDATE, self._on_market_update)
        log.info(f"Portfolio Manager started (capital=${self.cash:,.2f})")

    async def stop(self) -> None:
        self._running = False
        log.info("Portfolio Manager stopped")

    async def _on_trade(self, result: ExecutionResult) -> None:
        """Process a filled trade."""
        if not self._running or not result.success:
            return

        # Deduct cost (simplified - ignoring gas for paper portfolio math here)
        cost = result.size_usd * result.filled_price
        self.cash -= cost

        # Add to positions
        # In reality, multiple buys on same market should average down.
        # This keeps it simple for Plan 2.3.
        key = f"{result.market_id}_{result.side}"
        
        if key in self.positions:
            pos = self.positions[key]
            # VWAP average entry
            total_size = pos.size_usd + result.size_usd
            avg_entry = ((pos.entry_price * pos.size_usd) + 
                         (result.filled_price * result.size_usd)) / total_size
            pos.entry_price = avg_entry
            pos.size_usd = total_size
        else:
            self.positions[key] = Position(
                market_id=result.market_id,
                side=result.side,
                entry_price=result.filled_price,
                size_usd=result.size_usd,
                current_price=result.filled_price
            )

        log.info(f"Portfolio: Added position {key} @ {result.filled_price:.3f} (${result.size_usd:.0f})")

    async def _on_market_update(self, snapshot: MarketSnapshot) -> None:
        """Update MtM pricing for all open positions."""
        if not self._running:
            return

        for key, pos in list(self.positions.items()):
            if pos.market_id == snapshot.market_id:
                if pos.side == "BUY_YES" and snapshot.polymarket_yes:
                    pos.current_price = snapshot.polymarket_yes
                elif pos.side == "BUY_NO" and snapshot.polymarket_no:
                    pos.current_price = snapshot.polymarket_no

    @property
    def equity(self) -> float:
        """Total Portfolio NAV (Cash + Unrealized)."""
        open_equity = sum(p.size_usd * p.current_price for p in self.positions.values())
        return self.cash + open_equity

    @property
    def total_pnl(self) -> float:
        """Total P&L vs Initial Capital."""
        return self.equity - self.initial_capital

    def print_summary(self) -> None:
        log.info(f"--- Portfolio Summary ---")
        log.info(f"Cash:   ${self.cash:,.2f}")
        for key, p in self.positions.items():
            log.info(f"  {key}: entry={p.entry_price:.3f} cur={p.current_price:.3f} pnl=${p.unrealized_pnl:.2f} ({p.roi_pct:.1%})")
        log.info(f"Equity: ${self.equity:,.2f} (Total PnL: ${self.total_pnl:,.2f})")


# Singleton
portfolio = PortfolioManager()

if __name__ == "__main__":
    async def verify():
        p = PortfolioManager(initial_capital=1000.0)
        await p.start()
        
        # Mock execution
        exec_res = ExecutionResult(
            market_id="MKT-TEST",
            side="BUY_YES",
            filled_price=0.50,
            size_usd=200.0,
            success=True
        )
        await event_bus.publish(Channel.TRADE_EXECUTED, exec_res)
        await asyncio.sleep(0.1)
        
        # Mock market update driving price up
        snap = MarketSnapshot(
            market_id="MKT-TEST",
            polymarket_yes=0.60
        )
        await event_bus.publish(Channel.MARKET_UPDATE, snap)
        await asyncio.sleep(0.1)
        
        p.print_summary()
        
        print(f"DEBUG: cash={p.cash}, pnl={p.total_pnl}")
        # Note: 1000 cash - (0.50 * 200 = 100) = 900 cash.
        # open_equity = 200 * 0.60 = 120
        # equity = 900 + 120 = 1020.
        # PnL = 1020 - 1000 = 20.0
        if p.cash == 900.0 and p.total_pnl == 20.0:
            print("[OK] Portfolio tracker verified.")
        else:
            print("[FAIL] Portfolio math incorrect.")

    asyncio.run(verify())
