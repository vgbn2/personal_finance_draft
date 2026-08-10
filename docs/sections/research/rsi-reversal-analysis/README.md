# RSI Reversal Analysis

> **Status:** Implemented as local research analysis; it is not an execution, promotion, provider, paper, or live-trading authorization path.
> **Audience:** quantitative researchers and maintainers of local RSI signal analysis.
> **Canonical owner:** `shared/lib/strategy/rsi_backtest.js`.
> **Review triggers:** RSI/ATR smoothing, event definitions, horizon/cost assumptions, Bayesian priors, trust tiers, OOS split, actionable-signal schema.

## Purpose And Boundary

This module analyzes historical RSI threshold events for one asset/timeframe and produces statistically qualified research candidates. It ports the core local analysis loop from the RSI-reversal notebook into JavaScript so cached bars can be analyzed without a Python runtime or external market fetch.

It does not implement the platform-wide backtest engine, trade execution, provider refresh, or automatic strategy promotion. Its `DEPLOY` label is an internal research tier, not authority to submit an order. Downstream automation remains subject to independent policy, freshness, authorization, risk, and execution gates.

## Inputs And Preconditions

`analyzeSeries()` accepts ascending OHLCV bars with timestamp, open, high, low, close, and volume fields plus a timeframe, forward measurement horizon, regime moving-average period, optional OOS date, and round-trip cost fraction.

The function returns `null` before analysis when fewer than three RSI periods of bars are available. It assumes bars are already locally available and chronologically ordered; it neither fetches nor persists market data.

Current default constants include RSI/ATR periods of 14, oversold/overbought thresholds of 30/70, a five-signal summary floor, a Beta(2,2) hit-rate prior, a 0.10% cost fraction, and an OOS cutoff of 2023-01-01. Callers that need comparable results must record any override of those assumptions.

## Indicator And Event Semantics

The analyzer uses full-series Wilder-style smoothing via a running numerator/denominator form equivalent to an adjusted exponential weighted mean with alpha `1 / period`. It intentionally does not reuse point-in-time indicator helpers because the historical event timing must match the notebook contract.

`rsiSeries()` returns null during warm-up and when average loss is zero; it does not manufacture an RSI of 100 for all-gain runs. `atrSeries()` computes true range and uses the same smoothing. `regimeSeries()` labels each bar bull, bear, or unknown from a moving average whose warm-up is one quarter of the requested period, with a minimum of ten bars.

Four event groups are measured:

- oversold crossover: RSI crosses below 30, evaluated as a long outcome;
- overbought crossover: RSI crosses above 70, evaluated as a short outcome;
- oversold recovery: RSI crosses back above 30 after an oversold episode;
- overbought recovery: RSI crosses back below 70 after an overbought episode.

Zone duration is precomputed forward for entry crossovers and backward for recoveries. This produces one event at a zone boundary rather than repeatedly counting an extended in-zone stay.

## Outcome Measurement And Dependence

For each event with a complete forward horizon, `measureOutcomes()` records raw return, net return after cost, maximum favorable excursion, maximum adverse excursion, ATR percentage, and ATR-normalized equivalents.

Long outcomes use forward price appreciation; short outcomes use forward price decline. Normalization divides return by contemporaneous ATR percentage, allowing comparison across timeframes and volatility regimes. Each row retains the regime and zone-duration bucket.

Nearby events can share the same forward measurement window. `countClusters()` therefore estimates effective event count by grouping signal positions separated by no more than the horizon. Trust tiers use both raw and effective counts, with additional conservatism for one-hour samples.

## Statistical Summary And Research Tiers

`summarize()` requires at least five measured events. It reports hit rate, normalized return distribution, payoff, Kelly fraction, expectancy, adverse-excursion stop evidence, net-of-cost estimates, and Bayesian uncertainty.

Hit-rate inference applies the Beta-binomial update:

`Beta(2 + hits, 2 + trials - hits)`.

The result includes a 95% credible interval and posterior probability that hit rate exceeds 50%. Normalized returns use a non-informative mean/variance prior, resulting in a Student-t posterior for the mean and probability of a positive mean. The module implements beta and Student-t CDF/quantile primitives locally using an incomplete-beta continued fraction and bisection; these are intended for small-sample signal evidence rather than a general statistics library.

Trust tiers are `DISCARD`, `LOW`, `MED`, and `HIGH`. A high tier requires at least 20 raw signals on daily-or-coarser timeframes. Verdicts combine Kelly, posterior net-positive probability, trust tier, and OOS agreement into `DEPLOY`, `CAUTION`, `SKIP`, `WEAK`, `MOMENTUM`, or `INSUFFICIENT` research labels.

## OOS And Actionable Output

`oosSplit()` partitions measured event rows at the configured date and summarizes in-sample and OOS rows separately. `extractActionable()` emits only crossover or recovery candidates whose source analysis is valid, whose tier is not discard, whose verdict is actionable, and whose OOS result is not explicitly degraded.

Output is sorted with `DEPLOY` ahead of `CAUTION`, then descending Kelly. Each result includes asset, timeframe, condition, entry type, event count, Kelly and quarter-Kelly, payoff, expectancy, ATR-based adverse excursion, net normalized return, posterior probabilities, trust tier, verdict, and OOS display state.

This filtering reduces false promotion but does not establish economic validity. An empty output is valid evidence that no candidate satisfied the research filter.

## Verification And Limits

Focused source evidence:

- `tests/scripts/strategy/rsi_backtest_primitives.test.js` checks indicator warm-up and bounds, Beta and Student-t primitives against closed-form or convergence references, quantile interpolation, and degenerate posterior behavior.
- `tests/scripts/strategy/rsi_backtest_analyze.test.js` uses a seeded OHLCV fixture to exercise the full RSI-to-ATR-to-crossover-to-summary-to-actionable pipeline, output schema, OOS filtering, and deterministic sort behavior.
- `docs/codebase_tour/07_testing_methodology.md` explains why the seeded fixture is preferable to volatile external data for this research contract.

These tests establish local source behavior. They do not prove a forecast, alpha, provider correctness, data freshness, native parity, paper performance, live performance, or deployment qualification.

## Change Checklist

1. Preserve the notebook-comparison contract or document any intentional divergence in smoothing, thresholds, horizons, costs, or OOS date.
2. Re-run primitive references when modifying special-function or posterior code.
3. Re-run the seeded end-to-end fixture when modifying events, outcome measurement, trust, or output sorting.
4. Keep `DEPLOY` and `CAUTION` labeled as research outputs; never use them as execution authorization.
5. Preserve null/insufficient evidence instead of fabricating confidence values.
6. Review the output schema with every downstream consumer before changing field names or units.
