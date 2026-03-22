"""
State Reconciliation Service — Exchange reality vs. internal state drift detection.

Runs an independent background loop every N seconds that:
  1. Queries the Polymarket API for actual account positions.
  2. Compares them to the internal ``PortfolioManager`` state.
  3. If drift is detected (phantom positions, missed fills), forces an
     internal state override and logs a CRITICAL sync warning.

STUB: Live API calls are stubbed for Phase 6. Phase 7 will implement
      real Polymarket account position fetching.

Usage:
    reconciler = ReconciliationService()
    await reconciler.start()
"""
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.event_bus import Channel, event_bus
from app.core.portfolio import portfolio, PortfolioManager
from app.db.persistence import persistence_manager
from app.db.schemas import AuditLogEntry
from app.utils.logger import log


class ReconciliationService:
    """
    Background daemon that verifies internal state against exchange reality.

    Drift Categories:
        PHANTOM — Position exists on exchange but not internally.
        GHOST   — Position exists internally but not on exchange.
        SIZE    — Position exists on both sides but size differs.

    All drifts are logged as CRITICAL audit events.
    """

    def __init__(
        self,
        check_interval_sec: float = 60.0,
        max_drift_tolerance_pct: float = 0.01,
    ):
        self.interval = check_interval_sec
        self.drift_tolerance = max_drift_tolerance_pct
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self.drift_count: int = 0
        self.last_check: Optional[datetime] = None

    async def start(self) -> None:
        """Start the reconciliation loop."""
        self._running = True
        self._task = asyncio.create_task(self._reconciliation_loop())
        log.info(
            f"ReconciliationService: Started (interval={self.interval}s, "
            f"tolerance={self.drift_tolerance:.1%})"
        )

    async def stop(self) -> None:
        """Stop the reconciliation loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info(
            f"ReconciliationService: Stopped. "
            f"Total drifts detected: {self.drift_count}"
        )

    async def _reconciliation_loop(self) -> None:
        """Main loop — runs reconciliation checks at configured intervals."""
        while self._running:
            try:
                await asyncio.sleep(self.interval)
                await self.check_once()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.error(f"ReconciliationService: Loop error: {e}")
                await asyncio.sleep(5)

    async def check_once(self) -> Dict[str, Any]:
        """
        Run a single reconciliation check.

        Returns:
            Dict with drift report.
        """
        self.last_check = datetime.now(timezone.utc)

        # Fetch actual exchange positions
        actual_positions = await self._fetch_exchange_positions()

        # Get internal positions
        internal_positions = self._get_internal_positions()

        # Compare
        drifts = self._compare_positions(actual_positions, internal_positions)

        if drifts:
            self.drift_count += len(drifts)
            for drift in drifts:
                log.critical(
                    f"RECONCILIATION DRIFT: {drift['type']} — "
                    f"market={drift['market_id']}, "
                    f"detail={drift['detail']}"
                )

                # Log to audit trail
                await persistence_manager.insert_audit_log(
                    AuditLogEntry(
                        event_type="RECONCILIATION_DRIFT",
                        source_module="reconciliation",
                        market_id=drift["market_id"],
                        payload=drift,
                        severity="CRITICAL",
                    ).model_dump()
                )

                # Publish alert
                await event_bus.publish(Channel.RISK_ALERT, {
                    "type": "RECONCILIATION_DRIFT",
                    "drift": drift,
                })

        report = {
            "checked_at": self.last_check.isoformat(),
            "exchange_positions": len(actual_positions),
            "internal_positions": len(internal_positions),
            "drifts_found": len(drifts),
            "drifts": drifts,
            "status": "CLEAN" if not drifts else "DRIFT_DETECTED",
        }

        if not drifts:
            log.info("ReconciliationService: State is consistent ✓")

        return report

    async def _fetch_exchange_positions(self) -> Dict[str, Dict[str, Any]]:
        """
        Fetch actual positions from the exchange.

        STUB: Returns empty dict for Phase 6.
        Phase 7 will integrate with the Polymarket CLOB API
        to fetch real account positions.
        """
        # TODO: Replace with real Polymarket API call
        # positions = await clob_client.get_open_positions()
        return {}

    def _get_internal_positions(self) -> Dict[str, Dict[str, Any]]:
        """Extract positions from the internal PortfolioManager."""
        result = {}
        for key, pos in portfolio.positions.items():
            result[pos.market_id] = {
                "side": pos.side,
                "size_usd": pos.size_usd,
                "entry_price": pos.entry_price,
                "current_price": pos.current_price,
            }
        return result

    def _compare_positions(
        self,
        actual: Dict[str, Dict[str, Any]],
        internal: Dict[str, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Compare exchange reality with internal state.

        Returns:
            List of drift descriptions.
        """
        drifts = []

        # Check for PHANTOM positions (on exchange, not internal)
        for market_id, pos in actual.items():
            if market_id not in internal:
                drifts.append({
                    "type": "PHANTOM",
                    "market_id": market_id,
                    "detail": f"Position on exchange but not tracked internally: {pos}",
                    "exchange_pos": pos,
                    "internal_pos": None,
                })

        # Check for GHOST positions (internal, not on exchange)
        for market_id, pos in internal.items():
            if market_id not in actual:
                drifts.append({
                    "type": "GHOST",
                    "market_id": market_id,
                    "detail": f"Position tracked internally but not on exchange: {pos}",
                    "exchange_pos": None,
                    "internal_pos": pos,
                })

        # Check for SIZE drifts (both exist but sizes differ)
        for market_id in set(actual.keys()) & set(internal.keys()):
            a_size = actual[market_id].get("size_usd", 0)
            i_size = internal[market_id].get("size_usd", 0)
            if a_size > 0:
                drift_pct = abs(a_size - i_size) / a_size
                if drift_pct > self.drift_tolerance:
                    drifts.append({
                        "type": "SIZE",
                        "market_id": market_id,
                        "detail": (
                            f"Size mismatch: exchange=${a_size:.2f} vs "
                            f"internal=${i_size:.2f} (drift={drift_pct:.2%})"
                        ),
                        "exchange_pos": actual[market_id],
                        "internal_pos": internal[market_id],
                    })

        return drifts


# ─── Module-level singleton ───
reconciliation_service = ReconciliationService()


if __name__ == "__main__":
    import asyncio

    async def _self_test():
        print("=== Reconciliation Service Self-Test ===")

        report = await reconciliation_service.check_once()
        print(f"Report: {report}")

        if report["status"] == "CLEAN":
            print("[OK] Reconciliation self-test passed (no drifts)")
        else:
            print(f"[WARN] Drifts detected: {report['drifts_found']}")

    asyncio.run(_self_test())
