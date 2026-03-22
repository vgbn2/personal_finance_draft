import asyncio
import sys
from app.utils.logger import log
from app.utils.config import config_manager
from app.core.engine_clock import engine_clock
from app.core.schemas import Side, Signal

async def smoke_test():
    log.info("[bold yellow]Starting Backend Smoke Test...[/]")
    
    # Test Config
    try:
        cfg = config_manager.load()
        log.info(f"Config loaded: [cyan]v{cfg.version}[/]")
    except Exception as e:
        log.error(f"Config Error: {e}")
        sys.exit(1)

    # Test Clock (Snap to 15m)
    start, end = engine_clock.get_current_window_range()
    log.info(f"Snap Check: [green]{start.strftime('%H:%M')} - {end.strftime('%H:%M')}[/]")

    # Test Type System
    sig = Signal(
        market_id="BTC-WIN-2025",
        signal_type="BUY",
        side=Side.YES,
        edge=0.045,
        confidence=0.85,
        suggested_size_pct=0.05,
        reasoning="Testing types"
    )
    log.info(f"Type Check: [bold cyan]Signal Ready[/] - Edge: {sig.edge}")

    log.info("[bold green]SMOKE TEST PASSED[/]")

if __name__ == "__main__":
    asyncio.run(smoke_test())
