# Storage Domain Structure Map

Canonical structural map for the `storage/` subsystem of the Sovereign Trading Platform.

## Overview And Subsystems

The `storage/` directory forms the local data plane, storing binary Float64 candle indices, partitioned market data caches, ML model artifacts, and paper trading ledgers.

```text
storage/
├── data/
│   ├── cache/                # Family-partitioned JSON market cache (crypto, equities, etc.)
│   ├── paper_trading/        # Local paper trading ledger & order event logs
│   ├── polymarket_history/   # Historical Polymarket archives & snapshot records
│   └── ts/                   # High-performance binary Float64 time-series index (.bin files)
└── models/                   # Model comparison, ONNX manifests & strategy grades
```

## Active Subsystem Entrypoints

1. **Binary Time-Series Index (`storage/data/ts/`):**
   - High-speed 48-byte packed Float64 candle binary storage (`{SYMBOL}_{TIMEFRAME}.bin`).
   - Managed by: `shared/lib/market/ts_index_storage.js` and `backend/core/src/data/binary_ts_reader.cpp`.

2. **Market Data Cache (`storage/data/cache/`):**
   - Partitioned by asset class (`cache/crypto/*.json`, `cache/equities/*.json`, `cache/fx/*.json`).
   - Managed by: `shared/lib/data/ingestion.js` and `shared/lib/market/validation.js`.

3. **Model Artifacts & Reports (`storage/models/`):**
   - Stores trained ONNX model files, serving manifests (`serving_manifest.txt`), and evaluation reports.

4. **Paper Trading Persistence (`storage/data/paper_trading/`):**
   - Immutable checksum-chained paper execution event ledger.
   - Managed by: `backend/gateway/src/paper_ledger.js`.

## Code Atlas Cross-References

- Polymarket History Archive — [`docs/sections/data/polymarket-history-archive/README.md`](../data/polymarket-history-archive/README.md)
- Storage Architecture Overview — [`docs/engineering/architecture/02_DATA_PIPELINE_AND_STORAGE.md`](../../engineering/architecture/02_DATA_PIPELINE_AND_STORAGE.md)
