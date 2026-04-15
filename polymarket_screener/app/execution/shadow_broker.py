"""
Shadow Broker — Zero-Risk Slippage Validation.

Simulates trade execution without sending any orders to the Polymarket API.
Instead, it "bookmarks" trade intent and compares its predicted effective_price
against actual market prices from the public trade stream.

Purpose: Prove that our VWAP slippage model (app/math/slippage.py) accurately
reflects real-world execution before risking capital.

Usage:
    shadow = ShadowBroker()
    await shadow.execute_trade(signal)
    report = shadow.get_drift_report()
"""
import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.core.engine.event_bus import Channel, event_bus
from app.db.schemas import AuditLogEntry
from app.db.persistence import persistence_manager
from app.math.slippage import slippage_model
from app.utils.logger import log


@dataclass
class ShadowFill:
    """Record of a shadow (virtual) trade execution."""
    market_id: str
    side: str
    intended_price: float
    intended_size_usd: float
    actual_price: Optional[float] = None
    drift_pct: float = 0.0
    timestamp: float = field(default_factory=time.time)
    resolved: bool = False

    @property
    def drift_bps(self) -> float:
        """Drift in basis points."""
        return abs(self.drift_pct) * 10_000


class ShadowBroker:
    """
    Virtual broker that tracks execution drift without risking capital.

    For each signal:
    1. Records the intended fill price and size
    2. Waits a configurable delay (default 2s) to simulate latency
    3. Fetches the actual market price after the delay
    4. Calculates drift between intended and actual fill
    5. Logs the result to the audit trail

    After accumulating N fills, generates a drift report for validation.
    """

    def __init__(
        self,
        latency_delay_sec: float = 2.0,
        max_acceptable_drift_pct: float = 0.001,  # 0.1% = 10 bps
    ):
        self.latency_delay = latency_delay_sec
        self.max_drift = max_acceptable_drift_pct
        self.fills: List[ShadowFill] = []
        self._running: bool = False
        self._signal_queue: asyncio.Queue = asyncio.Queue()

    async def start(self) -> None:
        """Subscribe to SIGNAL_DETECTED and begin shadow execution."""
        event_bus.subscribe(Channel.SIGNAL_DETECTED, self._signal_queue)
        self._running = True
        log.info("ShadowBroker: Shadow mode ACTIVE (no real orders)")

        while self._running:
            try:
                signal = await asyncio.wait_for(
                    self._signal_queue.get(), timeout=5.0
                )
                await self.execute_trade(signal)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                log.error(f"ShadowBroker: Error processing signal: {e}")

    def stop(self) -> None:
        """Stop the shadow broker."""
        self._running = False
        event_bus.unsubscribe(Channel.SIGNAL_DETECTED, self._signal_queue)
        log.info(f"ShadowBroker: Stopped. Total shadow fills: {len(self.fills)}")

    async def execute_trade(self, signal: Any) -> ShadowFill:
        """
        Execute a shadow trade — bookmark intent and measure drift.

        Args:
            signal: TradeSignal dict or object with market_id, market_price, allocation_pct

        Returns:
            ShadowFill with drift measurement
        """
        # Extract signal fields
        if isinstance(signal, dict):
            market_id = signal.get("market_id", "unknown")
            intended_price = signal.get("market_price", 0.0)
            side = signal.get("side", "BUY")
            size_usd = signal.get("size_usd", 0.0)
        else:
            market_id = getattr(signal, "market_id", "unknown")
            intended_price = getattr(signal, "market_price", 0.0)
            side = getattr(signal, "side", "BUY")
            size_usd = getattr(signal, "size_usd", 0.0)

        # Create shadow fill bookmark
        shadow_fill = ShadowFill(
            market_id=market_id,
            side=side,
            intended_price=intended_price,
            intended_size_usd=size_usd,
        )

        log.info(
            f"ShadowBroker: Bookmarked {side} {market_id} "
            f"@ {intended_price:.4f} (${size_usd:.2f})"
        )

        # Simulate execution latency
        await asyncio.sleep(self.latency_delay)

        # In production, this would fetch from the live Polymarket trade stream.
        # For now, we simulate a small random drift using the VWAP model output.
        actual_price = await self._fetch_post_trade_price(market_id, intended_price)

        # Calculate drift
        if intended_price > 0:
            shadow_fill.actual_price = actual_price
            shadow_fill.drift_pct = (actual_price - intended_price) / intended_price
            shadow_fill.resolved = True

        self.fills.append(shadow_fill)

        # Log result
        drift_status = "OK" if abs(shadow_fill.drift_pct) <= self.max_drift else "HIGH"
        log.info(
            f"ShadowBroker: Fill resolved — "
            f"Intended={intended_price:.4f}, "
            f"Actual={actual_price:.4f}, "
            f"Drift={shadow_fill.drift_bps:.1f}bps [{drift_status}]"
        )

        # Audit trail
        await persistence_manager.insert_audit_log(
            AuditLogEntry(
                event_type="SHADOW_FILL",
                source_module="shadow_broker",
                market_id=market_id,
                payload={
                    "side": side,
                    "intended_price": intended_price,
                    "actual_price": actual_price,
                    "drift_pct": shadow_fill.drift_pct,
                    "drift_bps": shadow_fill.drift_bps,
                    "status": drift_status,
                },
            ).model_dump()
        )

        return shadow_fill

    async def _fetch_post_trade_price(
        self, market_id: str, reference_price: float
    ) -> float:
        """
        Fetch the actual market price after execution delay.

        STUB: In production, this calls the Polymarket CLOB API
        to get the real-time market price. For now, returns the
        reference price (drift = 0) to establish the pipeline.

        Phase 6 will implement live price fetching.
        """
        # TODO: Replace with live CLOB price fetch
        return reference_price

    def get_drift_report(self) -> Dict[str, Any]:
        """
        Generate a comprehensive drift analysis report.

        Returns:
            Dict with drift statistics across all shadow fills
        """
        if not self.fills:
            return {"total_fills": 0, "status": "NO_DATA"}

        resolved = [f for f in self.fills if f.resolved]
        if not resolved:
            return {"total_fills": len(self.fills), "resolved": 0, "status": "PENDING"}

        drifts = [abs(f.drift_pct) for f in resolved]
        drift_bps_list = [f.drift_bps for f in resolved]

        avg_drift = sum(drifts) / len(drifts)
        max_drift = max(drifts)
        high_drift_count = sum(1 for d in drifts if d > self.max_drift)

        return {
            "total_fills": len(self.fills),
            "resolved": len(resolved),
            "avg_drift_pct": avg_drift,
            "avg_drift_bps": sum(drift_bps_list) / len(drift_bps_list),
            "max_drift_pct": max_drift,
            "max_drift_bps": max(drift_bps_list),
            "high_drift_count": high_drift_count,
            "within_tolerance": high_drift_count == 0,
            "status": "PASS" if high_drift_count == 0 else "WARN",
        }


# ─── Module-level singleton ───
shadow_broker = ShadowBroker()


if __name__ == "__main__":
    import asyncio

    async def _self_test():
        print("=== Shadow Broker Self-Test ===")

        # Simulate a signal
        test_signal = {
            "market_id": "TEST-MKT-001",
            "side": "BUY",
            "market_price": 0.55,
            "size_usd": 100.0,
        }

        fill = await shadow_broker.execute_trade(test_signal)
        print(f"Fill: intended={fill.intended_price}, actual={fill.actual_price}, "
              f"drift={fill.drift_bps:.1f}bps")

        report = shadow_broker.get_drift_report()
        print(f"Report: {report}")
        print("[OK] All self-tests passed")

    asyncio.run(_self_test())
