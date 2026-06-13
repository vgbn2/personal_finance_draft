## Session Memory - 2026-06-06 Gamma backtest fix + runner hardening

{
  "work": "Fixed polymarket backtest (was returning marketsScanned:0), hardened persistent runners, added label cleanup",
  "root_causes_diagnosed": [
    "Gamma resolved markets: `clobTokenIds` is a JSON-encoded STRING, not array. `tokens` field is absent. `yesTokenId()` was calling Array.isArray on a string (falsy) â†’ returned null for every market.",
    "`tag_slug=crypto` returns 2020 era markets (Biden/Airbnb), which are filtered out by 90-day date filter. Must use `tag_id=21` for crypto 2023+.",
    "CLOB price history returns 0 points for resolved tokens â€” need Gamma `outcomePrices` as synthetic fallback.",
    "Winner field `market.winner` does not exist on resolved Gamma markets. Must infer from `bestAsk` (>=0.9 â†’ YES) or `outcomePrices` JSON string."
  ],
  "implemented": [
    "shared/lib/polymarket_history.js: yesTokenId() handles JSON string clobTokenIds; fetchResolvedGammaMarkets uses tag_id=21 + order=end_date_iso; new inferWinner(), gammaFinalPrice() helpers.",
    "polymarket_backtest.js: Gamma fallback for empty CLOB history; uses inferWinner for winner; gammaFallbacks counter.",
    "trade.js: --category replaced with --tag-id (numeric), default --days 365.",
    "manifest.js: label cleanup (Prediction Markets, Persistent Runners); backtest flags fixed (--tag-id + days:365).",
    "run_loop.js: healthyAt timestamp per successful tick; getStatus annotates stale:true + staleForSec.",
    "polymarket_paper.js: checkAndCloseResolvedPositions() - scans open positions vs Gamma, closes resolved at inferredprice, credits balance, writes resolved_positions.jsonl.",
    "run.js: paper bot tick calls checkAndCloseResolvedPositions before paper cycle.",
    "backend/api/server/routes/run_status.js + index.js: GET /api/run/status endpoint."
  ],
  "verification": [
    "node --test tests/scripts/tests/polymarket_backtest.test.js â†’ 12/12 pass (includes Gamma fallback integration test)",
    "node --test tests/scripts/tests/run_loop.test.js â†’ 6/6 pass",
    "All modules load clean: node -e require(...) â†’ OK"
  ],
  "open_debt": [
    "checkAndCloseResolvedPositions has no unit test (needs 2: resolvedâ†’close, activeâ†’skip).",
    "_inferYesResolutionPrice in polymarket_paper.js:223 duplicates inferWinner from shared lib â€” should import instead.",
    "GAMMA_BASE defined in both polymarket_paper.js and polymarket_history.js â€” export from shared.",
    "Gateway grade stays C until duplication cleared."
  ],
  "cautions": [
    "Gamma API shape for resolved markets: no `tokens`, no `winner`, `clobTokenIds` is a JSON string. `outcomePrices` is a JSON string `[yesPrice, noPrice]`. `bestAsk` for YES token signals resolution direction.",
    "CLOB /prices-history always returns 0 points for resolved tokens â€” Gamma outcomePrices fallback is the only data source for these markets.",
    "tag_id=21 = crypto 2023+. tag_slug=crypto returns old 2020 prediction markets (Biden/Airbnb) â€” do not use."
  ]
}

