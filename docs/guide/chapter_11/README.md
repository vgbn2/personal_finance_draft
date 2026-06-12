# Chapter 11 - Storage And Cache Design

## Goal

This chapter explains how the system stores runtime data and why storage ownership matters.

The platform does not only fetch data. It needs to keep it, reread it, compare freshness, and avoid confusing generated artifacts with source code.

## What You Are Building

You are building a storage model that distinguishes:

- source code
- config
- runtime cache
- generated indexes
- analysis artifacts

## Prerequisite Concepts

You should already understand:

- normalized provider output
- repo folder ownership
- source vs generated files

## Language Proficiency Required

- JavaScript/Node.js: beginner
- File-system concepts: beginner

## Library And Tool Requirements

- Node.js
- file I/O

## Beginner Translation Box

- `cache`: a saved local copy of data
- `artifact`: a generated output such as a report or model file
- `freshness`: how recent the stored data is
- `integrity`: whether required data exists and matches expected rules

## Why Storage Needs Structure

If you throw all runtime output into one folder, you create three problems:

- later code cannot find what it needs predictably
- users cannot tell important files from disposable ones
- cleanup becomes risky

Structured storage is part of maintainability.

## Recommended Runtime Roots

At a beginner level, think in these buckets:

```text
storage/data/cache/
storage/data/ts/
storage/data/models/
storage/data/backtests/
```

These are runtime or generated paths. They are not hand-written source code.

## Cache Partitions

Partitioning means grouping cached data by a meaningful owner, such as:

- provider
- market family
- timeframe
- symbol

Example:

```text
storage/data/cache/example_provider/BTCUSDT_1d.json
```

That is much easier to inspect than one giant mixed file.

## Freshness vs Integrity

These are not the same.

Freshness asks:

- how recent is the data?

Integrity asks:

- does the required data exist and satisfy structural rules?

A cache can be structurally healthy but stale. A cache can also be current in one symbol and missing another entirely.

That distinction becomes important in later status and validation commands.

## Text Files And Binary Indexes

You may store some runtime data as JSON because it is easy to inspect.

You may store larger time-series data as a binary or indexed form because:

- it is faster to read
- it uses less space
- it supports heavier workloads better

The beginner rule is simple:

- start with readable storage
- move to indexed storage only when the need is clear

## Minimum Working Slice

The minimum slice for this chapter:

- one cache file written to a stable path
- one script that reads it back
- one status summary showing rows and last timestamp

That proves the data survives beyond one command run.

## Step-By-Step Build

1. Write normalized data to `storage/data/cache/`.
2. Add a read-back script.
3. Print record count and latest timestamp.
4. Add one integrity check that the file exists and contains an array.

## Contracts And Interfaces

Storage code should guarantee:

- predictable paths
- stable serialization format
- clear difference between hand-written and generated paths
- status checks that describe stored data honestly

Do not make callers guess where data ended up.

## Tests And Verification

Run:

```powershell
node backend\scripts\ingest_example.js
node backend\scripts\read_cache_example.js
```

Expected outcome:

- the cache file exists
- the read-back script prints record count
- the latest timestamp matches the newest record in the cache

## Expected File Tree

```text
storage/
  data/
    cache/
      example_provider/
        BTCUSDT_1d.json
```

Later expansions may add:

```text
storage/data/ts/
storage/data/models/
storage/data/backtests/
```

## Common Failure Modes

- source code is written into `storage/`
  Fix: source belongs in `backend/`, `shared/`, `config/`, or `tests/`.
- cache files land in random temp folders
  Fix: use owned runtime roots.
- user assumes cache freshness means total system health
  Fix: separate freshness from integrity.

## Do Not Build Yet

- large binary-index implementations
- cache compaction jobs
- remote object storage
- multi-machine synchronization

## Checkpoint Exercise

Delete the cache file, rerun the ingest script, and confirm the system recreates it cleanly. Then explain why that is acceptable for runtime data but not acceptable for source code.

## Done Criteria

This chapter is done when you can explain:

- why runtime data needs stable paths
- why cache and source code are different classes of files
- the difference between freshness and integrity
- why readable storage comes before optimized storage
