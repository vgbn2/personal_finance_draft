# Project Journal

## Empirical Validation Log

### Plan 1.4: Parquet Storage Cache
**Criteria**: The Async `TimeSeriesStore` must listen to `EventBus` and correctly flush a `pandas` DataFrame to parquet when threshold is met.
**Evidence**:
```bash
python -m app.core.storage
# Output:
# [03/22/26 12:08:40] INFO Parquet Storage started (flush threshold=5)       
# INFO Flushed 5 ticks to BTC-MOCK_20260322_050840_to_050840.parquet
# [03/22/26 12:08:41] INFO Parquet Storage stopping — flushing buffers
# INFO Flushed 1 ticks to BTC-MOCK_20260322_050840_to_050840.parquet
```

### Plan 2.2: Master Clock & Sequence Handler
**Criteria**: The `WindowSequenceHandler` must manage target schedules, wait, emit `warming_up`, and then transition to `active`.
**Evidence**:
```bash
python -m app.core.clock
# Output:
# [03/22/26 12:10:03] INFO     Clock: Background sequencer started         
# Waiting for warm-up...
# State after 2s (warming up): next=MKT-1, active=None
# Waiting for rollover...
# State after 5s (rolled): next=MKT-1, active=MKT-1
# [03/22/26 12:10:08] INFO     Clock: Sequencer stopped
# [OK] Master Clock sequence verified.
```

### Plan 2.3: Portfolio Tracker
**Criteria**: `PortfolioManager` must record entries internally based on incoming fills and track real-time P&L changes relative to MtM.
**Evidence**:
```bash
python -m app.core.portfolio
# Output:
# [03/22/26 12:12:58] INFO     Portfolio Manager started   
# INFO Portfolio: Added position MKT-TEST_BUY_YES @ 0.500 ($200)
# --- Portfolio Summary ---
# Cash:   $900.00
# MKT-TEST_BUY_YES: entry=0.500 cur=0.600 pnl=$20.00 (20.0%)
# Equity: $1,020.00 (Total PnL: $20.00)                
# DEBUG: cash=900.0, pnl=20.0
# [OK] Portfolio tracker verified.
```

### Plan 2.3: Market Screener
**Criteria**: `MarketScreener` must interpret incoming Ticks, derive fair probability from Black-Scholes module, and compute safety Kelly allocation.
**Evidence**:
*Note: Empirical Verification immediately exposed two kwarg mismatch bugs with Black Scholes and Kelly Criterion, which were successfully resolved in real-time.*
```bash
python -m app.core.screener
# Output:
# [03/22/26 12:13:54] INFO     Market Screener started   
# INFO Screener SIGNAL: BUY_YES MOCK_EDG... edge=5.0% alloc=4.9%                
# [OK] Screener evaluated snapshot successfully.
```
