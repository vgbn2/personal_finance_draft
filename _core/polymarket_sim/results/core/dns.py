"""
Polymarket Paper Trading Simulator — Custom DNS Resolver
Bypasses broken system DNS (e.g. 127.0.2.2) by querying Google/Cloudflare directly via dnspython.
"""

from __future__ import annotations

import asyncio
import logging
import socket
from typing import Any, Dict, List, Optional

import dns.resolver
from aiohttp.abc import AbstractResolver

logger = logging.getLogger(__name__)

# Public DNS servers to use (Google, Cloudflare)
# Public DNS servers to use (Google, Cloudflare)
NAMESERVERS = ["1.1.1.1", "1.0.0.1", "8.8.8.8"]


class GoogleDNSResolver(AbstractResolver):
    """
    aiohttp-compatible resolver that uses dnspython to query 1.1.1.1 directly.
    Bypasses the OS getaddrinfo() which can be broken by local proxies.
    """

    def __init__(self):
        self._resolver = dns.resolver.Resolver()
        # Cloudflare WARP friendly: Use 1.1.1.1 as primary
        self._resolver.nameservers = NAMESERVERS
        self._resolver.timeout = 5.0
        self._resolver.lifetime = 5.0
        logger.info("🌍 Initialized Custom DNS Resolver using %s", NAMESERVERS)

    async def resolve(
        self, host: str, port: int = 0, family: int = socket.AF_INET
    ) -> List[Dict[str, Any]]:
        """
        Resolve host to IP using dnspython (sync) in a thread executor.
        Returns format compatible with aiohttp / socket.getaddrinfo.
        """
        loop = asyncio.get_running_loop()

        try:
            # Delegate blocking DNS call to thread pool
            answers = await loop.run_in_executor(None, self._resolve_sync, host)
        except Exception as exc:
            logger.error("DNS Resolution failed for %s: %s", host, exc)
            raise OSError(f"DNS lookup failed for {host}") from exc

        hosts = []
        for rdata in answers:
            hosts.append({
                "hostname": host,
                "host": rdata.address,
                "port": port,
                "family": family,
                "proto": 0,
                "flags": 0,
            })

        return hosts

    def _resolve_sync(self, host: str):
        """Blocking dnspython call."""
        return self._resolver.resolve(host, "A")

    async def close(self):
        pass


HEADER_RESOLVER_INSTANCE: Optional[GoogleDNSResolver] = None


def get_resolver() -> GoogleDNSResolver:
    """Singleton accessor for the custom resolver."""
    global HEADER_RESOLVER_INSTANCE
    if HEADER_RESOLVER_INSTANCE is None:
        HEADER_RESOLVER_INSTANCE = GoogleDNSResolver()
    return HEADER_RESOLVER_INSTANCE


async def resolve_ip(host: str) -> str:
    """
    Helper to resolve a hostname to a single IP string (IPv4).
    Useful for websockets or other non-aiohttp libs.
    """
    resolver = get_resolver()
    try:
        hosts = await resolver.resolve(host, 443)
        if hosts:
            return hosts[0]["host"]
    except Exception:
        pass
    # Fallback or raise
    raise OSError(f"Could not resolve {host} via custom DNS")
