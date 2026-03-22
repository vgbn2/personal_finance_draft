"""
Market Replay Backtesting Engine.

Replays historical ticks (from Parquet or in-memory DataFrame) through
a strategy, executing signals against a simulated broker. No live
WebSocket connections needed — pure offline evaluation.

Usage:
    engine = BacktestEngine(strategy=my_strategy, broker=SimulatedBroker())
    report = engine.run(data)
    print(report.sharpe_ratio)
"""
import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Protocol

from app.utils.logger import log


# ─── Protocols ───

class StrategyProtocol(Protocol):
    """Interface that any strategy must implement for backtesting."""
    def on_tick(self, row: pd.Series) -> Optional[Dict[str, Any]]:
        """Process a tick and optionally return a trade signal."""
        ...

    def reset(self) -> None:
        """Reset strategy state for fresh backtest run."""
        ...


# ─── Data Models ───

@dataclass
class Fill:
    """Record of a simulated fill."""
    timestamp: datetime
    side: str           # "BUY" or "SELL"
    price: float
    size_usd: float
    slippage_bps: float = 0.0
    market_id: str = ""

    @property
    def notional(self) -> float:
        return self.price * self.size_usd


@dataclass
class BacktestReport:
    """Comprehensive backtest results."""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    total_pnl: float = 0.0
    max_drawdown: float = 0.0
    peak_equity: float = 0.0
    sharpe_ratio: float = 0.0
    win_rate: float = 0.0
    avg_trade_pnl: float = 0.0
    avg_slippage_bps: float = 0.0
    fills: List[Fill] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    def summary(self) -> str:
        return (
            f"Trades: {self.total_trades} | "
            f"Win Rate: {self.win_rate:.1%} | "
            f"PnL: ${self.total_pnl:.2f} | "
            f"MaxDD: {self.max_drawdown:.1%} | "
            f"Sharpe: {self.sharpe_ratio:.2f}"
        )


# ─── Simulated Broker ───

class SimulatedBroker:
    """
    Paper broker that simulates fills against historical prices
    with configurable slippage.

    Usage:
        broker = SimulatedBroker(initial_capital=10_000, slippage_bps=15)
        broker.execute(signal, current_price)
        report = broker.report()
    """

    def __init__(
        self,
        initial_capital: float = 10_000.0,
        slippage_bps: float = 15.0,
    ):
        self.initial_capital = initial_capital
        self.slippage_bps = slippage_bps

        # State
        self.cash: float = initial_capital
        self.positions: Dict[str, float] = {}   # market_id -> size_usd
        self.entry_prices: Dict[str, float] = {}
        self.fills: List[Fill] = []
        self.equity_curve: List[float] = [initial_capital]
        self.peak_equity: float = initial_capital
        self.max_drawdown: float = 0.0
        self.trade_pnls: List[float] = []

    def execute(
        self,
        signal: Dict[str, Any],
        current_price: float,
        timestamp: Optional[datetime] = None,
    ) -> Optional[Fill]:
        """
        Execute a trade signal against the simulated book.

        Args:
            signal: Dict with keys: side, size_usd, market_id
            current_price: Current market price
            timestamp: Tick timestamp

        Returns:
            Fill record if executed, None if rejected
        """
        side = signal.get("side", "BUY")
        size_usd = signal.get("size_usd", 0.0)
        market_id = signal.get("market_id", "unknown")
        ts = timestamp or datetime.now(timezone.utc)

        if size_usd <= 0:
            return None

        # Apply slippage
        slip_mult = 1.0 + (self.slippage_bps / 10_000)
        if side == "BUY":
            exec_price = current_price * slip_mult
        else:
            exec_price = current_price / slip_mult

        actual_slip = abs(exec_price - current_price) / current_price * 10_000

        fill = Fill(
            timestamp=ts,
            side=side,
            price=exec_price,
            size_usd=size_usd,
            slippage_bps=actual_slip,
            market_id=market_id,
        )

        if side == "BUY":
            if self.cash < size_usd:
                return None  # Insufficient capital
            self.cash -= size_usd
            self.positions[market_id] = self.positions.get(market_id, 0.0) + size_usd
            self.entry_prices[market_id] = exec_price
        else:
            # Close position
            if market_id in self.positions:
                entry = self.entry_prices.get(market_id, exec_price)
                pnl = (exec_price - entry) / entry * self.positions[market_id]
                self.cash += self.positions[market_id] + pnl
                self.trade_pnls.append(pnl)
                del self.positions[market_id]
                if market_id in self.entry_prices:
                    del self.entry_prices[market_id]

        self.fills.append(fill)
        self._update_equity()
        return fill

    def _update_equity(self) -> None:
        """Update equity curve and drawdown tracking."""
        equity = self.cash + sum(self.positions.values())
        self.equity_curve.append(equity)
        if equity > self.peak_equity:
            self.peak_equity = equity
        dd = (self.peak_equity - equity) / self.peak_equity if self.peak_equity > 0 else 0
        self.max_drawdown = max(self.max_drawdown, dd)

    def report(self) -> BacktestReport:
        """Generate comprehensive backtest report."""
        total = len(self.fills)
        winners = sum(1 for p in self.trade_pnls if p > 0)
        losers = sum(1 for p in self.trade_pnls if p <= 0)
        total_pnl = sum(self.trade_pnls)

        # Sharpe ratio from equity curve returns
        if len(self.equity_curve) > 2:
            returns = np.diff(self.equity_curve) / np.array(self.equity_curve[:-1])
            sharpe = (np.mean(returns) / np.std(returns) * np.sqrt(252)
                      if np.std(returns) > 0 else 0.0)
        else:
            sharpe = 0.0

        return BacktestReport(
            total_trades=total,
            winning_trades=winners,
            losing_trades=losers,
            total_pnl=total_pnl,
            max_drawdown=self.max_drawdown,
            peak_equity=self.peak_equity,
            sharpe_ratio=float(sharpe),
            win_rate=winners / max(len(self.trade_pnls), 1),
            avg_trade_pnl=total_pnl / max(len(self.trade_pnls), 1),
            avg_slippage_bps=np.mean([f.slippage_bps for f in self.fills]) if self.fills else 0.0,
            fills=self.fills,
            equity_curve=self.equity_curve,
        )

    def reset(self) -> None:
        """Reset broker to initial state."""
        self.cash = self.initial_capital
        self.positions.clear()
        self.entry_prices.clear()
        self.fills.clear()
        self.equity_curve = [self.initial_capital]
        self.peak_equity = self.initial_capital
        self.max_drawdown = 0.0
        self.trade_pnls.clear()


