# CLI Features & Interactive Tools

This document outlines the advanced CLI features available in the Sovereign Trading Platform.

## Correlation Matrix Tool
The correlation tool allows you to perform multi-asset analysis to identify diversification opportunities.

### Interactive Selection
- **Multi-Symbol Search**: When running `backend correlation`, you can now use an interactive TUI to search and select multiple symbols.
- **Minimum Threshold**: The tool requires at least 2 symbols to generate a correlation matrix.
- **Output**: Generates a formatted table of Pearson correlation coefficients.

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
