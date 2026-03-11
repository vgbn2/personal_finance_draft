"""
Tests for Shadow Matching Engine.
"""

import asyncio
import pytest
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from polymarket_sim.market.matching_engine import MatchingEngine
from polymarket_sim.market.orderbook import Orderbook
from polymarket_sim.core.models import Fill, OrderSide, OrderType, VirtualOrder


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def engine():
    return MatchingEngine(latency_ms=0)  # zero latency for tests


@pytest.fixture
def book():
    b = Orderbook("test-token")
    run(b.apply_snapshot(
        bids=[
            {"price": "0.50", "size": "100"},
            {"price": "0.49", "size": "200"},
            {"price": "0.48", "size": "300"},
        ],
        asks=[
            {"price": "0.52", "size": "100"},
            {"price": "0.53", "size": "200"},
            {"price": "0.54", "size": "300"},
        ],
    ))
    return b


class TestMarketOrders:
    def test_market_buy_fills_at_ask(self, engine, book):
        fills = []
        engine.on_fill(lambda f: fills.append(f))

        order = VirtualOrder(
            token_id="test-token",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            price=0.52,
            size=50,
        )
        order.submitted_at = time.time() - 1  # already past latency

        engine.submit_order(order)
        engine.process_tick(book)

        assert len(fills) == 1
        assert fills[0].price == pytest.approx(0.52)
        assert fills[0].size == pytest.approx(50)
        assert fills[0].side == OrderSide.BUY

    def test_market_buy_vwap_multi_level(self, engine, book):
        fills = []
        engine.on_fill(lambda f: fills.append(f))

        order = VirtualOrder(
            token_id="test-token",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            price=0.52,
            size=200,  # 100@0.52 + 100@0.53
        )
        order.submitted_at = time.time() - 1

        engine.submit_order(order)
        engine.process_tick(book)

        assert len(fills) == 1
        expected_vwap = (0.52 * 100 + 0.53 * 100) / 200
        assert fills[0].price == pytest.approx(expected_vwap)

    def test_market_sell_fills_at_bid(self, engine, book):
        fills = []
        engine.on_fill(lambda f: fills.append(f))

        order = VirtualOrder(
            token_id="test-token",
            side=OrderSide.SELL,
            order_type=OrderType.MARKET,
            price=0.50,
            size=50,
        )
        order.submitted_at = time.time() - 1

        engine.submit_order(order)
        engine.process_tick(book)

        assert len(fills) == 1
        assert fills[0].price == pytest.approx(0.50)

    def test_empty_book_rejects(self, engine):
        empty_book = Orderbook("empty")
        fills = []
        engine.on_fill(lambda f: fills.append(f))

        order = VirtualOrder(
            token_id="empty",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            price=0.50,
            size=100,
        )
        order.submitted_at = time.time() - 1

        engine.submit_order(order)
        engine.process_tick(empty_book)

        assert len(fills) == 0


class TestLimitOrders:
    def test_limit_buy_fills_when_ask_below(self, engine, book):
        fills = []
        engine.on_fill(lambda f: fills.append(f))

        # Limit buy at 0.52 → should fill since best ask is 0.52
        order = VirtualOrder(
            token_id="test-token",
            side=OrderSide.BUY,
            order_type=OrderType.LIMIT,
            price=0.52,
            size=50,
        )
        order.submitted_at = time.time() - 1

        engine.submit_order(order)
        engine.process_tick(book)

        assert len(fills) == 1
        assert fills[0].price == pytest.approx(0.52)

    def test_limit_buy_rests_when_ask_above(self, engine, book):
        fills = []
        engine.on_fill(lambda f: fills.append(f))

        # Limit buy at 0.51 → best ask is 0.52, should not fill
        order = VirtualOrder(
            token_id="test-token",
            side=OrderSide.BUY,
            order_type=OrderType.LIMIT,
            price=0.51,
            size=50,
        )
        order.submitted_at = time.time() - 1

        engine.submit_order(order)
        engine.process_tick(book)

        assert len(fills) == 0
        assert engine.open_order_count == 1

    def test_limit_sell_fills_when_bid_above(self, engine, book):
        fills = []
        engine.on_fill(lambda f: fills.append(f))

        # Limit sell at 0.50 → should fill since best bid is 0.50
        order = VirtualOrder(
            token_id="test-token",
            side=OrderSide.SELL,
            order_type=OrderType.LIMIT,
            price=0.50,
            size=50,
        )
        order.submitted_at = time.time() - 1

        engine.submit_order(order)
        engine.process_tick(book)

        assert len(fills) == 1


class TestLatency:
    def test_latency_delays_fill(self):
        engine = MatchingEngine(latency_ms=5000)  # 5s latency
        book = Orderbook("test")
        run(book.apply_snapshot(
            [{"price": "0.50", "size": "100"}],
            [{"price": "0.52", "size": "100"}],
        ))

        fills = []
        engine.on_fill(lambda f: fills.append(f))

        order = VirtualOrder(
            token_id="test",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            price=0.52,
            size=50,
        )

        engine.submit_order(order)
        engine.process_tick(book)

        # Should NOT fill yet — latency not elapsed
        assert len(fills) == 0
        assert engine.open_order_count == 1
