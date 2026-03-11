"""
Polymarket Paper Trading Simulator — Main Engine v2
Async orchestrator: WS → Orderbook → Strategy → Matching → Portfolio → Metrics
Now with: DB persistence, Parquet recording, TUI dashboard, market settlement.
"""

from __future__ import annotations

import asyncio
import enum
import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional
from .core import config
from .core.database import TradeDatabase
from .core.dashboard import Dashboard
from .core.logger import setup_logging
from .market.matching_engine import MatchingEngine
from .analysis.metrics import MetricsCalculator
from .analysis.market_impact import MarketImpactAnalyzer
from .core.models import OrderSide, TickData
from .market.orderbook import Orderbook
from .analysis.portfolio import Portfolio
from .data.rest_client import (
    GammaAPIClient,
    build_market_slug,
    get_current_window_timestamp,
    get_ms_until_next_window,
    get_next_window_timestamp,
)
from .analysis.strategy_grader import StrategyGrader
from .strategies.strategy_runner import StrategyRunner
from .data.ws_client import PolymarketWSClient
from .data.ws_binance import BinanceWSClient
from .data.recorder import OrderbookRecorder
from .analysis.reporting import SessionReporter
from .data.rest_client import get_next_window_timestamp, parse_iso_to_unix
from .core.registry import MarketState, MarketRegistry
from .core.oracle import OracleManager

logger = logging.getLogger(__name__)


class MarketMode(enum.Enum):
    """How the engine handles market lifecycle."""
    WINDOW_15M = "window_15m"     # BTC Up/Down: auto-switch every 15 min
    CONTINUOUS = "continuous"      # Run until resolved or stopped


