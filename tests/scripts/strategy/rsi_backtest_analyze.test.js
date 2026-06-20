const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeSeries, extractActionable, isActionable, MIN_SIGNALS,
} = require('../../../shared/lib/strategy/rsi_backtest');

// End-to-end fixture: a seeded sine-wave + jitter price series that drives RSI
// through repeated oversold/overbought crossovers and recoveries, so
// analyzeSeries/extractActionable run their full real pipeline (rsi -> atr ->
// crossover detection -> outcome measurement -> Bayesian summarize -> verdict)
// against known, reproducible bars instead of a notebook pattern-match.

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSineBars({
  n, period, amplitude, base, jitterAmp, seed,
}) {
  const rand = mulberry32(seed);
  const startMs = Date.parse('2020-01-01T00:00:00Z');
  const dayMs = 86400000;
  const bars = [];
  for (let i = 0; i < n; i += 1) {
    const jitter = (rand() - 0.5) * 2 * jitterAmp;
    const close = base + amplitude * Math.sin((2 * Math.PI * i) / period) + jitter;
    const prevClose = i === 0 ? close : bars[i - 1].close;
    bars.push({
      timestamp: new Date(startMs + i * dayMs).toISOString(),
      open: prevClose,
      high: Math.max(close, prevClose) + 0.5,
      low: Math.min(close, prevClose) - 0.5,
      close,
      volume: 1000,
    });
  }
  return bars;
}

// seed=5 with these exact params reproducibly yields one actionable signal
// (overbought recovery, CAUTION, MED trust) -- pinned by direct probe of the
// engine. oosDate: null disables the IS/OOS split so the fixture (all dated
// 2020) doesn't depend on the engine's hardcoded OOS_DATE.
const FIXTURE_PARAMS = {
  n: 360, period: 32, amplitude: 18, base: 100, jitterAmp: 2, seed: 5,
};
const ANALYZE_OPTS = {
  timeframe: '1d', forwardBars: 2, regimeMaPeriod: 50, oosDate: null,
};

function analyze() {
  const bars = buildSineBars(FIXTURE_PARAMS);
  return analyzeSeries({ bars, ...ANALYZE_OPTS });
}

test('analyzeSeries returns the full shape extractActionable expects, over real fixture bars', () => {
  const a = analyze();
  assert.ok(a, 'analyzeSeries should not return null for a 360-bar fixture');
  assert.equal(a.tf, '1d');
  assert.equal(a.fwd, 2);
  assert.equal(a.bars, 360);
  for (const key of [
    'oversold', 'overbought', 'os_recovery', 'ob_recovery',
    'os_is', 'os_oos', 'ob_is', 'ob_oos',
    'os_rec_is', 'os_rec_oos', 'ob_rec_is', 'ob_rec_oos',
  ]) {
    assert.ok(key in a, `analysis missing expected key "${key}"`);
  }
});

test('analyzeSeries produces a fully-summarized bucket once enough crossovers accumulate', () => {
  const a = analyze();
  // The fixture's oscillation drives >= MIN_SIGNALS overbought-recovery crossings;
  // summarize() should have escaped its n < MIN_SIGNALS short-circuit.
  assert.ok(a.ob_recovery.n >= MIN_SIGNALS, `expected >= ${MIN_SIGNALS} ob_recovery signals, got ${a.ob_recovery.n}`);
  assert.equal(a.ob_recovery.ok, true);
  assert.ok(Number.isFinite(a.ob_recovery.kelly), 'kelly should be a finite number once payoff is computable');
  assert.ok(a.ob_recovery.hit_rate > 0 && a.ob_recovery.hit_rate < 1);
  assert.ok(a.ob_recovery.p_net_pos >= 0 && a.ob_recovery.p_net_pos <= 1);
});

test('extractActionable surfaces exactly the deterministic signal this fixture produces, with the correct schema', () => {
  const a = analyze();
  const actionable = extractActionable([{ asset: 'TEST', analysis: a }]);

  assert.equal(actionable.length, 1, `expected exactly one actionable signal, got ${JSON.stringify(actionable)}`);
  const [sig] = actionable;

  assert.equal(sig.asset, 'TEST');
  assert.equal(sig.timeframe, '1d');
  assert.equal(sig.condition, 'overbought');
  assert.equal(sig.entry, 'recovery');
  assert.equal(sig.trust, 'MED');
  assert.equal(sig.verdict, '🟡 CAUTION');
  assert.equal(sig.n, 13);

  // Numeric fields pinned to the engine's actual output for this seed (rounded
  // the same way extractActionable rounds them) -- catches drift in the Kelly/
  // payoff/Bayesian math chain end-to-end, not just at the primitive level.
  assert.ok(Math.abs(sig.kelly - 0.5715) < 1e-3, `kelly=${sig.kelly}`);
  assert.ok(Math.abs(sig.payoff - 1.167) < 1e-2, `payoff=${sig.payoff}`);
  assert.ok(Math.abs(sig.hit_rate - 0.7692) < 1e-3, `hit_rate=${sig.hit_rate}`);
  assert.ok(Math.abs(sig.p_net_pos - 0.9612) < 1e-3, `p_net_pos=${sig.p_net_pos}`);

  // Schema/type checks for every field the signal-library consumer relies on
  for (const numField of ['kelly', 'quarter_kelly', 'payoff', 'expectancy', 'mae_95_atr', 'net_norm', 'p_net_pos', 'p_above_50', 'hit_rate']) {
    assert.equal(typeof sig[numField], 'number', `${numField} should be a number`);
  }
  assert.equal(sig.quarter_kelly, Number((sig.kelly / 4).toFixed(4)), 'quarter_kelly should be exactly kelly/4, rounded');
});

test('extractActionable only emits verdicts that pass isActionable and are not OOS-degraded', () => {
  const a = analyze();
  const actionable = extractActionable([{ asset: 'TEST', analysis: a }]);
  for (const sig of actionable) {
    assert.ok(isActionable(sig.verdict), `verdict "${sig.verdict}" should be actionable`);
    assert.ok(!sig.verdict.includes('SKIP') && !sig.verdict.includes('MOMENTUM') && !sig.verdict.includes('INSUFFICIENT'));
    if (sig.oos_str !== 'N/A') assert.ok(!sig.oos_str.includes('✗'), 'OOS-degraded signals must be filtered out');
  }
});

test('extractActionable sorts DEPLOY-tier signals before CAUTION, then by kelly descending', () => {
  // Build a multi-asset batch by reusing the same deterministic analysis twice
  // under different asset names -- exercises the sort comparator across ties.
  const a = analyze();
  const actionable = extractActionable([
    { asset: 'AAA', analysis: a },
    { asset: 'BBB', analysis: a },
  ]);
  assert.equal(actionable.length, 2);
  for (let i = 1; i < actionable.length; i += 1) {
    const prevDeploy = actionable[i - 1].verdict.includes('DEPLOY') ? 0 : 1;
    const curDeploy = actionable[i].verdict.includes('DEPLOY') ? 0 : 1;
    assert.ok(
      prevDeploy < curDeploy || (prevDeploy === curDeploy && actionable[i - 1].kelly >= actionable[i].kelly),
      'DEPLOY-tier entries must precede non-DEPLOY, and ties must be ordered by kelly descending',
    );
  }
});

test('analyzeSeries returns null for too-short bar histories (guards the 3*RSI_PERIOD floor)', () => {
  const bars = buildSineBars({ ...FIXTURE_PARAMS, n: 30 });
  assert.equal(analyzeSeries({ bars, ...ANALYZE_OPTS }), null);
});
