"""
Polymarket Simulator — Comprehensive Diagnostic Runner
Runs every subsystem check and logs ALL errors to tests/unit/error_log.txt
Usage:  python -m polymarket_sim.tests.unit.run_all_tests
"""
from __future__ import annotations
import asyncio, importlib, logging, os, sys, time, traceback
from pathlib import Path

# ── Setup error log ──────────────────────────────────────────
LOG_DIR  = Path(__file__).parent
LOG_FILE = LOG_DIR / "error_log.txt"

# Clear previous log
LOG_FILE.write_text(f"=== Diagnostic Run: {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n\n")

def _log(msg: str, *, ok: bool = True):
    tag = "✅" if ok else "❌"
    line = f"{tag} {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def _log_error(test_name: str, exc: Exception):
    tb = traceback.format_exc()
    _log(f"{test_name}: {exc}", ok=False)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(tb + "\n")


# ═══════════════════════════════════════════════════════════════
#  TEST 1 — Import Health
# ═══════════════════════════════════════════════════════════════
def test_imports():
    modules = [
        "polymarket_sim.core.config",
        "polymarket_sim.core.dns",
        "polymarket_sim.core.logger",
        "polymarket_sim.core.database",
        "polymarket_sim.data.rest_client",
        "polymarket_sim.data.ws_client",
        "polymarket_sim.market.matching_engine",
        "polymarket_sim.analysis.portfolio",
        "polymarket_sim.analysis.strategy_grader",
        "polymarket_sim.engine",
    ]
    for mod in modules:
        try:
            importlib.import_module(mod)
            _log(f"Import {mod}")
        except Exception as e:
            _log_error(f"Import {mod}", e)


# ═══════════════════════════════════════════════════════════════
#  TEST 2 — DNS Resolution
# ═══════════════════════════════════════════════════════════════
async def test_dns():
    try:
        from polymarket_sim.core.dns import resolve_ip
        ip = await resolve_ip("gamma-api.polymarket.com")
        _log(f"DNS resolve gamma-api.polymarket.com -> {ip}")
    except Exception as e:
        _log_error("DNS Resolution", e)

    try:
        from polymarket_sim.core.dns import resolve_ip
        ip = await resolve_ip("ws-subscriptions-clob.polymarket.com")
        _log(f"DNS resolve ws-subscriptions-clob -> {ip}")
    except Exception as e:
        _log_error("DNS Resolution (WS)", e)


# ═══════════════════════════════════════════════════════════════
#  TEST 3 — REST API Connectivity
# ═══════════════════════════════════════════════════════════════
async def test_rest_api():
    try:
        from polymarket_sim.data.rest_client import GammaAPIClient
        client = GammaAPIClient()
        data = await client.search_markets("bitcoin", limit=1)
        await client.close()
        _log(f"REST API search returned {len(data)} result(s)")
    except Exception as e:
        _log_error("REST API Connectivity", e)


# ═══════════════════════════════════════════════════════════════
#  TEST 4 — WebSocket Handshake (connect + immediate disconnect)
# ═══════════════════════════════════════════════════════════════
async def test_ws_handshake():
    try:
        from polymarket_sim.core.dns import resolve_ip
        from polymarket_sim.core import config
        import urllib.parse, ssl, websockets

        parsed = urllib.parse.urlparse(config.WS_URL)
        hostname = parsed.hostname
        ip = await resolve_ip(hostname)
        new_netloc = parsed.netloc.replace(hostname, ip)
        connect_url = parsed._replace(netloc=new_netloc).geturl()
        ssl_ctx = ssl.create_default_context()

        async with websockets.connect(
            connect_url, ssl=ssl_ctx, server_hostname=hostname,
            close_timeout=5, open_timeout=10,
        ) as ws:
            await ws.close()
        _log("WebSocket handshake to Polymarket CLOB succeeded")
    except Exception as e:
        _log_error("WebSocket Handshake", e)


# ═══════════════════════════════════════════════════════════════
#  TEST 5 — Matching Engine (unit)
# ═══════════════════════════════════════════════════════════════
def test_matching_engine():
    try:
        from polymarket_sim.market.matching_engine import MatchingEngine
        me = MatchingEngine()
        _log("MatchingEngine instantiation OK")
    except Exception as e:
        _log_error("MatchingEngine", e)


# ═══════════════════════════════════════════════════════════════
#  TEST 6 — Database Write/Read
# ═══════════════════════════════════════════════════════════════
async def test_database():
    try:
        from polymarket_sim.core.database import TradeDatabase
        db = TradeDatabase()
        await db.connect()
        sid = await db.start_session("DiagTest", 1000.0)
        _log(f"Database in-memory session #{sid} created")
        await db.close()
    except Exception as e:
        _log_error("Database", e)


# ═══════════════════════════════════════════════════════════════
#  RUNNER
# ═══════════════════════════════════════════════════════════════
async def _async_main():
    await test_dns()
    await test_rest_api()
    await test_ws_handshake()
    await test_database()

def main():
    print("=" * 60)
    print("  POLYMARKET SIMULATOR — DIAGNOSTIC SUITE")
    print("=" * 60)
    print(f"  Log file: {LOG_FILE}\n")

    test_imports()
    test_matching_engine()
    asyncio.run(_async_main())

    print("\n" + "=" * 60)
    print(f"  Done. Full error log: {LOG_FILE}")
    print("=" * 60)

if __name__ == "__main__":
    main()
