# Chapter 17 - Strategy And Backtesting

## Goal

This chapter explains how strategies are defined and evaluated without confusing research results with live execution readiness.

The strategy layer tells the system what idea it is testing. The backtest layer tells the system how that idea would have behaved under chosen assumptions. Neither one should be mistaken for a live trading approval.

## What You Are Building

You are building a strategy workflow that can:

- define a strategy clearly
- run it against historical data
- produce metrics
- separate research-grade output from execution-grade output

## Prerequisite Concepts

You should already understand:

- normalized data and cache paths
- provider and market layers
- paper vs live boundary

## Language Proficiency Required

- JavaScript/Node.js: intermediate
- Statistics concepts: beginner

## Library And Tool Requirements

- Node.js
- strategy registry helpers
- backtest helper code

## Beginner Translation Box

- `signal`: the rule that says buy, sell, hold, or do nothing
- `backtest`: replaying a strategy on historical data
- `metric`: a number used to evaluate results
- `out-of-sample`: data not used while tuning the strategy

## Why Strategy Logic Needs Structure

Without structure:

- every strategy encodes its own private assumptions
- operators cannot compare strategies consistently
- research and execution logic drift into one another

A strategy should be a readable object or module with a clear boundary.

## Strategy Definition

A beginner strategy definition should name:

- strategy name
- symbols or asset family
- timeframe
- required features or indicators
- signal rules

That definition can live in config, code, or a combination of both. The important part is that it is explicit.

## Backtesting Basics

A basic backtest loop:

1. load historical data
2. compute or read required features
3. generate strategy signals
4. simulate entries and exits
5. compute summary metrics

That loop should be reproducible. If the output changes for no explainable reason, the research path is not trustworthy.

## Metrics Do Not Equal Approval

Metrics might include:

- return
- hit rate
- drawdown
- number of trades
- average trade outcome

Useful metrics do not prove the strategy should go live. They only summarize what happened under the chosen assumptions.

## Minimum Working Slice

The minimum slice for this chapter:

- one simple strategy
- one historical dataset
- one backtest run
- one metrics summary

That is enough to prove the research loop exists.

## Step-By-Step Build

1. Define one simple strategy, such as RSI mean reversion.
2. Load one symbol and timeframe from local storage.
3. Generate a signal series.
4. Run a simple historical simulation.
5. Print a structured result summary.

## Contracts And Interfaces

The strategy and backtest surfaces should guarantee:

- strategy definitions are explicit
- backtest input data is known
- output metrics are structured
- research output is not silently reused as live execution approval

This protects the boundary between research and operations.

## Tests And Verification

Run:

```powershell
node backend\cli\sovereign_cli.js backtest --json
```

Expected outcome:

- the command loads historical data
- the strategy runs
- a structured result payload is printed

Example:

```json
{
  "ok": true,
  "strategy": "rsi_reversal",
  "trades": 12,
  "hit_rate": 0.58
}
```

## Expected File Tree

```text
config/
  strategies/
shared/
  lib/
    strategy/
      registry.js
      backtest.js
storage/
  data/
    backtests/
```

## Common Failure Modes

- a strategy is half config and half hidden magic
  Fix: make the strategy definition explicit.
- backtests use unclear data ranges
  Fix: include symbol, timeframe, and time window in output.
- users treat strong backtest metrics as go-live proof
  Fix: restate the boundary every time.

## Do Not Build Yet

- optimization sweeps
- massive parameter searches
- auto-promotion from backtest to execution

## Checkpoint Exercise

Describe one simple strategy idea and list the exact data inputs it would need before a backtest can even begin.

## Done Criteria

This chapter is done when you can explain:

- what a strategy definition contains
- what a backtest loop does
- why metrics matter
- why good backtest results do not equal live approval
