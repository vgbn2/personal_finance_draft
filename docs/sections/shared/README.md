# Shared Domain Structure Map

Canonical structural map for the `shared/` subsystem of the Sovereign Trading Platform.

## Overview And Subsystems

The `shared/` directory contains modular platform libraries used across CLI, API, scripts, and background services.

```text
shared/
└── lib/
    ├── ai/         # RAG docs indexer & local LLM helpers
    ├── backfill.js # Cross-family market backfill helper
    ├── brokers/    # Broker runtime capability matrix
    ├── compat/     # Backward compatibility shims
    ├── data/       # Ingestion & macro store libraries
    ├── market/     # Time-series storage, coverage, quote router, validation
    ├── mcp/        # MCP gate security policy & agent access control
    ├── profiles/   # Prop firm profile management
    ├── providers/  # External data feed fetchers (Binance, Alpaca, Yahoo, etc.)
    ├── runtime/    # Environment pipeline, config loader, backend bridge
    ├── settings/   # Runtime policy & user settings helpers
    ├── strategy/   # Walk-forward backtester, RSI reversal, position sizing
    ├── supabase/   # Supabase client & error classification helpers
    └── ui/         # ANSI formatting & terminal presentation helpers
```

## Active Subsystem Entrypoints

1. **Market & Time-Series Data (`shared/lib/market/`):**
   - Binary Float64 Storage: `shared/lib/market/ts_index_storage.js`
   - Market Validation & Coverage: `shared/lib/market/validation.js`, `shared/lib/market/coverage.js`
   - Configured Universe: `shared/lib/market/configured_universe.js`
   - Quote Router: `shared/lib/market/quote_router.js`

2. **Strategy & Backtest Engine (`shared/lib/strategy/`):**
   - Walk-Forward Backtester: `shared/lib/strategy/backtest.js`
   - RSI Reversal Strategy: `shared/lib/strategy/rsi_backtest.js`
   - Risk & Position Sizing: `shared/lib/strategy/position_sizing.js`

3. **Runtime & Security (`shared/lib/runtime/`, `shared/lib/settings/`, `shared/lib/mcp/`):**
   - Runtime Security Policy: `shared/lib/settings/runtime_policy.js`
   - Centralized Environment Pipeline: `shared/lib/runtime/env_pipeline.js`, `shared/lib/runtime/env.js`
   - MCP Access Control Gate: `shared/lib/mcp/gate.js`

4. **AI & Documentation Retrieval (`shared/lib/ai/`):**
   - Documentation RAG Indexer: `shared/lib/ai/docs_rag_indexer.js`

## Code Atlas Cross-References

- Algorithm: Documentation TF-IDF Ranking — [`atlas.algorithm.documentation.tfidf-ranking`](../../atlas/algorithms/documentation/tfidf-ranking.md)
- Structure: RAG Index Payload — [`atlas.structure.documentation.rag-index-payload`](../../atlas/structures/documentation/rag-index-payload.md)
- Protocol: Corpus Selection — [`atlas.protocol.documentation.corpus-selection`](../../atlas/protocols/documentation/corpus-selection.md)
- Section: RSI Reversal Analysis — [`docs/sections/research/rsi-reversal-analysis/README.md`](../research/rsi-reversal-analysis/README.md)
