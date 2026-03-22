"""
Audit Stream Daemon — Async background worker for persistent audit logging.

Subscribes to multiple EventBus channels (RISK_ALERT, TRADE_EXECUTED,
SYSTEM_ERROR, SYSTEM_COMMAND) and batches events before flushing
to MongoDB asynchronously.

This isolates DB write latency from the core trade loop,
ensuring that database IO never blocks signal processing.

Usage:
    daemon = AuditDaemon()
    await daemon.start()
"""
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.event_bus import Channel, event_bus
from app.db.persistence import persistence_manager
from app.db.schemas import AuditLogEntry
from app.utils.logger import log


class AuditDaemon:
    """
    Background worker that batches audit events and flushes to persistence.

    Architecture:
        EventBus → Queue → Batch Buffer → Flush to MongoDB

    Configuration:
        batch_size:   Flush after N events (default 10)
        flush_interval_sec: Force flush after N seconds even if batch is incomplete
    """

    def __init__(
        self,
        batch_size: int = 10,
        flush_interval_sec: float = 5.0,
    ):
        self.batch_size = batch_size
        self.flush_interval = flush_interval_sec
        self._queue: asyncio.Queue = asyncio.Queue()
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._total_flushed: int = 0

    async def start(self) -> None:
        """Subscribe to audit-relevant channels and begin processing."""
        self._running = True

        # Subscribe to all audit-relevant channels
        event_bus.subscribe(Channel.RISK_ALERT, self._queue)
        event_bus.subscribe(Channel.TRADE_EXECUTED, self._queue)
        event_bus.subscribe(Channel.SYSTEM_ERROR, self._queue)
        event_bus.subscribe(Channel.SYSTEM_COMMAND, self._queue)

        self._task = asyncio.create_task(self._process_loop())
        log.info(
            f"AuditDaemon: Started (batch={self.batch_size}, "
            f"flush_interval={self.flush_interval}s)"
        )

    async def stop(self) -> None:
        """Stop processing and flush remaining events."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Final flush of any remaining events
        remaining = []
        while not self._queue.empty():
            try:
                remaining.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        if remaining:
            await self._flush_batch(remaining)

        log.info(
            f"AuditDaemon: Stopped. Total events flushed: {self._total_flushed}"
        )

    async def _process_loop(self) -> None:
        """Main processing loop — collects events and flushes in batches."""
        batch: List[Dict[str, Any]] = []

        while self._running:
            try:
                # Wait for an event with timeout for periodic flushing
                try:
                    event = await asyncio.wait_for(
                        self._queue.get(), timeout=self.flush_interval
                    )
                    audit_entry = self._event_to_audit(event)
                    if audit_entry:
                        batch.append(audit_entry)
                except asyncio.TimeoutError:
                    pass  # Timeout — flush whatever we have

                # Flush if batch is full or on timeout
                if len(batch) >= self.batch_size or (
                    batch and len(batch) > 0
                ):
                    await self._flush_batch(batch)
                    batch = []

            except asyncio.CancelledError:
                # Flush remaining on cancellation
                if batch:
                    await self._flush_batch(batch)
                raise
            except Exception as e:
                log.error(f"AuditDaemon: Processing error: {e}")
                await asyncio.sleep(1)

    def _event_to_audit(self, event: Any) -> Optional[Dict[str, Any]]:
        """Convert an EventBus message into an AuditLogEntry dict."""
        try:
            if isinstance(event, dict):
                return AuditLogEntry(
                    event_type=event.get("action", event.get("type", "UNKNOWN")),
                    source_module="audit_daemon",
                    market_id=event.get("market_id"),
                    payload=event,
                    severity=event.get("severity", "INFO"),
                ).model_dump()
            elif hasattr(event, "model_dump"):
                # Pydantic model
                return AuditLogEntry(
                    event_type=type(event).__name__,
                    source_module="audit_daemon",
                    payload=event.model_dump(),
                ).model_dump()
            else:
                return AuditLogEntry(
                    event_type="UNTYPED_EVENT",
                    source_module="audit_daemon",
                    payload={"raw": str(event)},
                ).model_dump()
        except Exception as e:
            log.warning(f"AuditDaemon: Failed to convert event: {e}")
            return None

    async def _flush_batch(self, batch: List[Dict[str, Any]]) -> None:
        """Write a batch of audit entries to persistence."""
        if not batch:
            return

        for entry in batch:
            try:
                await persistence_manager.insert_audit_log(entry)
            except Exception as e:
                log.error(f"AuditDaemon: Failed to persist entry: {e}")

        self._total_flushed += len(batch)
        log.debug(f"AuditDaemon: Flushed {len(batch)} entries (total: {self._total_flushed})")


# ─── Module-level singleton ───
audit_daemon = AuditDaemon()


if __name__ == "__main__":
    import asyncio

    async def _self_test():
        print("=== Audit Daemon Self-Test ===")

        await audit_daemon.start()

        # Publish test events
        await event_bus.publish(Channel.SYSTEM_COMMAND, {"action": "TEST_EVENT", "detail": "self-test"})
        await event_bus.publish(Channel.RISK_ALERT, {"type": "TEST_ALERT", "severity": "WARNING"})

        await asyncio.sleep(2)
        await audit_daemon.stop()

        print(f"Total flushed: {audit_daemon._total_flushed}")
        print("[OK] Audit Daemon self-test passed")

    asyncio.run(_self_test())
