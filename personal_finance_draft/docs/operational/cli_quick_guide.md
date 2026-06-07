# CLI Quick Guide

The CLI lives in `backend/cli/sovereign_cli.js`.

## First Commands

```powershell
cd C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft
.\sv.ps1 help
.\sv.ps1 status
.\sv.ps1 cockpit
node backend\cli\sovereign_cli.js help
node backend\cli\sovereign_cli.js help commands
node backend\cli\sovereign_cli.js help backtest
node backend\cli\sovereign_cli.js help indicators
node backend\cli\sovereign_cli.js help examples
```

## Main Commands

- `status`: show phase, cache, and data-quality status
- `ingest`: pull the latest market snapshot
- `check` or `validate`: inspect the current cache and data quality
- `backfill`: build historical cache for backtests
- `indicators` or `features`: generate feature rows
- `models` or `model compare`: compare model candidates
- `bt` or `backtest`: run the backtest
- `optimize`: search indicator periods against backtest metrics
- `demo`: run the sample research flow end to end

## Useful Flags

- `--sample`: use deterministic sample bars instead of live data
- `--sample-size N`: change sample size
- `--timeframe 1d|1h|5m|...`: choose the bar timeframe
- `--from YYYY-MM-DD`: start date filter
- `--to YYYY-MM-DD`: end date filter
- `--train-ratio 0.7`: split in-sample vs out-of-sample
- `--fee-bps N`: per-side fee assumption
- `--slippage-bps N`: per-side slippage assumption
- `--tail-alpha 0.05`: tail-risk confidence level
- `--monte-carlo-runs N`: Monte Carlo stress runs
- `--json`: machine-readable output
- `--no-pager`: print help text directly

## Example Runs

```powershell
.\sv.ps1 status
.\sv.ps1 cockpit
.\sv.ps1 check --strict
node backend\cli\sovereign_cli.js status
node backend\cli\sovereign_cli.js check --strict
node backend\cli\sovereign_cli.js backfill --timeframe 1d --days 365 --include-prediction --relevance-floor 0.30
node backend\cli\sovereign_cli.js bt --input storage\data\cache\backtest_history.json --timeframe 1d
node backend\cli\sovereign_cli.js bt --sample --sample-size 1000 --train-ratio 0.7 --timeframe 1d
node backend\cli\sovereign_cli.js optimize --sample --sample-size 1000 --train-ratio 0.7 --timeframe 1d
```

## Output Metrics

- `max_drawdown`
- `sharpe_ratio`
- `sortino_ratio`
- `win_rate`
- `expected_value`
- `tail_risk`
- `monte_carlo`
- `oos_expected_value`
- `oos_net_return`
