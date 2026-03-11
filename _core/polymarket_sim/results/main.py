"""
Polymarket Paper Trading Simulator — CLI Entry Point v2

Usage:
    python -m polymarket_sim --strategy strategies/strategy_alpha.py
    python -m polymarket_sim --strategy my_strat.py --bankroll 5000
    python -m polymarket_sim --strategy my_strat.py --market btc-updown-15m-1767186000
    python -m polymarket_sim --manual
    python -m polymarket_sim --record --strategy strategies/strategy_alpha.py
    python -m polymarket_sim --backtest data/recordings/session_1.parquet --strategy strategies/strategy_alpha.py
    python -m polymarket_sim --history
    python -m polymarket_sim --search "bitcoin"
"""

from __future__ import annotations

import argparse
import asyncio
import signal
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="polymarket_sim",
        description=(
            "🎯 Polymarket Paper Trading Simulator\n"
            "Live shadow-trading with pre-written Python strategies."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m polymarket_sim --strategy strategies/strategy_alpha.py\n"
            "  python -m polymarket_sim --manual --market some-market-slug\n"
            "  python -m polymarket_sim --record --strategy strat.py\n"
            "  python -m polymarket_sim --backtest data/recordings/session_1.parquet -s strat.py\n"
            "  python -m polymarket_sim --history\n"
            "  python -m polymarket_sim --search 'bitcoin price'\n"
        ),
    )

    # ── Core ──────────────────────────────────────────────────
    parser.add_argument(
        "--strategy", "-s",
        type=str,
        nargs="+",
        default=None,
        help="Path to one or more strategy .py files (must subclass BaseStrategy)",
    )
    parser.add_argument(
        "--strategies-dir",
        type=str,
        default=None,
        help="Path to a directory containing strategy .py files",
    )
    parser.add_argument(
        "--bankroll", "-b",
        type=float,
        default=1000.0,
        help="Starting paper-trade bankroll in USD (default: 1000)",
    )
    parser.add_argument(
        "--market", "-m",
        type=str,
        default=None,
        help="Market slug or condition ID. Auto-discovers if not specified.",
    )

    # ── Modes ─────────────────────────────────────────────────
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Manual trading mode (keyboard commands instead of strategy file)",
    )
    parser.add_argument(
        "--backtest",
        type=str,
        default=None,
        metavar="FILE",
        help="Run backtest on a Parquet recording file",
    )
    parser.add_argument(
        "--backtest-latency",
        type=float,
        default=75.0,
        metavar="MS",
        help="Simulated latency in ms for backtest (default: 75)",
    )

    # ── Persistence ───────────────────────────────────────────
    parser.add_argument(
        "--record",
        action="store_true",
        help="Record orderbook ticks to Parquet for later backtesting",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from last saved session",
    )
    parser.add_argument(
        "--history",
        action="store_true",
        help="Print past session summaries and exit",
    )

    # ── Display ───────────────────────────────────────────────
    parser.add_argument(
        "--no-tui",
        action="store_true",
        help="Disable Rich TUI dashboard, use plain log output",
    )

    # ── Discovery ─────────────────────────────────────────────
    parser.add_argument(
        "--search",
        type=str,
        default=None,
        metavar="QUERY",
        help="Search for markets by keyword and exit",
    )

    return parser.parse_args()


