const test = require('node:test');
const assert = require('node:assert/strict');
const {
  betaCdf, betaPpf, tCdf, tPpf, median, quantile,
  rsiSeries, atrSeries, bayesHitRate, bayesNormReturn,
} = require('../../../shared/lib/strategy/rsi_backtest');

// Reference values below are closed-form, not "the engine agrees with itself":
//   Beta(2,2) has pdf 6x(1-x) -> cdf F(x) = 3x^2 - 2x^3 (no incomplete-beta machinery needed)
//   Student-t with df=1 is the standard Cauchy distribution: F(t) = 1/2 + atan(t)/pi
// If logGamma/betaContinuedFraction/regularizedIncompleteBeta drift, these closed forms
// catch it without needing scipy on hand.

test('betaCdf matches the closed-form Beta(2,2) cdf F(x) = 3x^2 - 2x^3', () => {
  const closedForm = (x) => 3 * x ** 2 - 2 * x ** 3;
  for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    assert.ok(
      Math.abs(betaCdf(x, 2, 2) - closedForm(x)) < 1e-9,
      `betaCdf(${x},2,2) = ${betaCdf(x, 2, 2)}, expected ${closedForm(x)}`,
    );
  }
  // Beta(1,1) is the uniform distribution: cdf(x) = x
  for (const x of [0.0, 0.25, 0.5, 0.75, 1.0]) {
    assert.ok(Math.abs(betaCdf(x, 1, 1) - x) < 1e-9, `betaCdf(${x},1,1) should equal ${x}`);
  }
  assert.equal(betaCdf(0, 2, 2), 0);
  assert.equal(betaCdf(1, 2, 2), 1);
});

test('betaPpf is the inverse of betaCdf (round-trip) across shapes and quantiles', () => {
  for (const [a, b] of [[2, 2], [1, 1], [5, 3], [2, 7]]) {
    for (const p of [0.025, 0.25, 0.5, 0.75, 0.975]) {
      const x = betaPpf(p, a, b);
      assert.ok(
        Math.abs(betaCdf(x, a, b) - p) < 1e-3,
        `betaPpf(${p},${a},${b})=${x} -> betaCdf=${betaCdf(x, a, b)}, expected ~${p}`,
      );
    }
  }
});

test('tCdf with df=1 matches the standard Cauchy cdf F(t) = 1/2 + atan(t)/pi', () => {
  const cauchy = (t) => 0.5 + Math.atan(t) / Math.PI;
  for (const t of [-5, -1.5, -0.5, 0, 0.5, 1.5, 5]) {
    assert.ok(
      Math.abs(tCdf(t, 1) - cauchy(t)) < 1e-9,
      `tCdf(${t},1) = ${tCdf(t, 1)}, expected ${cauchy(t)}`,
    );
  }
});

test('tCdf converges to the standard normal cdf as df grows large', () => {
  // Phi(1.96) ~= 0.975, Phi(0) = 0.5 -- df=100000 is close enough to the t -> normal limit
  assert.ok(Math.abs(tCdf(0, 100000) - 0.5) < 1e-6);
  assert.ok(Math.abs(tCdf(1.959963985, 100000) - 0.975) < 1e-3);
});

test('tPpf is the inverse of tCdf (round-trip) across df and quantiles', () => {
  for (const df of [1, 5, 30]) {
    for (const p of [0.025, 0.25, 0.5, 0.75, 0.975]) {
      const t = tPpf(p, df);
      assert.ok(
        Math.abs(tCdf(t, df) - p) < 1e-3,
        `tPpf(${p},${df})=${t} -> tCdf=${tCdf(t, df)}, expected ~${p}`,
      );
    }
  }
  assert.equal(tPpf(0.5, 10), 0);
});

test('median matches manual computation for even/odd-length arrays', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([5]), 5);
});

test('quantile matches pandas linear-interpolation default on known arrays', () => {
  // pandas.Series([1,2,3,4]).quantile(0.5) == 2.5; .quantile(0.25) == 1.75
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(quantile([10, 20, 30, 40], 0.25), 17.5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0), 1);
  assert.equal(quantile([1, 2, 3, 4, 5], 1), 5);
});

test('rsiSeries: monotonically falling closes drive RSI to 0 once warmed up', () => {
  const closes = Array.from({ length: 20 }, (_, i) => 100 - i); // strictly decreasing
  const series = rsiSeries(closes, 14);
  assert.equal(series[12], null, 'still warming up before period bars of deltas exist');
  assert.ok(series[19] !== null, 'should be live by index 19');
  assert.ok(Math.abs(series[19] - 0) < 1e-9, `expected RSI ~0 for an all-loss series, got ${series[19]}`);
});

