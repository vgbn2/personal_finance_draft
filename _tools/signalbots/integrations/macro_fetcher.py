"""
Sentinel-MT5 — Macro Economic Data Fetcher
============================================
Auto-fetches interest rates, GDP, and CPI from the
FRED API (Federal Reserve Economic Data).

FRED is free, covers all major economies, and is the
gold standard for economic data in quant finance.

Get your free API key: https://fred.stlouisfed.org/docs/api/api_key.html

Resilience
----------
  - 24-hour cache (macro data changes monthly, not per-tick)
  - Static fallback if FRED is unreachable
  - Graceful degradation: uses last-known values on failure
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from core.config import Config

log = logging.getLogger("sentinel.macro")

# Cache file persists across restarts
_CACHE_FILE = Path(__file__).parent / ".macro_cache.json"
_CACHE_TTL = 86400  # 24 hours in seconds


# ── FRED Series IDs ───────────────────────────────────────────
# Each currency maps to FRED series for rate, GDP growth, and CPI

FRED_SERIES: dict[str, dict[str, str]] = {
    "USD": {
        "rate": "FEDFUNDS",           # Federal Funds Rate
        "gdp":  "A191RL1Q225SBEA",    # US Real GDP Growth (QoQ annualized)
        "cpi":  "CPIAUCSL",           # US CPI-U (index, compute YoY)
    },
    "EUR": {
        "rate": "ECBMLFR",            # ECB Main Refinancing Rate
        "gdp":  "CLVMNACSCAB1GQEA19", # Euro Area Real GDP
        "cpi":  "CP0000EZ19M086NEST", # Euro Area HICP
    },
    "GBP": {
        "rate": "INTGSTGBM193N",      # UK Treasury Bill Rate (proxy)
        "gdp":  "NAEXKP01GBQ189S",    # UK Real GDP
        "cpi":  "GBRCPIALLMINMEI",    # UK CPI
    },
    "JPY": {
        "rate": "INTGSTJPM193N",      # Japan Interest Rate
        "gdp":  "NAEXKP01JPQ189S",    # Japan Real GDP
        "cpi":  "JPNCPIALLMINMEI",    # Japan CPI
    },
    "AUD": {
        "rate": "INTGSTAUM193N",      # Australia Interest Rate
        "gdp":  "NAEXKP01AUQ189S",    # Australia Real GDP
        "cpi":  "AUSCPIALLMINMEI",    # Australia CPI
    },
    "CAD": {
        "rate": "INTGSTCAM193N",      # Canada Interest Rate
        "gdp":  "NAEXKP01CAQ189S",    # Canada Real GDP
        "cpi":  "CANCPIALLMINMEI",    # Canada CPI
    },
    "CHF": {
        "rate": "INTGSTCHM193N",      # Switzerland Interest Rate
        "gdp":  "NAEXKP01CHQ189S",    # Switzerland Real GDP
        "cpi":  "CHECPIALLMINMEI",    # Switzerland CPI
    },
}

# ── Static Fallback ───────────────────────────────────────────
# Used when FRED is unreachable (last known values)

STATIC_FALLBACK: dict[str, dict] = {
    "USD": {"rate": 5.25, "gdp_yoy": 2.8, "cpi_yoy": 3.1, "bias": 1},
    "EUR": {"rate": 4.50, "gdp_yoy": 0.5, "cpi_yoy": 2.4, "bias": 0},
    "GBP": {"rate": 5.25, "gdp_yoy": 0.1, "cpi_yoy": 4.0, "bias": 1},
    "JPY": {"rate": 0.25, "gdp_yoy": 1.9, "cpi_yoy": 2.8, "bias": -2},
    "AUD": {"rate": 4.35, "gdp_yoy": 1.5, "cpi_yoy": 3.4, "bias": 0},
    "CAD": {"rate": 5.00, "gdp_yoy": 1.1, "cpi_yoy": 2.9, "bias": 0},
    "CHF": {"rate": 1.75, "gdp_yoy": 0.7, "cpi_yoy": 1.4, "bias": -1},
}


class MacroFetcher:
    """
    Fetches macro economic data from FRED API with caching.

    Usage::

        fetcher = MacroFetcher()
        data = fetcher.get_all()
        # data = {"USD": {"rate": 5.25, "gdp_yoy": 2.8, "cpi_yoy": 3.1, "bias": 1}, ...}
    """

    def __init__(self) -> None:
        self._api_key = Config.FRED_API_KEY
        self._cache: dict = {}
        self._cache_time: float = 0.0
        self._load_cache_from_disk()

    # ══════════════════════════════════════════════════════════
    # Public API
    # ══════════════════════════════════════════════════════════

    def get_all(self) -> dict[str, dict]:
        """
        Get macro data for all currencies.
        Returns cached data if fresh, otherwise fetches from FRED.
        Falls back to static data on failure.
        """
        now = time.time()

        # Return cache if still fresh
        if self._cache and (now - self._cache_time) < _CACHE_TTL:
            return self._cache

        # No API key → use static fallback
        if not self._api_key:
            log.warning(
                "⚠️ FRED_API_KEY not set — using static fallback. "
                "Get a free key: https://fred.stlouisfed.org/docs/api/api_key.html"
            )
            self._cache = STATIC_FALLBACK.copy()
            self._cache_time = now
            return self._cache

        # Fetch from FRED
        log.info("🌍 Fetching macro data from FRED API...")
        data: dict[str, dict] = {}

        for ccy, series in FRED_SERIES.items():
            try:
                rate = self._fetch_latest(series["rate"])
                gdp = self._fetch_latest(series["gdp"])
                cpi_now = self._fetch_latest(series["cpi"])
                cpi_prev = self._fetch_latest(series["cpi"], offset=12)

                # Compute CPI YoY
                if cpi_now and cpi_prev and cpi_prev > 0:
                    cpi_yoy = ((cpi_now - cpi_prev) / cpi_prev) * 100
                else:
                    cpi_yoy = STATIC_FALLBACK.get(ccy, {}).get("cpi_yoy", 0.0)

                # GDP comes as growth rate already for some series
                gdp_yoy = gdp if gdp is not None else (
                    STATIC_FALLBACK.get(ccy, {}).get("gdp_yoy", 0.0)
                )

                rate_val = rate if rate is not None else (
                    STATIC_FALLBACK.get(ccy, {}).get("rate", 0.0)
                )

                # Compute bias from fundamentals
                bias = self._compute_bias(rate_val, gdp_yoy, cpi_yoy)

                data[ccy] = {
                    "rate": round(rate_val, 2),
                    "gdp_yoy": round(gdp_yoy, 2),
                    "cpi_yoy": round(cpi_yoy, 2),
                    "bias": bias,
                    "updated": datetime.now(timezone.utc).isoformat(),
                }

                log.info(
                    "  %s: rate=%.2f%% GDP=%.1f%% CPI=%.1f%% bias=%+d",
                    ccy, rate_val, gdp_yoy, cpi_yoy, bias,
                )

            except Exception as exc:
                log.warning("  %s: FRED fetch failed (%s) — using fallback", ccy, exc)
                data[ccy] = STATIC_FALLBACK.get(ccy, {}).copy()

        self._cache = data
        self._cache_time = now
        self._save_cache_to_disk()

        log.info("✅ Macro data updated for %d currencies", len(data))
        return self._cache

    def get_currency(self, ccy: str) -> dict:
        """Get macro data for a single currency."""
        all_data = self.get_all()
        return all_data.get(ccy, STATIC_FALLBACK.get(ccy, {}))

    # ══════════════════════════════════════════════════════════
    # FRED API
    # ══════════════════════════════════════════════════════════

    def _fetch_latest(
        self,
        series_id: str,
        offset: int = 0,
    ) -> float | None:
        """
        Fetch the latest value from a FRED series.

        Parameters
        ----------
        series_id : str
            FRED series identifier.
        offset : int
            Number of observations back from latest (0 = most recent).

        Returns
        -------
        float or None if fetch fails.
        """
        url = "https://api.stlouisfed.org/fred/series/observations"
        params = {
            "series_id": series_id,
            "api_key": self._api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": max(1, offset + 1),
        }

        try:
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            obs = resp.json().get("observations", [])

            if len(obs) > offset:
                val = obs[offset].get("value", ".")
                if val != ".":  # FRED uses "." for missing data
                    return float(val)
        except requests.RequestException as exc:
            log.debug("FRED request failed for %s: %s", series_id, exc)
        except (ValueError, KeyError, IndexError):
            pass

        return None

    # ══════════════════════════════════════════════════════════
    # Bias Computation
    # ══════════════════════════════════════════════════════════

    @staticmethod
    def _compute_bias(rate: float, gdp: float, cpi: float) -> int:
        """
        Derive hawkish/dovish bias from fundamentals.

        Returns
        -------
        int in [-2, +2]:
          +2 = very hawkish (high rates + high CPI + strong GDP)
          +1 = mild hawkish
           0 = neutral
          -1 = mild dovish
          -2 = very dovish (low rates + low CPI + weak GDP)
        """
        score = 0.0

        # Interest rate component (higher = more hawkish)
        if rate >= 5.0:
            score += 1.5
        elif rate >= 3.0:
            score += 0.5
        elif rate >= 1.0:
            score -= 0.5
        else:
            score -= 1.5

        # CPI component (higher = more hawkish pressure)
        if cpi >= 4.0:
            score += 1.0
        elif cpi >= 2.5:
            score += 0.3
        elif cpi >= 1.5:
            score -= 0.3
        else:
            score -= 0.5

        # GDP component (stronger = supports hawkish)
        if gdp >= 2.5:
            score += 0.5
        elif gdp >= 1.0:
            score += 0.0
        else:
            score -= 0.5

        # Quantize to [-2, +2]
        if score >= 2.0:
            return 2
        elif score >= 0.8:
            return 1
        elif score >= -0.8:
            return 0
        elif score >= -2.0:
            return -1
        else:
            return -2

    # ══════════════════════════════════════════════════════════
    # Disk Cache (persists across restarts)
    # ══════════════════════════════════════════════════════════

    def _load_cache_from_disk(self) -> None:
        """Load cached macro data from disk."""
        if _CACHE_FILE.is_file():
            try:
                with open(_CACHE_FILE, "r") as f:
                    saved = json.load(f)
                self._cache = saved.get("data", {})
                self._cache_time = saved.get("time", 0.0)
                age_hours = (time.time() - self._cache_time) / 3600
                log.info(
                    "📂 Loaded macro cache from disk (%.1f hours old, %d currencies)",
                    age_hours, len(self._cache)
                )
            except Exception:
                pass

    def _save_cache_to_disk(self) -> None:
        """Persist cache to disk."""
        try:
            with open(_CACHE_FILE, "w") as f:
                json.dump({"data": self._cache, "time": self._cache_time}, f, indent=2)
            log.debug("Macro cache saved to %s", _CACHE_FILE)
        except Exception as exc:
            log.warning("Failed to save macro cache: %s", exc)
