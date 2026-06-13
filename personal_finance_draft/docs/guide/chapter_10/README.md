# Chapter 10 - Data Ingestion Layer

## Goal

This chapter explains how data enters the system in a controlled way.

The main idea is simple: before the platform can analyze, backtest, or trade anything, it needs trustworthy input. That input should arrive through clear provider boundaries, not through ad hoc scripts with random output shapes.

## What You Are Building

You are building a small ingestion path that can:

- ask one provider for data
- normalize the returned shape
- write that normalized data to local storage
- expose enough evidence that later layers can trust it

## Prerequisite Concepts

You should already understand:

- the scaffold layout
- config loading
- JSON output
- local-first and paper-safe boundaries

## Language Proficiency Required

- JavaScript/Node.js: beginner to intermediate
- HTTP concepts: beginner
- PowerShell: beginner

## Library And Tool Requirements

- Node.js
- fetch or provider SDK support
- file system access

## Beginner Translation Box

- `provider`: a module that knows how to talk to one external data source
- `normalize`: convert inconsistent source data into one standard internal shape
- `candle`: a time-bucketed record, often with open, high, low, close, and volume
- `backfill`: fetching older history to populate storage

## Why The Provider Boundary Matters

Different sources return data in different formats.

One source might return:

```json
{"t": 1710000000, "o": 1, "h": 2, "l": 0.5, "c": 1.5}
```

Another might return:

```json
{"time": 1710000000, "open": 1, "high": 2, "low": 0.5, "close": 1.5}
```

If the rest of the system has to understand every provider's quirks, the codebase spreads external inconsistency everywhere. The ingestion layer stops that spread.

## A Good Internal Shape

Pick one normalized shape and keep it stable.

Example:

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1d",
  "timestamp": 1710000000,
  "open": 1,
  "high": 2,
  "low": 0.5,
  "close": 1.5,
  "volume": 100,
  "source": "example_provider"
}
```

The goal is not to find the perfect shape on day one. The goal is to define one shape and stop the rest of the code from dealing with raw external payloads.

## Fake Provider First

Start with a fake provider before talking to real APIs.

Why:

- no network failures
- no keys
- no rate limits
- easier tests

Example fake provider behavior:

- returns three candles
- always uses the same symbol and timeframe
- returns a stable array

This is the fastest safe proof that your ingestion path works.

## Minimum Working Slice

The minimum slice for this chapter is:

- one provider module
- one command that calls it
- one normalized array of candles
- one output file written to local storage

That is enough to prove the ingestion architecture.

## Worked Example Reference

This chapter's runnable example files are:

```text
docs/guide/examples/minimal_sovereign/shared/lib/providers/example_provider.js
docs/guide/examples/minimal_sovereign/backend/scripts/ingest_example.js
docs/guide/examples/minimal_sovereign/storage/data/cache/
```

That example proves a full tiny path:

- fake provider returns normalized candles
- ingest script writes them to cache
- JSON summary confirms the write

## Suggested Paths

Example ownership:

```text
shared/lib/providers/example_provider.js
backend/scripts/ingest_example.js
storage/data/cache/example_provider/BTCUSDT_1d.json
```

The exact names can vary. The ownership should not.

## Step-By-Step Build

1. Create a provider module that returns hard-coded raw data.
2. Add a normalization function in the provider or a nearby shared helper.
3. Create a script that asks the provider for data.
4. Write the normalized output to `storage/data/cache/`.
5. Print a small JSON summary after the write completes.

## Contracts And Interfaces

The provider interface should guarantee:

- the caller requests symbol and timeframe
- the provider returns a predictable normalized array
- errors are raised clearly if data cannot be fetched or normalized

The caller should not need to know the provider's raw external field names.

## Tests And Verification

Run a script such as:

```powershell
node backend\scripts\ingest_example.js
```

Expected outcome:

- one file appears under `storage/data/cache/`
- the script prints a small JSON summary

Example:

```json
{
  "ok": true,
  "symbol": "BTCUSDT",
  "timeframe": "1d",
  "rows_written": 3
}
```

Worked-example evidence from this repo:

- `node backend\scripts\ingest_example.js` writes `BTCUSDT_1d.json`
- the summary reports `rows_written: 3`

## Broken Example

If the ingest script writes to a random folder outside `storage/data/cache/`, later chapters cannot find the data predictably.

That is not only inconvenient. It breaks the ownership model the rest of the guide depends on.

## Expected File Tree

```text
shared/
  lib/
    providers/
      example_provider.js
backend/
  scripts/
    ingest_example.js
storage/
  data/
    cache/
      example_provider/
        BTCUSDT_1d.json
```

## Common Failure Modes

- raw external fields leak into the rest of the code
  Fix: normalize immediately.
- the first provider requires real credentials
  Fix: start fake.
- the output path is random or temporary
  Fix: write into the owned storage subtree.
- the provider returns a shape that the rest of the repo did not agree on
  Fix: treat normalized output as a contract, not a suggestion.

## Do Not Build Yet

- multi-provider ranking
- aggressive retry logic
- complex rate-limit schedulers
- live trading decisions based on fresh fetched data

## Checkpoint Exercise

Change the fake provider to emit five candles instead of three. Then rerun the ingest script and confirm the output summary and file contents changed in the expected way.

## Done Criteria

This chapter is done when you can explain:

- what a provider is
- why normalization happens early
- why fake providers come before real ones
- where ingested data should be written
