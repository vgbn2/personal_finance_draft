# Chapter 12 - Market And Provider Layer

## Goal

This chapter explains the shared logic between raw provider output and higher-level features.

The ingestion chapter handled one provider. This chapter handles the layer that compares providers, validates market data, and gives the rest of the system one coherent view.

## What You Are Building

You are building a market layer that can:

- understand one normalized internal shape
- validate records
- infer or respect market families
- select one preferred source when more than one exists

## Prerequisite Concepts

You should already understand:

- provider normalization
- cache ownership
- config precedence

## Language Proficiency Required

- JavaScript/Node.js: intermediate
- Data normalization concepts: beginner

## Library And Tool Requirements

- Node.js
- shared helpers
- validation utilities

## Beginner Translation Box

- `market family`: a broad asset category such as crypto, equities, FX, or macro
- `validation`: checking whether a record is shaped correctly and contains believable values
- `router`: code that chooses which source or path to use

## Why This Layer Exists

Without a shared market layer:

- every command decides provider behavior differently
- every caller duplicates validation logic
- the repo cannot explain why one quote or candle source was chosen

A system like this needs one place where external market data becomes internal market truth.

## Validation Basics

Good validation checks may include:

- required fields exist
- timestamps are plausible
- prices are numeric
- `high` is not lower than `low`
- symbol and timeframe are present

Validation is not about perfection. It is about catching obviously broken records before they contaminate later layers.

## Market Families

Different asset classes have different quirks:

- crypto trades all day
- equities have market sessions
- macro series may behave more like point-in-time indicators than OHLCV bars

The market layer should either infer the family correctly or accept it from config. It should not force every downstream caller to rediscover the asset class.

## Provider Preference

When multiple providers can serve a symbol, the system needs a rule for preference.

That rule might depend on:

- configured priority
- completeness
- timestamp coverage
- venue-specific trust

The important part for a beginner implementation is not a perfect ranking formula. It is that the choice happens in one owned place.

## Minimum Working Slice

The minimum slice for this chapter:

- two fake providers return normalized records
- one router picks one winner
- one validation step rejects obviously broken records

That is enough to prove the market layer exists.

## Step-By-Step Build

1. Create two fake normalized sources.
2. Break one source intentionally, such as invalid high/low values.
3. Add validation that rejects the broken one.
4. Add simple preference logic for the surviving source.
5. Print the selected source in a summary payload.

## Contracts And Interfaces

The market layer should guarantee:

- callers receive one clean record set
- the selection reason is explainable
- invalid records do not silently win
- provider-specific field names are already gone

That last point is critical. Callers should operate on internal market concepts, not external API quirks.

## Tests And Verification

Run a script that compares the two fake providers and prints a chosen source.

Expected outcome:

- invalid records are rejected
- the valid source is selected
- output includes the chosen provider name

Example:

```json
{
  "ok": true,
  "selected_source": "example_provider_a",
  "rejected_sources": ["example_provider_b"]
}
```

Suggested invocation:

```powershell
node backend\scripts\compare_fake_providers.js
```

## Expected File Tree

```text
shared/
  lib/
    providers/
      example_provider_a.js
      example_provider_b.js
    market/
      quote_router.js
      validation.js
```

## Common Failure Modes

- provider-specific behavior leaks into commands
  Fix: centralize routing and validation.
- validation happens too late
  Fix: reject bad data before it becomes shared truth.
- source preference is scattered across modules
  Fix: keep selection in one router-owned surface.

## Do Not Build Yet

- sophisticated ranking formulas
- venue-specific microstructure modeling
- dozens of providers
- live order decisions based on unverified fresh quotes

## Checkpoint Exercise

Add a third fake provider with valid data but lower configured priority. Confirm the router still makes a deliberate choice and that you can explain why.

## Done Criteria

This chapter is done when you can explain:

- why validation belongs near the market layer
- why source selection should be centralized
- what a market family is
- why callers should not depend on raw external payload fields
