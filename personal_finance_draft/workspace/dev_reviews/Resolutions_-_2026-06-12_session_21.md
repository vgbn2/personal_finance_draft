## Resolutions - 2026-06-12 session 21

- C++ verification table finding #2 (indicators default --input, main.cpp:522): STALE -- already
  fixed in `e0ad1ff7` (equities-partition default + missing-file guard). Verified by probe (default
  run produces real output; explicit --input unchanged) + ctest -C Debug 29/29. No code change.
- NEW centralization backlog item: `polymarket_backtest.js` duplicates the ~45-line orderbook-lite
  fallback capture block 3x (gammaSkipped / empty-series / no-entry branches). Extract a
  `captureFallbackWindows(market, tokenId, opts)` helper. Effort S. From the integrated Codex slice
  (`1f6b5e45`); functional, tests green -- drift containment only.
- NEW durable finding (fixed for crypto, latent elsewhere): provider chains break on first success
  and TwelveData (first/early in equities, indices, commodities, crypto chains) silently caps
  history at 5,000 bars. Crypto deep path now pins binance via `options.provider` (`c3fbc3ba`).
  Equities/indices/commodities deep backfills will hit the same wall when implemented.

