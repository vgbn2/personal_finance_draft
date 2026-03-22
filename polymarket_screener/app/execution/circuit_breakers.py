"""
Master Circuit Breaker system for emergency halt conditions.

Kill-switches that freeze all trading when:
  1. Extreme Volatility — IV spike > 300% on Deribit
  2. Heartbeat Failure — No price update for > 30 seconds
  3. Max Drawdown — Portfolio drawdown exceeds threshold
  4. Stale Data — Cross-exchange timestamp drift > tolerance

When ANY breaker trips, the system enters EMERGENCY_HALT mode:
  - All pending orders are cancelled
  - No new orders are accepted
  - An alert is published to the EventBus
"""
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Dict, List, Optional

from pydantic import BaseModel, Field

from app.utils.logger import log


class SystemState(str, Enum):
    """Engine operating states."""
    ACTIVE = "ACTIVE"
    HALTED = "HALTED"
    SHADOW = "SHADOW"       # Paper trading only
    RECOVERING = "RECOVERING"


class BreakerEvent(BaseModel):
    """Record of a circuit breaker trip."""
    breaker_name: str
    reason: str
    tripped_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    value: float = 0.0
    threshold: float = 0.0


class CircuitBreaker:
    """
    Single circuit breaker with configurable threshold and cooldown.

    Usage:
        cb = CircuitBreaker("VOLATILITY", threshold=3.0, cooldown_sec=300)
        if not cb.check(current_iv_ratio):
            # Breaker tripped — halt trading
    """

    def __init__(
        self,
        name: str,
        threshold: float,
        cooldown_sec: int = 300,
        description: str = "",
    ):
        self.name = name
        self.threshold = threshold
        self.cooldown_sec = cooldown_sec
        self.description = description or name

        self.is_tripped: bool = False
        self.trip_time: Optional[float] = None
        self.trip_count: int = 0
        self.last_event: Optional[BreakerEvent] = None

    def check(self, current_value: float) -> bool:
        """
        Check if current value exceeds threshold.

        Returns:
            True if safe, False if breaker should trip
        """
        # Auto-reset after cooldown
        if self.is_tripped and self.trip_time:
            elapsed = time.time() - self.trip_time
            if elapsed > self.cooldown_sec:
                self.reset()

        if current_value > self.threshold:
            self.trip(current_value,
                      f"{self.description}: {current_value:.4f} > {self.threshold:.4f}")
            return False
        return True

    def trip(self, value: float, reason: str) -> None:
        """Activate the breaker."""
        if not self.is_tripped:
            self.is_tripped = True
            self.trip_time = time.time()
            self.trip_count += 1
            self.last_event = BreakerEvent(
                breaker_name=self.name,
                reason=reason,
                value=value,
                threshold=self.threshold,
            )
            log.critical(f"CIRCUIT BREAKER [{self.name}] TRIPPED: {reason}")

    def reset(self) -> None:
        """Deactivate the breaker."""
        if self.is_tripped:
            self.is_tripped = False
            self.trip_time = None
            log.warning(f"Circuit breaker [{self.name}] reset after cooldown")


