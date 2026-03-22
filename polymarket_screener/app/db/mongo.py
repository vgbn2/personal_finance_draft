"""
Async MongoDB Connection Manager.

Uses Motor (async MongoDB driver) for non-blocking database operations.
Designed to fail gracefully — if MongoDB is unreachable, the engine
continues running and logs the failure instead of crashing.

Usage:
    db = DatabaseManager("mongodb://localhost:27017")
    await db.connect()
    await db.insert_audit_log({"event": "SIGNAL", ...})
    await db.disconnect()
"""
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.utils.logger import log

# Motor is optional — if not installed, DB operations become no-ops
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    HAS_MOTOR = True
except ImportError:
    HAS_MOTOR = False
    log.warning("motor not installed — database operations will be no-ops")


class DatabaseManager:
    """
    Async MongoDB manager with graceful degradation.

    If Motor is not installed or the DB is unreachable, all write operations
    silently log warnings instead of raising exceptions. This ensures the
    trading engine never blocks on database failures.
    """

    def __init__(
        self,
        uri: str = "mongodb://localhost:27017",
        db_name: str = "poly_screener",
        server_timeout_ms: int = 5000,
    ):
        self.uri = uri
        self.db_name = db_name
        self.server_timeout_ms = server_timeout_ms
        self.client = None
        self.db = None
        self._connected = False

    async def connect(self) -> bool:
        """
        Establish MongoDB connection.

        Returns:
            True if connected, False if connection failed (non-blocking).
        """
        if not HAS_MOTOR:
            log.warning("DatabaseManager: Motor not installed, running in no-op mode")
            return False

        try:
            self.client = AsyncIOMotorClient(
                self.uri,
                serverSelectionTimeoutMS=self.server_timeout_ms,
            )
            # Verify connection with a ping
            await asyncio.wait_for(
                self.client.admin.command("ping"),
                timeout=self.server_timeout_ms / 1000,
            )
            self.db = self.client[self.db_name]
            self._connected = True
            log.info(f"DatabaseManager: Connected to {self.uri}/{self.db_name}")
            return True
        except Exception as e:
            log.warning(f"DatabaseManager: Connection failed (non-blocking): {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Close MongoDB connection gracefully."""
        if self.client:
            self.client.close()
            self._connected = False
            log.info("DatabaseManager: Disconnected")

    @property
    def is_connected(self) -> bool:
        return self._connected

    # ─── Write Operations (Non-Blocking) ───

    async def insert_audit_log(self, data: Dict[str, Any]) -> Optional[str]:
        """
        Insert an audit log entry. Non-blocking on failure.

        Args:
            data: Dict matching AuditLogEntry schema

        Returns:
            Inserted document ID string, or None on failure
        """
        return await self._safe_insert("audit_logs", data)

    async def insert_market_snapshot(self, data: Dict[str, Any]) -> Optional[str]:
        """Insert a market state snapshot. Non-blocking on failure."""
        return await self._safe_insert("market_snapshots", data)

    async def insert_portfolio_checkpoint(self, data: Dict[str, Any]) -> Optional[str]:
        """Insert a portfolio checkpoint. Non-blocking on failure."""
        return await self._safe_insert("portfolio_checkpoints", data)

    # ─── Read Operations ───

    async def get_latest_checkpoint(self) -> Optional[Dict[str, Any]]:
        """Retrieve the most recent portfolio checkpoint for crash recovery."""
        if not self._connected or not self.db:
            return None
        try:
            doc = await self.db.portfolio_checkpoints.find_one(
                sort=[("checkpoint_at", -1)]
            )
            return doc
        except Exception as e:
            log.error(f"DatabaseManager: Failed to read checkpoint: {e}")
            return None

    async def get_audit_logs(
        self, limit: int = 100, event_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Retrieve recent audit logs, optionally filtered by event type."""
        if not self._connected or not self.db:
            return []
        try:
            query = {"event_type": event_type} if event_type else {}
            cursor = self.db.audit_logs.find(query).sort("timestamp", -1).limit(limit)
            return await cursor.to_list(length=limit)
        except Exception as e:
            log.error(f"DatabaseManager: Failed to read audit logs: {e}")
            return []

    # ─── Internal Helpers ───

    async def _safe_insert(
        self, collection: str, data: Dict[str, Any]
    ) -> Optional[str]:
        """Insert with graceful failure handling."""
        if not self._connected or not self.db:
            log.debug(f"DatabaseManager: Skipping insert to {collection} (not connected)")
            return None
        try:
            result = await self.db[collection].insert_one(data)
            return str(result.inserted_id)
        except Exception as e:
            log.error(f"DatabaseManager: Insert failed on {collection} (non-blocking): {e}")
            return None


# ─── Module-level singleton ───
db_manager = DatabaseManager()