def main():
    args = parse_args()

    # ── History mode ──────────────────────────────────────────
    if args.history:
        asyncio.run(_print_history())
        return

    # ── Search mode ───────────────────────────────────────────
    if args.search:
        asyncio.run(_search_markets(args.search))
        return

    # ── Backtest mode ─────────────────────────────────────────
    if args.backtest:
        if not args.strategy and not args.strategies_dir:
            print("[ERROR] --backtest requires --strategy or --strategies-dir")
            sys.exit(1)

        strategy_paths = _resolve_strategies(args.strategy, args.strategies_dir)
        if not strategy_paths:
            print("[ERROR] No strategies found")
            sys.exit(1)

        if len(strategy_paths) > 1:
            print("[WARN] Backtest mode currently runs one strategy at a time. Using the first one.")

        recording_path = Path(args.backtest)
        if not recording_path.exists():
            print(f"[ERROR] Recording not found: {recording_path}")
            sys.exit(1)

        from .core.backtest import BacktestEngine
        engine = BacktestEngine(
            strategy_path=str(strategy_paths[0]),
            recording_path=str(recording_path),
            bankroll=args.bankroll,
            latency_ms=args.backtest_latency,
        )
        results = asyncio.run(engine.run())
        print(results["report"])
        return

    # ── Manual mode ───────────────────────────────────────────
    if args.manual:
        _run_manual(args)
        return

    # ── Live mode (default) ───────────────────────────────────
    if not args.strategy and not args.strategies_dir:
        print("[ERROR] --strategy or --strategies-dir is required (or use --manual)")
        sys.exit(1)

    strategy_paths = _resolve_strategies(args.strategy, args.strategies_dir)
    if not strategy_paths:
        print("[ERROR] No strategies found")
        sys.exit(1)

    from .engine import Engine
    engine = Engine(
        strategy_paths=[str(p) for p in strategy_paths],
        bankroll=args.bankroll,
        market_slug=args.market,
        use_tui=not args.no_tui, # legacy arg, engine will init Dashboard
        record=args.record,
        resume=args.resume,
    )

    import uvicorn
    from .web.app import create_app
    
    app = create_app(engine)
    
    print("\n[WEB] Starting Web Dashboard at http://localhost:8000\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)


def _resolve_strategies(paths: list[str] | None, dir_path: str | None) -> list[Path]:
    resolved = []
    
    if paths:
        for p in paths:
            sp = Path(p)
            if not sp.is_absolute():
                sp = Path.cwd() / sp
            if sp.exists() and sp.is_file() and sp.suffix == '.py':
                resolved.append(sp)
            else:
                print(f"[WARN] Strategy file not found: {sp}")
                
    if dir_path:
        dp = Path(dir_path)
        if not dp.is_absolute():
            dp = Path.cwd() / dp
        if dp.exists() and dp.is_dir():
            for sp in dp.glob("strategy_*.py"):
                if sp.is_file() and not sp.name.startswith("_") and sp.name != "strategy_runner.py":
                    resolved.append(sp)
        else:
            print(f"[WARN] Strategies directory not found: {dp}")
            
    # Deduplicate while preserving order
    seen = set()
    return [x for x in resolved if not (x in seen or seen.add(x))]


def _run_manual(args):
    """Launch manual trading mode."""
    # Create a temporary strategy file path for ManualTrader
    from .core.manual_trader import ManualTrader
    from .engine import Engine
    import tempfile, textwrap

    # Write a temporary strategy file that imports ManualTrader
    tmp = Path(tempfile.gettempdir()) / "_polymarket_manual_strategy.py"
    tmp.write_text(textwrap.dedent("""\
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from polymarket_sim.core.manual_trader import ManualTrader
        # Re-export so StrategyRunner finds it
        Strategy = ManualTrader
    """))

    engine = Engine(
        strategy_paths=[str(tmp)],
        bankroll=args.bankroll,
        market_slug=args.market,
        use_tui=not args.no_tui,
        record=args.record,
    )

    import signal as sig
    sig.signal(sig.SIGINT, lambda s, f: engine.stop())

    try:
        asyncio.run(engine.run())
    except KeyboardInterrupt:
        pass
    finally:
        tmp.unlink(missing_ok=True)


async def _print_history():
    """Print past trading sessions."""
    from .core.database import TradeDatabase
    db = TradeDatabase()
    await db.connect()
    sessions = await db.get_session_history(limit=20)
    await db.close()

    if not sessions:
        print("No trading sessions found.")
        return

    print(f"\n{'ID':>4}  {'Strategy':<30}  {'Bankroll':>10}  {'PnL':>10}  {'Grade':>6}")
    print("─" * 70)
    for s in sessions:
        pnl = s.get("final_pnl")
        pnl_str = f"${pnl:+.2f}" if pnl is not None else "running"
        grade = s.get("final_grade") or "..."
        print(f"{s['id']:>4}  {s['strategy']:<30}  ${s['bankroll']:>9.2f}  {pnl_str:>10}  {grade:>6}")
    print()


async def _search_markets(query: str):
    """Search for markets by keyword."""
    from .data.rest_client import GammaAPIClient
    client = GammaAPIClient()
    try:
        results = await client.search_markets(query)
        if not results:
            print(f"No markets found for: '{query}'")
            return

        print(f"\n{'#':>3}  {'Title':<50}  {'Slug':<30}")
        print("─" * 90)
        for i, market in enumerate(results[:20], 1):
            title = market.get("title", "?")[:48]
            slug = market.get("slug", "?")[:28]
            print(f"{i:>3}  {title:<50}  {slug:<30}")
        print(f"\nUse: python -m polymarket_sim --market <slug> --strategy <file>")
    finally:
        await client.close()


if __name__ == "__main__":
    main()
