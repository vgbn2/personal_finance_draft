"""
Tests for Orderbook operations.
"""

import asyncio
import pytest
import sys
from pathlib import Path

# Add parent dir to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from polymarket_sim.market.orderbook import Orderbook
from polymarket_sim.core.models import PriceLevel


@pytest.fixture
def book():
    return Orderbook("test-token-123")


def run(coro):
    """Helper to run async code in sync tests."""
    return asyncio.get_event_loop().run_until_complete(coro)


class TestSnapshot:
    def test_apply_snapshot_populates_bids_asks(self, book):
        bids = [
            {"price": "0.55", "size": "100"},
            {"price": "0.54", "size": "200"},
            {"price": "0.53", "size": "50"},
        ]
        asks = [
            {"price": "0.56", "size": "80"},
            {"price": "0.57", "size": "150"},
        ]
        run(book.apply_snapshot(bids, asks))

        assert book.best_bid == pytest.approx(0.55)
        assert book.best_ask == pytest.approx(0.56)
        assert len(book.get_bids(10)) == 3
        assert len(book.get_asks(10)) == 2

    def test_snapshot_replaces_previous(self, book):
        run(book.apply_snapshot(
            [{"price": "0.50", "size": "100"}],
            [{"price": "0.60", "size": "100"}],
        ))
        run(book.apply_snapshot(
            [{"price": "0.70", "size": "50"}],
            [{"price": "0.80", "size": "50"}],
        ))

        assert book.best_bid == pytest.approx(0.70)
        assert book.best_ask == pytest.approx(0.80)
        assert len(book.get_bids(10)) == 1

    def test_empty_book(self, book):
        assert book.best_bid is None
        assert book.best_ask is None
        assert book.mid_price is None
        assert book.spread is None


class TestDelta:
    def test_add_level(self, book):
        run(book.apply_snapshot(
            [{"price": "0.50", "size": "100"}],
            [{"price": "0.60", "size": "100"}],
        ))
        # Add a better bid
        run(book.apply_delta(0.55, 200, "BUY"))
        assert book.best_bid == pytest.approx(0.55)

    def test_update_level(self, book):
        run(book.apply_snapshot(
            [{"price": "0.50", "size": "100"}],
            [{"price": "0.60", "size": "100"}],
        ))
        # Update existing bid size
        run(book.apply_delta(0.50, 300, "BUY"))
        bids = book.get_bids(1)
        assert bids[0].size == pytest.approx(300)

    def test_remove_level(self, book):
        run(book.apply_snapshot(
            [{"price": "0.50", "size": "100"}, {"price": "0.49", "size": "50"}],
            [{"price": "0.60", "size": "100"}],
        ))
        # Remove the best bid (size=0)
        run(book.apply_delta(0.50, 0, "BUY"))
        assert book.best_bid == pytest.approx(0.49)


class TestSpread:
    def test_spread_calculation(self, book):
        run(book.apply_snapshot(
            [{"price": "0.45", "size": "100"}],
            [{"price": "0.55", "size": "100"}],
        ))
        assert book.spread == pytest.approx(0.10)

    def test_mid_price(self, book):
        run(book.apply_snapshot(
            [{"price": "0.45", "size": "100"}],
            [{"price": "0.55", "size": "100"}],
        ))
        assert book.mid_price == pytest.approx(0.50)


class TestWalkBook:
    def test_walk_single_level(self, book):
        run(book.apply_snapshot(
            [{"price": "0.50", "size": "100"}],
            [{"price": "0.55", "size": "200"}],
        ))
        result = book.walk_book("BUY", 50)
        assert result is not None
        vwap, filled = result
        assert vwap == pytest.approx(0.55)
        assert filled == pytest.approx(50)

    def test_walk_multiple_levels(self, book):
        run(book.apply_snapshot(
            [],
            [
                {"price": "0.55", "size": "100"},
                {"price": "0.56", "size": "100"},
                {"price": "0.57", "size": "100"},
            ],
        ))
        # Buy 200 shares → should fill 100@0.55 + 100@0.56
        result = book.walk_book("BUY", 200)
        assert result is not None
        vwap, filled = result
        assert vwap == pytest.approx((0.55 * 100 + 0.56 * 100) / 200)
        assert filled == pytest.approx(200)

    def test_walk_insufficient_depth(self, book):
        run(book.apply_snapshot(
            [],
            [{"price": "0.55", "size": "50"}],
        ))
        # Try to buy 200 but only 50 available
        result = book.walk_book("BUY", 200)
        assert result is not None
        vwap, filled = result
        assert filled == pytest.approx(50)

    def test_walk_empty_book(self, book):
        result = book.walk_book("BUY", 100)
        assert result is None

    def test_walk_sell_side(self, book):
        run(book.apply_snapshot(
            [
                {"price": "0.50", "size": "100"},
                {"price": "0.49", "size": "100"},
            ],
            [],
        ))
        # Sell 150 → 100@0.50 + 50@0.49
        result = book.walk_book("SELL", 150)
        assert result is not None
        vwap, filled = result
        assert vwap == pytest.approx((0.50 * 100 + 0.49 * 50) / 150)
        assert filled == pytest.approx(150)
