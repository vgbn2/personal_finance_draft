"""
REST API Gateway — Control endpoints for the trading engine.

Provides FastAPI POST/PUT routes for:
  - Engine kill switch (trips the master circuit breaker)
  - Strategy configuration hot-reload
  - Backtest trigger
  - System status queries

All mutations occur through the EventBus to prevent
direct coupling between the API layer and the core engine.
"""
import asyncio
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.event_bus import Channel, event_bus
from app.core.strategy_registry import strategy_registry
from app.execution.circuit_breakers import master_breaker, SystemState
from app.utils.config import config_manager
from app.utils.logger import log


router = APIRouter(prefix="/api/v1", tags=["Engine Control"])


# ─── Request Schemas ───

class StrategyConfigUpdate(BaseModel):
    """Payload for strategy config hot-reload."""
    parameters: Dict[str, Any] = {}


class BacktestRequest(BaseModel):
    """Payload for triggering a backtest run."""
    strategy_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# ─── Engine Control ───

@router.post("/engine/kill")
async def trigger_kill_switch():
    """
    Immediately trips the master circuit breaker.

    This halts ALL trading activity. The engine can only be
    recovered manually via the /engine/recover endpoint.
    """
    from app.execution.circuit_breakers import BreakerEvent

    event = BreakerEvent(
        breaker_name="API_KILL_SWITCH",
        reason="Manual kill switch activated via REST API",
        value=1.0,
        threshold=0.0,
    )
    master_breaker._trigger_halt(event)

    # Broadcast to all subscribers
    await event_bus.publish(
        Channel.SYSTEM_COMMAND,
        {"action": "HALT_TRADING", "source": "api_gateway"},
    )

    log.critical("API Gateway: KILL SWITCH activated")
    return {"status": "success", "message": "Engine halted", "state": master_breaker.state.value}


@router.post("/engine/recover")
async def attempt_recovery():
    """
    Attempt to recover the engine from HALTED state.

    Only succeeds if all individual circuit breakers have
    auto-reset past their cooldown timers.
    """
    recovered = master_breaker.recover()
    if recovered:
        await event_bus.publish(
            Channel.SYSTEM_COMMAND,
            {"action": "RESUME_TRADING", "source": "api_gateway"},
        )
        return {"status": "success", "state": master_breaker.state.value}
    return {"status": "failed", "state": master_breaker.state.value, "reason": "Breakers still active"}


@router.get("/engine/status")
async def get_engine_status():
    """Return the comprehensive engine status report."""
    strategies = strategy_registry.list_strategies()
    return {
        "engine_state": master_breaker.state.value,
        "breakers": master_breaker.status_report,
        "strategies_loaded": len(strategies),
        "strategies": strategies,
    }


# ─── Strategy Management ───

@router.put("/strategy/{name}/config")
async def update_strategy_config(name: str, update: StrategyConfigUpdate):
    """
    Hot-reload configuration parameters for a running strategy.

    This does NOT restart the strategy — it updates parameters in-place.
    """
    strategy = strategy_registry.get_strategy(name)
    if not strategy:
        raise HTTPException(status_code=404, detail=f"Strategy '{name}' not found")

    # Apply parameter updates
    for key, value in update.parameters.items():
        if hasattr(strategy, key):
            setattr(strategy, key, value)
            log.info(f"API Gateway: Updated {name}.{key} = {value}")
        else:
            log.warning(f"API Gateway: Unknown parameter {key} for strategy {name}")

    return {
        "status": "success",
        "strategy": name,
        "updated_params": list(update.parameters.keys()),
    }


@router.post("/strategy/{name}/toggle")
async def toggle_strategy(name: str):
    """Enable or disable a loaded strategy."""
    strategy = strategy_registry.get_strategy(name)
    if not strategy:
        raise HTTPException(status_code=404, detail=f"Strategy '{name}' not found")

    strategy.enabled = not strategy.enabled
    state = "enabled" if strategy.enabled else "disabled"
    log.info(f"API Gateway: Strategy [{name}] {state}")
    return {"status": "success", "strategy": name, "enabled": strategy.enabled}


@router.get("/strategies")
async def list_strategies():
    """List all loaded strategies and their current status."""
    return {"strategies": strategy_registry.list_strategies()}


# ─── Backtest ───

@router.post("/backtest/run")
async def trigger_backtest(request: BacktestRequest):
    """
    Trigger an async backtest job.

    STUB: In production, this launches the backtesting engine
    on historical Parquet data. For now, returns acknowledgement.
    """
    log.info(
        f"API Gateway: Backtest requested — "
        f"strategy={request.strategy_name}, "
        f"range={request.start_date} to {request.end_date}"
    )

    await event_bus.publish(
        Channel.SYSTEM_COMMAND,
        {
            "action": "RUN_BACKTEST",
            "strategy": request.strategy_name,
            "start_date": request.start_date,
            "end_date": request.end_date,
        },
    )

    return {
        "status": "accepted",
        "message": "Backtest job queued",
        "strategy": request.strategy_name,
    }
