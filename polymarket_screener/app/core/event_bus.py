"""
Lightweight async Event Bus for cross-module publish/subscribe messaging.

Channels:
  MARKET_UPDATE   — New market data tick arrived
  WINDOW_ROLLED   — Master clock transitioned to new window
  SIGNAL_DETECTED — Strategy emitted a trade signal
  TRADE_EXECUTED  — Broker filled an order
  RISK_ALERT      — Circuit breaker or risk gate tripped
"""
import asyncio
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from app.utils.logger import log


class Channel(str, Enum):
    """Well-known event bus channels."""
    MARKET_UPDATE = "MARKET_UPDATE"
    WINDOW_ROLLED = "WINDOW_ROLLED"
    SIGNAL_DETECTED = "SIGNAL_DETECTED"
    TRADE_EXECUTED = "TRADE_EXECUTED"
    RISK_ALERT = "RISK_ALERT"


class EventBus:
    """
    Async publish/subscribe message router.

    Usage:
        bus = EventBus()

        # Subscriber
        queue = asyncio.Queue()
        bus.subscribe(Channel.MARKET_UPDATE, queue)
        msg = await queue.get()

        # Publisher
        await bus.publish(Channel.MARKET_UPDATE, {"price": 0.55})
    """

    def __init__(self):
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}
        self._callbacks: Dict[str, List[Callable]] = {}

    def subscribe(self, channel: str, queue: asyncio.Queue) -> None:
        """Register a queue to receive messages on a channel."""
        if channel not in self._subscribers:
            self._subscribers[channel] = []
        self._subscribers[channel].append(queue)
        log.debug(f"EventBus: subscriber added to [{channel}]")

    def unsubscribe(self, channel: str, queue: asyncio.Queue) -> None:
        """Remove a queue from a channel."""
        if channel in self._subscribers:
            self._subscribers[channel] = [
                q for q in self._subscribers[channel] if q is not queue
            ]

    def on(self, channel: str, callback: Callable) -> None:
        """Register a callback function for a channel (fire-and-forget)."""
        if channel not in self._callbacks:
            self._callbacks[channel] = []
        self._callbacks[channel].append(callback)

    async def publish(self, channel: str, message: Any) -> int:
        """
        Publish a message to all subscribers on a channel.
        Returns the number of subscribers that received the message.
        """
        delivered = 0

        # Queue-based subscribers
        if channel in self._subscribers:
            for queue in self._subscribers[channel]:
                try:
                    await queue.put(message)
                    delivered += 1
                except Exception as e:
                    log.warning(f"EventBus: failed to deliver to queue on [{channel}]: {e}")

        # Callback-based subscribers
        if channel in self._callbacks:
            for callback in self._callbacks[channel]:
                try:
                    result = callback(message)
                    if asyncio.iscoroutine(result):
                        await result
                    delivered += 1
                except Exception as e:
                    log.warning(f"EventBus: callback error on [{channel}]: {e}")

        return delivered

    @property
    def channel_count(self) -> int:
        """Number of active channels."""
        return len(set(list(self._subscribers.keys()) + list(self._callbacks.keys())))

    def subscriber_count(self, channel: str) -> int:
        """Number of subscribers on a specific channel."""
        queues = len(self._subscribers.get(channel, []))
        callbacks = len(self._callbacks.get(channel, []))
        return queues + callbacks


# Shared singleton instance
event_bus = EventBus()