class Engine:
    """
    Main orchestrator wiring all components together.

    Data flow:
        WebSocket → Orderbook → Strategy → MatchingEngine → Portfolio → Metrics

    The engine:
        1. Discovers the active market via Gamma REST API
        2. Subscribes to live orderbook via WebSocket
        3. Feeds updates to the loaded strategy
        4. Processes virtual orders through the shadow matching engine
        5. Tracks portfolio metrics and grades the strategy
        6. Persists trades to SQLite and optionally records ticks to Parquet
        7. Displays live TUI dashboard (or logs to console)
    """

    def __init__(
        self,
        strategy_paths: List[str],
        bankroll: float = config.DEFAULT_BANKROLL,
        market_slug: Optional[str] = None,
        use_tui: bool = True,
        record: bool = False,
        resume: bool = False,
    ):
        self.strategy_paths = strategy_paths
        self.bankroll = bankroll
        self._custom_slug = market_slug
        self._use_tui = use_tui
        self._record = record
        self._resume = resume

        # Components
        self._rest = GammaAPIClient()
        self._ws = PolymarketWSClient()
        self._bnc_ws = BinanceWSClient()
        
        # Multi-Market Registry
        self._registry = MarketRegistry()
        self._config: dict = self._load_config()
        
        self._runners: List[StrategyRunner] = []
        for p in strategy_paths:
            runner = StrategyRunner(p)
            runner.load()
            self._runners.append(runner)
        
        self._db = TradeDatabase()
        self._dashboard: Optional[Dashboard] = Dashboard() if use_tui else None
        self._recorder: Optional[OrderbookRecorder] = None
        self._oracle = OracleManager(self._registry, self._db, self._rest)

        # State
        self._running = False
        self._tick_count = 0
        self._last_metrics_print = 0.0
        self._last_snapshot_save = 0.0

        # Keyboard control flags
        self._save_requested = False
        self._stop_requested = False

    def _load_config(self) -> dict:
        config_path = Path(__file__).parent / "markets_config.json"
        if config_path.exists():
            try:
                with open(config_path, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.error("Failed to load markets_config.json: %s", e)
        return {"markets": []}

    # ── Lifecycle ─────────────────────────────────────────────

    async def run(self):
        """Main entry point. Runs multiple markets concurrently."""
        self._running = True
        setup_logging(tui_active=self._use_tui)

        # Connect database
        await self._db.connect()
        
        # Connect Binance WS
        await self._bnc_ws.start()

        logger.info("=" * 60)
        logger.info("  POLYMARKET PAPER TRADING SIMULATOR (MULTI-MARKET)")
        logger.info("=" * 60)

        # ① Initialize Markets from Registry/Config
        all_token_ids = []
        for m_cfg in self._config.get("markets", []):
            if not m_cfg.get("enabled", True):
                continue
            
            # ① Discovery (Prioritize pre-loaded config to bypass REST blocks)
            slug = m_cfg.get("slug")
            token_ids = m_cfg.get("token_ids")
            outcomes = m_cfg.get("outcomes")
            end_time = m_cfg.get("end_time", 0.0)
            title = m_cfg.get("title", slug)

            if not token_ids or not outcomes:
                # Simple throttling to bypass potential Cloudflare blocks
                await asyncio.sleep(1.0)
                logger.info("🔍 Fetching market details via REST: %s", slug)
                market_data = await self._rest.fetch_market_by_slug(slug)
                
                token_ids = GammaAPIClient.extract_token_ids(market_data) or []
                outcomes = GammaAPIClient.extract_outcomes(market_data)
                title = market_data.get("title", slug)
                end_time = parse_iso_to_unix(market_data.get("endDate", "")) if market_data.get("endDate") else 0.0
            else:
                logger.info("⚡ Using pre-loaded discovery for market: %s", slug)

            state = MarketState(
                market_id=m_cfg["id"],
                title=title,
                slug=slug,
                token_ids=token_ids,
                outcomes=outcomes,
                end_time=end_time,
                skip_oracle=m_cfg.get("skip_oracle", False)
            )
            
            # Wire matching engine fills for THIS market
            state.matching.on_fill(lambda fill, m=state: self._on_virtual_fill(fill, m))
            
            # Portfolios per market
            for runner in self._runners:
                portfolio = Portfolio(bankroll=self.bankroll)
                state.portfolios[runner.id] = portfolio
                state.matching.register_portfolio(runner.id, portfolio)
                
                # Start Session
                sid = await self._db.start_session(
                    strategy_name=runner.name,
                    bankroll=self.bankroll,
                    market_slug=slug,
                )
                state.session_ids[runner.id] = sid

            self._registry.register(state)
            all_token_ids.extend(token_ids)

        if not all_token_ids:
            logger.error("No active markets discovered. Exiting.")
            return

        # ② Start TUI
        if self._dashboard:
            self._dashboard.set_strategies([r.name for r in self._runners])
            # For now, dashboard shows first active market or a combined view?
            # User PRD says "Tabbed navigation". Let's init with first market.
            first_market = self._registry.get_all()[0]
            self._dashboard.set_market(first_market.title)
            self._dashboard.start()

        # ③ Setup WS callbacks (Aware of registry)
        self._setup_ws_callbacks()

        # ④ Connect WebSocket for ALL tokens
        ws_task = asyncio.create_task(self._ws.connect(all_token_ids))

        # ⑤ Start Oracle Manager
        self._oracle.start()

        try:
            while self._running:
                # Check keyboard controls
                if self._stop_requested:
                    logger.info("⏹ Stop requested by user.")
                    break
                
                # Dynamic task: Monitor all markets for resolution
                # (Simple loop for now)
                await asyncio.sleep(1)

        except asyncio.CancelledError:
            logger.info("Engine cancelled.")
        except KeyboardInterrupt:
            logger.info("Ctrl+C received.")
        finally:
            await self._shutdown()

    async def _shutdown(self):
        """Graceful shutdown with final report for all markets."""
        self._running = False
        logger.info("\n⏹  Shutting down...")

        if self._dashboard:
            self._dashboard.stop()

        self._oracle.stop()

        await self._bnc_ws.stop()
        await self._ws.disconnect()
        await self._rest.close()

        # Report for each market and strategy
        for market in self._registry.get_all():
            logger.info("\n🏁 Final Report for Market: %s", market.title)
            for runner in self._runners:
                portfolio = market.portfolios.get(runner.id)
                if not portfolio: continue
                
                snap = portfolio.snapshot()
                grade = StrategyGrader.grade(snap)
                report = StrategyGrader.format_report(grade, runner.name)
                logger.info(report)

                sid = market.session_ids.get(runner.id)
                if sid:
                    await self._db.save_snapshot(sid, snap)
                    await self._db.end_session(
                        sid,
                        final_pnl=snap.total_pnl,
                        final_grade=grade.letter,
                    )

        await self._db.close()
        logger.info("Goodbye! 👋")

    # ── WebSocket Callbacks ───────────────────────────────────

    def _setup_ws_callbacks(self):
        """Wire WebSocket events to registry routing."""

        def on_book(data):
            asset_id = data.get("asset_id", "")
            bids = data.get("bids", [])
            asks = data.get("asks", [])

            market = self._registry.find_by_token(asset_id)
            if market:
                asyncio.create_task(
                    self._handle_book_snapshot(market, asset_id, bids, asks)
                )

        def on_price_change(data):
            asset_id = data.get("asset_id", "")
            changes = data.get("price_changes", [])

            market = self._registry.find_by_token(asset_id)
            if market:
                asyncio.create_task(
                    self._handle_price_changes(market, asset_id, changes)
                )

        self._ws.on_book(on_book)
        self._ws.on_price_change(on_price_change)

    async def _handle_book_snapshot(self, market: MarketState, asset_id: str, bids: list, asks: list):
        book = market.orderbooks.get(asset_id)
        if not book: return
        await book.apply_snapshot(bids, asks)
        await self._process_tick(market, asset_id)

    async def _handle_price_changes(self, market: MarketState, asset_id: str, changes: list):
        book = market.orderbooks.get(asset_id)
        if not book: return
        for change in changes:
            price = float(change.get("price", 0))
            size = float(change.get("size", 0))
            side = change.get("side", "BUY")
            await book.apply_delta(price, size, side)
        await self._process_tick(market, asset_id)

    # ── Tick Processing Pipeline ──────────────────────────────

    async def _process_tick(self, market: MarketState, asset_id: str):
        """Core signal loop for a specific market and token."""
        book = market.orderbooks.get(asset_id)
        if not book: return
        self._tick_count += 1

        mid = book.mid_price
        if mid is None: return

        tick = TickData(
            token_id=asset_id,
            mid_price=mid,
            best_bid=book.best_bid or 0.0,
            best_ask=book.best_ask or 0.0,
            spread=book.spread or 0.0,
            timestamp=time.time(),
            btc_price=self._bnc_ws.get_price(),
            btc_delta_60s=self._bnc_ws.get_delta(60.0),
            btc_delta_120s=self._bnc_ws.get_delta(120.0),
            market_end_time=market.end_time
        )

        # ① Feed to strategy
        for runner in self._runners:
            orders = await runner.run_on_tick(tick)
            for o in orders:
                o.strategy_id = runner.id

            # ② Also pass orderbook snapshot
            snapshot = book.snapshot()
            book_orders = await runner.run_on_orderbook_update(snapshot)
            for o in book_orders:
                o.strategy_id = runner.id
            orders.extend(book_orders)

            # ③ Submit orders to this market's matching engine
            for order in orders:
                market.matching.submit_order(order)

        # ④ Process fills against THIS market's book
        market.matching.process_tick(book)

        # ⑤ Mark-to-market and update portfolios for THIS market
        for runner in self._runners:
            portfolio = market.portfolios.get(runner.id)
            if portfolio:
                portfolio.mark_to_market(asset_id, mid)
                runner.update_portfolio(portfolio.snapshot())

        # ⑦ Metrics output (Update dashboard with all markets)
        now = time.time()
        if now - self._last_metrics_print >= config.METRICS_PRINT_INTERVAL_S:
            if self._dashboard:
                self._dashboard.update(
                    market_id=market.market_id,
                    open_orders=market.matching.open_order_count,
                    tick_count=self._tick_count,
                    orderbooks=market.orderbooks,
                    portfolios=market.portfolios,
                    outcomes=market.outcomes,
                    token_ids=market.token_ids,
                    impact_report=None, 
                    current_spread=book.spread or 0.0,
                )
            self._last_metrics_print = now

        # ⑨ Periodic snapshot save
        if now - self._last_snapshot_save >= 30.0:
            for runner in self._runners:
                sid = market.session_ids.get(runner.id)
                if sid:
                    portfolio = market.portfolios.get(runner.id)
                    if portfolio:
                        await self._db.save_snapshot(sid, portfolio.snapshot())
            self._last_snapshot_save = now

    def _on_virtual_fill(self, fill, market: MarketState):
        """Callback when matching engine generates a fill in a specific market."""
        runner = next((r for r in self._runners if r.id == fill.strategy_id), None)
        if not runner: return
            
        portfolio = market.portfolios.get(runner.id)
        if not portfolio: return
            
        portfolio.record_fill(fill)
        logger.info("💰 [%s] Portfolio updated for market %s: Hash=%s", runner.id, market.market_id, portfolio.hash)

        # Notify strategy
        asyncio.create_task(runner.run_on_fill(fill))

        # Persist to DB
        sid = market.session_ids.get(runner.id)
        if sid:
            asyncio.create_task(
                self._db.record_fill(
                    session_id=sid,
                    token_id=fill.token_id,
                    side=fill.side.value,
                    price=fill.price,
                    size=fill.size,
                    cost=fill.price * fill.size,
                )
            )

        # Dashboard activity
        if self._dashboard:
            slip_cents = abs(fill.price - fill.mid_at_fill) * 100 if fill.mid_at_fill > 0 else 0
            self._dashboard.log_activity(
                f"✅ [{runner.name}] {fill.side.value} {fill.size:.0f} @ {fill.price:.4f} "
                f"({market.slug}) [dim]slip {slip_cents:.1f}¢[/dim]"
            )

    # ── Metrics Display (non-TUI fallback) ────────────────────

    def stop(self):
        """Signal the engine to stop."""
        self._running = False
