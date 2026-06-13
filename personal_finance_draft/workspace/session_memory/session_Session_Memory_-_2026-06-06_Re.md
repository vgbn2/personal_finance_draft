## Session Memory - 2026-06-06 Resilient crypto fallback + auto-backfill + ingest shard

{
  "work": "Fixed silently-failing multi-provider crypto fallback, added settings-gated background auto-backfill, sharded ingest_market_data into a folder (partial)",
  "root_causes_diagnosed": [
    "fetchCryptoSnapshot dual-path: historyDays>5 detours binance/coinbase through Yahoo (COINBASE_PRODUCTS map); <=5 hits Binance/Coinbase direct (geo-fragile, 451). Routine short refreshes used the fragile path.",
    "shared/lib/providers/coingecko.js existed (keyless, geo-resilient) but was NEVER wired into the crypto provider chain.",
    "When all providers failed for a symbol, ingest logged a non-fatal error and mergeSnapshots preserved stale cache -> silent multi-year freeze (SUI 732d, PEPE 1273d, POL 949d). backend integrity showed only 'stale', never WHY."
  ],
  "implemented": [
    "coingecko.js: fetchCoinGeckoBaseCandles (OHLCV synthesized from /market_chart daily prices; open=high=low=close=price, volume from total_volumes) + resolveCoinGeckoId with COINGECKO_ID_OVERRIDES (deterministic ids; strips USDT/USD suffix).",
    "ingest_market_data fetchCryptoSnapshot: coingecko dispatch branch (Math.max(historyDays,365) -> daily granularity).",
    "data_sources.yaml crypto providers: ...coinbase, coingecko, tradingview.",
    "backend.js runBackendIntegrity: reads last_fetch.json errors, tags stale rows provider_unreachable + summary.total_unreachable.",
    "settings.js: auto_backfill flag + trading.backfill_interval_min (1440 default); run.js run-all gates backfill loop on the flag, forward-gap-only.",
    "ingest_market_data.js (1944 lines) -> folder ingest_market_data/index.js + thin re-export shim at old path; extracted constants.js (zero-import leaf)."
  ],
  "verification": [
    "npm test -> 205/205 (was 202; +2 coingecko, +1 settings).",
    "LIVE: fetchCoinGeckoBaseCandles returns fresh data through 2026-06-06 for POLUSDT/SUIUSDT/PEPEUSDT.",
    "Targeted backfill refreshed all 3; backend integrity stale 14->11 (zombies cleared, total_unreachable 0).",
    "shim + folder resolve 53 exports both ways; node --check clean on all touched JS."
  ],
  "cautions": [
    "CoinGecko /market_chart: days<=90 returns HOURLY points, days>90 returns DAILY. The dispatch uses Math.max(historyDays,365) so it gets daily granularity for the 1d cache. Free tier rate-limited (~10-50/min) â€” fine as last-resort + forward-gap-only.",
    "COINGECKO_ID_OVERRIDES is required because the auto symbol->id map keeps the LAST coin per symbol (collisions on pol/pepe). Add new universe symbols there.",
    "ingest_market_data is now a FOLDER: real code in ingest_market_data/index.js (relative requires are ../../../../shared, one deeper). Old ingest_market_data.js is a shim. data_sync.sh + CI --check point at index.js.",
    "Remaining ingest modules (http/normalize/symbols/providers/persist) NOT yet extracted â€” provider code is not unit-covered, so carve one-per-commit with a live ingest smoke. Task #6.",
    "FX (10 pairs) + VRE still stale; targeted FX backfill returned no sources/no errors -> Frankfurter/skip-path artifact, separate from the crypto fix. auto_backfill is the standing freshener."
  ],
  "dcs": 0.95
}

