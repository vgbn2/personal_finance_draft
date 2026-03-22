"""
Shared pytest fixtures for the polymarket_screener test suite.
"""
import asyncio
import pytest


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