class MasterCircuitBreaker:
    """
    Aggregates all circuit breakers and controls system state.

    Usage:
        mcb = MasterCircuitBreaker()
        mcb.check_heartbeat(last_update_ts)
        mcb.check_volatility(iv_ratio)
        mcb.check_drawdown(current_dd)

        if mcb.state == SystemState.HALTED:
            cancel_all_orders()
    """

    def __init__(
        self,
        heartbeat_timeout_sec: float = 30.0,
        max_iv_ratio: float = 3.0,
        max_drawdown: float = 0.15,
        stale_data_ms: float = 500.0,
    ):
        self.state: SystemState = SystemState.ACTIVE
        self.trip_history: List[BreakerEvent] = []
        self._on_halt_callbacks: List[Callable] = []

        # Individual breakers
        self.heartbeat = CircuitBreaker(
            "HEARTBEAT",
            threshold=heartbeat_timeout_sec,
            cooldown_sec=60,
            description="No price update received",
        )
        self.volatility = CircuitBreaker(
            "VOLATILITY",
            threshold=max_iv_ratio,
            cooldown_sec=300,
            description="IV spike ratio",
        )
        self.drawdown = CircuitBreaker(
            "DRAWDOWN",
            threshold=max_drawdown,
            cooldown_sec=600,
            description="Portfolio drawdown",
        )
        self.stale_data = CircuitBreaker(
            "STALE_DATA",
            threshold=stale_data_ms,
            cooldown_sec=30,
            description="Cross-exchange timestamp drift (ms)",
        )

    def on_halt(self, callback: Callable) -> None:
        """Register a callback to fire when EMERGENCY_HALT is triggered."""
        self._on_halt_callbacks.append(callback)

    def _trigger_halt(self, event: BreakerEvent) -> None:
        """Internal halt trigger — sets state and fires callbacks."""
        if self.state != SystemState.HALTED:
            self.state = SystemState.HALTED
            self.trip_history.append(event)
            log.critical(
                f"EMERGENCY HALT: {event.breaker_name} - {event.reason}"
            )
            for cb in self._on_halt_callbacks:
                try:
                    cb(event)
                except Exception as e:
                    log.error(f"Halt callback error: {e}")

    def check_heartbeat(self, last_update_time: float) -> bool:
        """
        Check if we've received data recently.

        Args:
            last_update_time: Unix timestamp of last data update
        """
        elapsed = time.time() - last_update_time
        if not self.heartbeat.check(elapsed):
            self._trigger_halt(self.heartbeat.last_event)
            return False
        return True

    def check_volatility(self, iv_ratio: float) -> bool:
        """
        Check for IV spike (ratio of current IV to baseline).

        Args:
            iv_ratio: Current IV / baseline IV (e.g., 3.5 = 350%)
        """
        if not self.volatility.check(iv_ratio):
            self._trigger_halt(self.volatility.last_event)
            return False
        return True

    def check_drawdown(self, current_drawdown: float) -> bool:
        """
        Check portfolio drawdown level.

        Args:
            current_drawdown: Current drawdown as decimal (e.g., 0.12 = 12%)
        """
        if not self.drawdown.check(current_drawdown):
            self._trigger_halt(self.drawdown.last_event)
            return False
        return True

    def check_stale_data(self, drift_ms: float) -> bool:
        """
        Check cross-exchange timestamp drift.

        Args:
            drift_ms: Absolute timestamp difference in milliseconds
        """
        if not self.stale_data.check(drift_ms):
            self._trigger_halt(self.stale_data.last_event)
            return False
        return True

    def is_safe(self) -> bool:
        """Check if ALL breakers are clear."""
        return (
            not self.heartbeat.is_tripped
            and not self.volatility.is_tripped
            and not self.drawdown.is_tripped
            and not self.stale_data.is_tripped
        )

    def recover(self) -> bool:
        """
        Attempt to recover from HALTED state.
        Only succeeds if all breakers have auto-reset.
        """
        if self.is_safe():
            self.state = SystemState.ACTIVE
            log.warning("System recovered from HALT - all breakers clear")
            return True
        log.warning("Recovery failed - breakers still active")
        return False

    @property
    def status_report(self) -> Dict:
        """Current system safety status."""
        return {
            "state": self.state.value,
            "heartbeat_tripped": self.heartbeat.is_tripped,
            "volatility_tripped": self.volatility.is_tripped,
            "drawdown_tripped": self.drawdown.is_tripped,
            "stale_data_tripped": self.stale_data.is_tripped,
            "total_trips": len(self.trip_history),
        }


# ─── Module-level singleton ───
master_breaker = MasterCircuitBreaker()


if __name__ == "__main__":
    print("=== Circuit Breaker Self-Test ===")

    # All safe initially
    print(f"State: {master_breaker.state.value}")
    assert master_breaker.state == SystemState.ACTIVE

    # Heartbeat OK
    master_breaker.check_heartbeat(time.time() - 5)  # 5 seconds ago
    print(f"After 5s heartbeat: {master_breaker.state.value}")
    assert master_breaker.state == SystemState.ACTIVE

    # Volatility spike
    master_breaker.check_volatility(3.5)  # 350% IV ratio
    print(f"After vol spike: {master_breaker.state.value}")
    assert master_breaker.state == SystemState.HALTED

    # Reset for next test
    master_breaker.volatility.reset()
    master_breaker.state = SystemState.ACTIVE

    # Drawdown OK
    master_breaker.check_drawdown(0.10)  # 10% DD < 15% limit
    print(f"After 10% DD: {master_breaker.state.value}")
    assert master_breaker.state == SystemState.ACTIVE

    print(f"Status: {master_breaker.status_report}")
    print("[OK] All self-tests passed")
