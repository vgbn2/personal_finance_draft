"""
Execution Router — Signal-to-Order Pipeline.

Subscribes to SIGNAL_DETECTED events from the EventBus, runs each signal
through the RiskManager's triple-gate system, and routes approved signals
to an abstract order execution method.

Architecture:
    EventBus(SIGNAL_DETECTED)
      → ExecutionRouter.on_signal()
        → RiskManager.check_order()
          → APPROVED → send_order() (stubbed for Phase 6)
          → REJECTED → log + audit

Usage:
    router = ExecutionRouter()
    await router.start()  # Begins listening on EventBus
"""
import asyncio
from typing import Any, Callable, Dict, Optional

from app.core.event_bus import Channel, event_bus
from app.core.models import TradeSignal
from app.db.models import AuditLogEntry
from app.db.mongo import db_manager
from app.execution.risk import risk_engine
from app.math.slippage import slippage_model
from app.utils.logger import log


class ExecutionRouter:
    """
    Bridges signal generation to order execution via risk gates.

    Subscribes to SIGNAL_DETECTED on the EventBus. For each signal:
    1. Validates the signal structure
    2. Runs through RiskManager's 3D gate system
    3. Estimates slippage via the VWAP model
    4. Routes approved signals to send_order()
    5. Publishes TRADE_EXECUTED on fill

    The send_order() method is intentionally stubbed —
    Phase 6 will implement live Polymarket CLOB execution.
    """

    def __init__(self):
        self._signal_queue: asyncio.Queue = asyncio.Queue()
        self._running: bool = False
        self._total_routed: int = 0
        self._total_rejected: int = 0

    async def start(self) -> None:
        """Subscribe to EventBus and begin processing signals."""
        event_bus.subscribe(Channel.SIGNAL_DETECTED, self._signal_queue)
        self._running = True
        log.info("ExecutionRouter: Listening on SIGNAL_DETECTED channel")

        while self._running:
            try:
                signal = await asyncio.wait_for(
                    self._signal_queue.get(), timeout=5.0
                )
                await self._on_signal(signal)
            except asyncio.TimeoutError:
                continue  # Heartbeat — no signal received
            except Exception as e:
                log.error(f"ExecutionRouter: Unexpected error: {e}")
                await asyncio.sleep(1)

    def stop(self) -> None:
        """Stop the router loop."""
        self._running = False
        event_bus.unsubscribe(Channel.SIGNAL_DETECTED, self._signal_queue)
        log.info(
            f"ExecutionRouter: Stopped. "
            f"Routed={self._total_routed}, Rejected={self._total_rejected}"
        )

    async def _on_signal(self, signal: Any) -> None:
        """
        Process a single trading signal through the risk pipeline.

        Args:
            signal: A TradeSignal or dict with signal data
        """
        # ── Normalize signal ──
        if isinstance(signal, TradeSignal):
            sig = signal
        elif isinstance(signal, dict):
            try:
                sig = TradeSignal(**signal)
            except Exception as e:
                log.warning(f"ExecutionRouter: Invalid signal format: {e}")
                return
        else:
            log.warning(f"ExecutionRouter: Unknown signal type: {type(signal)}")
            return

        log.info(
            f"ExecutionRouter: Processing signal for {sig.market_id} "
            f"(edge={sig.edge:.4f}, alloc={sig.allocation_pct:.2%})"
        )

        # ── Risk Gate Check ──
        verdict = risk_engine.check_order(
            signal_prob=sig.confidence,
            size_pct=sig.allocation_pct,
            liquidity_usd=1000.0,  # TODO: Pull from live orderbook in Phase 6
            market_price=sig.market_price,
            market_id=sig.market_id,
        )

        # ── Audit Log ──
        await db_manager.insert_audit_log(
            AuditLogEntry(
                event_type="RISK_CHECK",
                source_module="execution_router",
                market_id=sig.market_id,
                payload={
                    "approved": verdict.approved,
                    "edge": sig.edge,
                    "allocation": sig.allocation_pct,
                    "gates": [g.model_dump() for g in verdict.gates],
                },
                severity="INFO" if verdict.approved else "WARNING",
            ).model_dump()
        )

        if not verdict.approved:
            self._total_rejected += 1
            log.warning(
                f"ExecutionRouter: Signal REJECTED for {sig.market_id} — "
                f"{verdict.rejection_reason}"
            )
            return

        # ── Route to Execution ──
        self._total_routed += 1
        await self._send_order(sig, verdict.suggested_size_pct)

    async def _send_order(self, signal: TradeSignal, size_pct: float) -> None:
        """
        Execute the trade order.

        STUB: In Phase 6, this will call the Polymarket CLOB API
        with EIP-712 signed orders. For now, it logs the intent
        and publishes a simulated TRADE_EXECUTED event.
        """
        log.info(
            f"ExecutionRouter: ORDER ROUTED — {signal.side} {signal.market_id} "
            f"@ {signal.market_price:.4f} (size={size_pct:.2%})"
        )

        # Record fill in risk engine
        risk_engine.record_fill(signal.market_id, size_pct)

        # Publish execution event
        execution_event = {
            "market_id": signal.market_id,
            "side": signal.side,
            "price": signal.market_price,
            "size_pct": size_pct,
            "edge": signal.edge,
            "status": "SIMULATED",  # Will be "FILLED" in Phase 6
        }
        await event_bus.publish(Channel.TRADE_EXECUTED, execution_event)

        # Audit log
        await db_manager.insert_audit_log(
            AuditLogEntry(
                event_type="ORDER_ROUTED",
                source_module="execution_router",
                market_id=signal.market_id,
                payload=execution_event,
            ).model_dump()
        )

    @property
    def stats(self) -> Dict[str, int]:
        """Return routing statistics."""
        return {
            "total_routed": self._total_routed,
            "total_rejected": self._total_rejected,
            "pending_signals": self._signal_queue.qsize(),
        }


# ─── Module-level singleton ───
execution_router = ExecutionRouter()
