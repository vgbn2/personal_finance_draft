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
- **Flexibility**: Trade Desk now supports both Quantity-based and USD-based sizing.
- **Risk Integration**: Sizing suggestions leverage your risk profile configurations.