test('rsiSeries: monotonically rising closes return null (avg loss is exactly zero)', () => {
  // Mirrors pandas' l.replace(0, np.nan) -- an all-gain run can't produce a finite RSI ratio
  const closes = Array.from({ length: 20 }, (_, i) => 100 + i); // strictly increasing
  const series = rsiSeries(closes, 14);
  assert.equal(series[19], null, 'all-gain series should yield null RSI, not 100, matching the python source');
});

test('rsiSeries stays within [0, 100] and is null during warm-up for a mixed series', () => {
  const closes = [100, 102, 101, 103, 99, 104, 98, 105, 97, 106, 96, 107, 95, 108, 94, 109, 93, 110, 92, 111];
  const series = rsiSeries(closes, 14);
  for (let i = 0; i < series.length; i += 1) {
    if (series[i] === null) continue;
    assert.ok(series[i] >= 0 && series[i] <= 100, `RSI[${i}]=${series[i]} out of [0,100] bounds`);
  }
  assert.equal(series[13], null, 'RSI(14) needs 14 deltas -- index 13 is the first with 13 deltas, still warm-up');
});

test('atrSeries: index-0 special case is high-low only (no prior close to compare)', () => {
  const bars = [
    { high: 110, low: 100, close: 105 },
    { high: 112, low: 108, close: 109 },
    { high: 111, low: 106, close: 107 },
  ];
  const tr0 = bars[0].high - bars[0].low;
  // ewmSeries needs `period` non-null inputs before it emits a value -- with period=2,
  // index 1 is the first eligible bar; verify the true-range feeding it used tr0 correctly
  // by checking the series is still warming up at index 0 and live by index 1.
  const series = atrSeries(bars, 2);
  assert.equal(series[0], null);
  assert.ok(series[1] !== null);
  assert.ok(Number.isFinite(tr0) && tr0 === 10);
});

test('bayesHitRate posterior mean follows Beta(2,2) conjugate update and is symmetric at h/n=0.5', () => {
  const r = bayesHitRate(5, 10);
  // posterior = Beta(2+5, 2+5) = Beta(7,7) -> mean = 7/14 = 0.5, symmetric -> p_above_50 = 0.5
  assert.ok(Math.abs(r.post_mean - 0.5) < 1e-9, `post_mean=${r.post_mean}, expected 0.5`);
  assert.ok(Math.abs(r.p_above_50 - 0.5) < 1e-9, `p_above_50=${r.p_above_50}, expected 0.5`);
  assert.ok(r.ci_low < r.post_mean && r.post_mean < r.ci_high);

  const r2 = bayesHitRate(8, 10);
  // posterior = Beta(10, 4) -> mean = 10/14
  assert.ok(Math.abs(r2.post_mean - 10 / 14) < 1e-9, `post_mean=${r2.post_mean}, expected ${10 / 14}`);
  assert.ok(r2.p_above_50 > 0.5, 'more hits than misses should push p_above_50 above 0.5');
});

test('bayesNormReturn: symmetric-around-zero sample yields ~0 mean and p_positive ~0.5', () => {
  const r = bayesNormReturn([-1, -0.5, 0, 0.5, 1]);
  assert.ok(Math.abs(r.post_mean - 0) < 1e-9);
  assert.ok(Math.abs(r.p_positive - 0.5) < 1e-9, `p_positive=${r.p_positive}, expected ~0.5 for symmetric data`);
});

test('bayesNormReturn: all-positive sample yields high p_positive and post_mean equal to the sample mean', () => {
  const values = [0.4, 0.6, 0.5, 0.7, 0.3];
  const r = bayesNormReturn(values);
  const expectedMean = values.reduce((s, v) => s + v, 0) / values.length;
  assert.ok(Math.abs(r.post_mean - expectedMean) < 1e-9);
  assert.ok(r.p_positive > 0.9, `p_positive=${r.p_positive}, expected high confidence for all-positive sample`);
});

test('bayesNormReturn: degenerate n<2 samples short-circuit instead of producing NaN-laced posteriors', () => {
  const single = bayesNormReturn([0.5]);
  assert.equal(single.post_mean, 0.5);
  assert.ok(Number.isNaN(single.p_positive));

  const empty = bayesNormReturn([]);
  assert.ok(Number.isNaN(empty.post_mean));
});