# ─── Backtest Engine ───

class BacktestEngine:
    """
    Time-series replay engine.

    Iterates through historical data row-by-row, feeding each tick
    to the strategy and executing resulting signals.

    Usage:
        engine = BacktestEngine(strategy=MyStrategy())
        report = engine.run(historical_df)
    """

    def __init__(
        self,
        strategy: Any = None,
        broker: Optional[SimulatedBroker] = None,
        price_column: str = "price",
        timestamp_column: str = "timestamp",
    ):
        self.strategy = strategy
        self.broker = broker or SimulatedBroker()
        self.price_col = price_column
        self.ts_col = timestamp_column

    def run(self, data: pd.DataFrame) -> BacktestReport:
        """
        Run backtest on historical data.

        Args:
            data: DataFrame with at least price and timestamp columns

        Returns:
            BacktestReport with full results
        """
        if data.empty:
            log.warning("Empty dataset — no backtest performed")
            return self.broker.report()

        self.broker.reset()
        if hasattr(self.strategy, "reset"):
            self.strategy.reset()

        log.info(f"Backtest started: {len(data)} ticks")

        for idx, row in data.iterrows():
            # Get timestamp
            ts = row.get(self.ts_col, datetime.now(timezone.utc))
            if isinstance(ts, str):
                ts = pd.Timestamp(ts).to_pydatetime()

            # Feed tick to strategy
            signal = None
            if self.strategy:
                signal = self.strategy.on_tick(row)

            # Execute signal if generated
            if signal:
                price = row.get(self.price_col, 0.0)
                if price > 0:
                    self.broker.execute(signal, price, timestamp=ts)

        report = self.broker.report()
        log.info(f"Backtest complete: {report.summary()}")
        return report


if __name__ == "__main__":
    print("=== Backtest Engine Self-Test ===")

    # Create synthetic price data
    np.random.seed(42)
    n_ticks = 100
    prices = 0.55 + np.cumsum(np.random.normal(0, 0.005, n_ticks))
    prices = np.clip(prices, 0.01, 0.99)

    df = pd.DataFrame({
        "timestamp": pd.date_range("2025-01-01", periods=n_ticks, freq="1min"),
        "price": prices,
        "volume": np.random.uniform(100, 5000, n_ticks),
    })

    # Simple momentum strategy for testing
    class SimpleMomentum:
        def __init__(self):
            self.prev_price = None

        def on_tick(self, row):
            price = row["price"]
            signal = None
            if self.prev_price and price > self.prev_price * 1.005:
                signal = {"side": "BUY", "size_usd": 100, "market_id": "test"}
            elif self.prev_price and price < self.prev_price * 0.995:
                signal = {"side": "SELL", "size_usd": 100, "market_id": "test"}
            self.prev_price = price
            return signal

        def reset(self):
            self.prev_price = None

    engine = BacktestEngine(
        strategy=SimpleMomentum(),
        broker=SimulatedBroker(initial_capital=10_000, slippage_bps=15),
    )
    report = engine.run(df)

    print(f"Results: {report.summary()}")
    print(f"Equity curve length: {len(report.equity_curve)}")
    assert report.total_trades > 0, "Should have some trades"
    assert len(report.equity_curve) > 1, "Should have equity history"
    print("[OK] All self-tests passed")
