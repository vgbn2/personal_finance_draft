# CLI Features & Interactive Tools

This document outlines the advanced CLI features available in the Sovereign Trading Platform.

## Correlation Matrix Tool

`backend correlation` calculates a local matrix over selected symbols and a timeframe. The canonical source and preflight contract is [Correlation Analysis](../../sections/research/correlation-analysis/README.md).

- **Multi-symbol selection:** in a rich terminal, the command can open the asset picker; otherwise pass `--symbols AAPL,MSFT,SPY`.
- **Minimum coverage:** at least two symbols need 30 or more dates and a non-empty shared calendar-date intersection.
- **No-overlap response:** the command returns a coverage table and `no_common_correlation_dates` rather than silently using unrelated or stale fallback data.
- **Conservative repair:** pass `--drop-non-overlap` only when intentionally accepting removal of blockers; otherwise remove symbols or choose a broader timeframe.
- **Methods:** `auto`, `pearson-returns`, `fx-returns`, and `pearson-levels` remain available. Automatic FX returns apply only to all-FX selections.

The command reads local storage and creates a temporary focused snapshot for the native backend. It does not refresh providers or repair canonical cache data.

### Strategy Management
- **Interactive Menu**: Run `strategy interactive` to manage and toggle strategy statuses.
- **Execution**: Directly trigger backtests from the strategy TUI.

## Position Sizing

- **Internal Polymarket paper engine**: supports `notional`, `units`, and `risk_budget` sizing.
- **Safety caps**: normalized paper orders round down to the paper quantity step and are capped by virtual cash
  and `--max-position-usd`.
- **Risk sizing**: `risk_budget` treats `--size` as the maximum virtual-dollar loss at `--stop-price`.
- **Auditability**: the requested intent, price, raw quantity, normalized shares, rounding rule, binding caps,
  and projected notional are stored in the canonical paper ledger.
- **Boundary**: contract and lot calculations exist in the shared normalizer, but Polymarket paper orders reject
  those modes. MT5 lot execution and cross-broker live sizing remain unavailable.

Examples:

```bash
# Allocate up to $5 per paper position.
sovereign polymarket paper-run --sizing-mode notional --size 5 --max-position-usd 5 --json

# Request 20 shares, still capped at $5 and available virtual cash.
sovereign polymarket paper-run --sizing-mode units --size 20 --max-position-usd 5 --json

# Risk at most $1 if the paper price falls to 0, with a $5 position cap.
sovereign polymarket paper-run --sizing-mode risk_budget --size 1 --stop-price 0 --max-position-usd 5 --json

# Run the same policy persistently; this remains internal paper mode.
sovereign run bot paper --sizing-mode notional --size 5 --max-position-usd 5
```
