'use strict';

// Native JS port of notebooks/research/rsi_reversal.py's core analysis loop —
// "RSI Signal Strength Analyzer" (crossover detection -> forward-return measurement
// -> Bayesian/Kelly/OOS scoring -> DEPLOY/CAUTION/SKIP verdict).
//
// Lets the platform re-run the same statistical analysis directly on its own cached
// bars (storage/data/ts/*.bin), without the Python notebook + yfinance — at whatever
// history depth the local cache happens to have. Math mirrors the notebook 1:1
// (see rsi_reversal.py docstrings for the formulas); the only intentional difference
// is the data source.
//
// NOT ported: regime-breakdown / duration-breakdown deep-dive tables and the heatmap —
// those are diagnostic views the notebook still owns. This module produces exactly what
// extract_actionable()/export_signal_library() need: per-asset/TF crossover + recovery
// stats, trust tiers, OOS consistency, and DEPLOY/CAUTION verdicts.

// ── CONFIG — must match rsi_reversal.py CONFIG, or the two analyses aren't comparable ──
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const OVERSOLD_TH = 30.0;
const OVERBOUGHT_TH = 70.0;
const MIN_SIGNALS = 5;
const BAYES_PRIOR_A = 2.0;
const BAYES_PRIOR_B = 2.0;
const TIER_HIGH_N = 20;
const TIER_MED_N = 10;
const COST_PCT = 0.0010;
const OOS_DATE = '2023-01-01';

// ══════════════════════════════════════════════════════════════════════════════
// STATS PRIMITIVES — no scipy here, so: Lanczos log-gamma -> regularized incomplete
// beta (continued fraction, Numerical Recipes betacf) -> Beta cdf/ppf and Student-t
// cdf/ppf (via the standard t<->incomplete-beta identity). ppf is bisection on cdf —
// these are only used for confidence intervals / p-values on small samples, so a
// 100-iteration bisection is more than precise enough.
// ══════════════════════════════════════════════════════════════════════════════

function logGamma(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < cof.length; j += 1) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(x, a, b) {
  const MAXIT = 200;
  const EPS = 3e-9;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b)
    + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

function betaCdf(x, a, b) {
  return regularizedIncompleteBeta(x, a, b);
}

function betaPpf(p, a, b) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Student-t cdf via the incomplete-beta identity:
//   F(t) = 1 - (1/2) I_x(df/2, 1/2)   for t > 0,  x = df / (df + t^2)
//   F(t) =       (1/2) I_x(df/2, 1/2) for t <= 0
function tCdf(t, df) {
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

function tPpf(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  let lo = -1e4;
  let hi = 1e4;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN;
}

function stddevSample(values) {
  if (values.length < 2) return NaN;
  const avg = mean(values);
  const sumSq = values.reduce((s, v) => s + (v - avg) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// pandas .quantile() default: linear interpolation between closest ranks
function quantile(values, q) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

// ══════════════════════════════════════════════════════════════════════════════
// INDICATOR SERIES — Wilder smoothing (EWM, alpha = 1/period, i.e. pandas'
// com = period - 1) computed via the running-numerator/denominator form, which is
// exactly pandas' adjust=True .ewm().mean(); min_periods=period masks the warm-up.
// shared/lib/indicators.js's rsi()/atr() are simple-window point reads (fine for
// live signal checks) — this needs full Wilder-smoothed *series* to reproduce the
// notebook's signal timing, so it doesn't reuse them.
// ══════════════════════════════════════════════════════════════════════════════

function ewmSeries(values, period) {
  const alpha = 1 / period;
  const out = new Array(values.length).fill(null);
  let num = null;
  let den = null;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || Number.isNaN(v)) { out[i] = null; continue; }
    if (num === null) { num = v; den = 1; } else {
      num = v + (1 - alpha) * num;
      den = 1 + (1 - alpha) * den;
    }
    count += 1;
    out[i] = count >= period ? num / den : null;
  }
  return out;
}

function rsiSeries(closes, period = RSI_PERIOD) {
  const gains = [null];
  const losses = [null];
  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }
  const avgGain = ewmSeries(gains, period);
  const avgLoss = ewmSeries(losses, period);
  return closes.map((_, i) => {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g === null || l === null || l === 0) return null;
    return 100 - 100 / (1 + g / l);
  });
}

function atrSeries(bars, period = ATR_PERIOD) {
  const tr = bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prevClose = bars[i - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose),
    );
  });
  return ewmSeries(tr, period);
}

// pandas .rolling(period, min_periods=...).mean()
function rollingMeanSeries(values, period, minPeriods) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    const windowSize = Math.min(i + 1, period);
    if (windowSize >= minPeriods) out[i] = sum / windowSize;
  }
  return out;
}

// 'bull' = close above its ~200-session-equivalent MA, 'bear' = below, 'unknown' = MA not converged
function regimeSeries(closes, maPeriod) {
  const minPeriods = Math.max(10, Math.floor(maPeriod / 4));
  const ma = rollingMeanSeries(closes, maPeriod, minPeriods);
  return closes.map((c, i) => {
    if (ma[i] === null) return 'unknown';
    return c > ma[i] ? 'bull' : 'bear';
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL DETECTION — one fire per zone-boundary crossing, no double-counting
// extended in-zone stays. 'below' = oversold entry, 'above' = overbought entry
// (and vice-versa for 'recovery' = zone exit).
// ══════════════════════════════════════════════════════════════════════════════

function crossoverIndices(rsi, level, direction) {
  const out = [];
  for (let i = 1; i < rsi.length; i += 1) {
    const curr = rsi[i];
    const prev = rsi[i - 1];
    if (curr === null || prev === null) continue;
    const fired = direction === 'below'
      ? (curr < level && prev >= level)
      : (curr > level && prev <= level);
    if (fired) out.push(i);
  }
  return out;
}

// forward[i]  = consecutive bars from i (inclusive) that RSI stays in zone — used by
//               crossover signals (fire at zone *entry*, episode runs forward)
// backward[i] = consecutive bars before i that RSI was in zone — used by recovery
//               signals (fire at zone *exit*, episode ran backward into i)
function precomputeDurations(rsi, threshold, direction) {
  const n = rsi.length;
  const inZone = rsi.map((v) => {
    if (v === null) return false;
    return direction === 'below' ? v < threshold : v > threshold;
  });
  const fwd = new Array(n).fill(0);
  for (let i = n - 2; i >= 0; i -= 1) {
    if (inZone[i]) fwd[i] = 1 + fwd[i + 1];
  }
  if (inZone[n - 1]) fwd[n - 1] = 1;
  const bwd = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    if (inZone[i - 1]) bwd[i] = 1 + bwd[i - 1];
  }
  return { fwd, bwd };
}

// Signals within fwd_bars of each other share a measurement window and aren't
// independent observations — count distinct clusters instead of raw signal count.
function countClusters(positions, fwdBars) {
  if (!positions.length) return 0;
  let clusters = 1;
  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] - positions[i - 1] > fwdBars) clusters += 1;
  }
  return clusters;
}

function durationBucket(duration) {
  if (duration <= 3) return '1-3 bars';
  if (duration <= 10) return '4-10 bars';
  return '11+ bars';
}

// ══════════════════════════════════════════════════════════════════════════════
// OUTCOME MEASUREMENT
//   r_norm = r_raw / ATR%_t  — "how many volatility units did price move?",
//   the cross-timeframe-comparable metric the whole analysis is built on.
// ══════════════════════════════════════════════════════════════════════════════

function measureOutcomes({
  bars, signalIndices, fwdBars, atr, mode, regime, durations, signalType, costPct = COST_PCT,
}) {
  const rows = [];
  for (const i of signalIndices) {
    if (i + fwdBars >= bars.length) continue;
    const ep = bars[i].close;
    const xp = bars[i + fwdBars].close;
    const atrVal = atr[i];
    if (ep <= 0 || atrVal === null || Number.isNaN(atrVal) || atrVal <= 0) continue;

    const atrPct = atrVal / ep;
    let high = -Infinity;
    let low = Infinity;
    for (let k = i + 1; k <= i + fwdBars; k += 1) {
      if (bars[k].high > high) high = bars[k].high;
      if (bars[k].low < low) low = bars[k].low;
    }

    let rawRet;
    let maxRet;
    let mae;
    if (mode === 'long') {
      rawRet = (xp - ep) / ep;
      maxRet = (high - ep) / ep;
      mae = (ep - low) / ep;
    } else {
      rawRet = (ep - xp) / ep;
      maxRet = (ep - low) / ep;
      mae = (high - ep) / ep;
    }

    const netRawRet = rawRet - costPct;
    const duration = signalType === 'crossover' ? durations.fwd[i] : durations.bwd[i];

    rows.push({
      pos: i,
      raw_ret: rawRet,
      net_raw_ret: netRawRet,
      max_ret: maxRet,
      mae,
      norm_ret: rawRet / atrPct,
      net_norm_ret: netRawRet / atrPct,
      max_norm: maxRet / atrPct,
      mae_norm: mae / atrPct,
      atr_pct: atrPct,
      hit: rawRet > 0 ? 1 : 0,
      net_hit: netRawRet > 0 ? 1 : 0,
      regime: regime[i] || 'unknown',
      duration,
      dur_bucket: durationBucket(duration),
      signal_type: signalType,
    });
  }
  return rows;
}

// ══════════════════════════════════════════════════════════════════════════════
// BAYESIAN ESTIMATION
//   Hit rate   : Beta(2,2) prior -> Beta(2+h, 2+n-h) posterior (Beta-Binomial conjugate)
//   Norm return: non-informative prior p(mu,sigma^2) ~ 1/sigma^2 -> t_{n-1} posterior
// ══════════════════════════════════════════════════════════════════════════════

function bayesHitRate(h, n) {
  const a = BAYES_PRIOR_A + h;
  const b = BAYES_PRIOR_B + (n - h);
  return {
    post_mean: a / (a + b),
    ci_low: betaPpf(0.025, a, b),
    ci_high: betaPpf(0.975, a, b),
    p_above_50: 1 - betaCdf(0.5, a, b),
  };
}

function bayesNormReturn(values) {
  const n = values.length;
  if (n < 2) {
    const v = n === 1 ? values[0] : NaN;
    return {
      post_mean: v, ci_low: NaN, ci_high: NaN, p_positive: NaN,
    };
  }
  const xbar = mean(values);
  const s = stddevSample(values);
  const se = s / Math.sqrt(n);
  if (se === 0) {
    return {
      post_mean: xbar, ci_low: xbar, ci_high: xbar, p_positive: xbar > 0 ? 1 : 0,
    };
  }
  const df = n - 1;
  return {
    post_mean: xbar,
    ci_low: xbar + se * tPpf(0.025, df),
    ci_high: xbar + se * tPpf(0.975, df),
    p_positive: 1 - tCdf((0 - xbar) / se, df),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARIZE — one signal bucket (e.g. "BTC-USD 1d oversold crossover") -> full
// stats dict: hit rate, payoff, Kelly f*, expectancy, MAE stop distance, Bayesian
// posteriors and p-values, net-of-cost figures.
//   Kelly f* = p - (1-p)/b          (b = payoff ratio = avg_win_norm / |avg_loss_norm|)
//   Expectancy = p*avg_win + (1-p)*avg_loss   (ATR units; positive = edge exists)
// ══════════════════════════════════════════════════════════════════════════════

function summarize(rows) {
  if (rows.length < MIN_SIGNALS) return { n: rows.length, ok: false };

  const hitSum = rows.reduce((s, r) => s + r.hit, 0);
  const bhr = bayesHitRate(hitSum, rows.length);
  const normRets = rows.map((r) => r.norm_ret);
  const bnr = bayesNormReturn(normRets);

  const wins = rows.filter((r) => r.hit === 1).map((r) => r.norm_ret);
  const losses = rows.filter((r) => r.hit === 0).map((r) => r.norm_ret);
  const avgWinNorm = wins.length ? mean(wins) : NaN;
  const avgLossNorm = losses.length ? mean(losses) : NaN;
  const avgLossAbs = Number.isNaN(avgLossNorm) ? NaN : Math.abs(avgLossNorm);

  const payoff = (!Number.isNaN(avgWinNorm) && avgLossAbs > 0) ? avgWinNorm / avgLossAbs : NaN;
  const p = hitSum / rows.length;
  const kelly = (!Number.isNaN(payoff) && payoff > 0) ? p - (1 - p) / payoff : NaN;

  const maeNorms = rows.map((r) => r.mae_norm);
  const avgMae = maeNorms.length ? mean(maeNorms) : NaN;
  const p95Mae = maeNorms.length ? quantile(maeNorms, 0.95) : NaN;

  const netNorms = rows.map((r) => r.net_norm_ret);
  const bnet = bayesNormReturn(netNorms);

  const rawRets = rows.map((r) => r.raw_ret);
  const maxNorms = rows.map((r) => r.max_norm);
  const atrPcts = rows.map((r) => r.atr_pct);

  return {
    n: rows.length,
    ok: true,
    hit_rate: p,
    avg_raw: mean(rawRets),
    med_raw: median(rawRets),
    avg_norm: mean(normRets),
    med_norm: median(normRets),
    avg_maxnorm: mean(maxNorms),
    avg_atr_pct: mean(atrPcts),
    std_norm: stddevSample(normRets),
    score: p * mean(normRets),
    avg_win_norm: avgWinNorm,
    avg_loss_norm: avgLossNorm,
    payoff,
    kelly,
    expectancy: (!Number.isNaN(avgWinNorm) && !Number.isNaN(avgLossNorm))
      ? p * avgWinNorm + (1 - p) * avgLossNorm : NaN,
    avg_mae_norm: avgMae,
    p95_mae_norm: p95Mae,
    avg_net_norm: mean(netNorms),
    p_net_pos: bnet.p_positive,
    b_hit_mean: bhr.post_mean,
    b_hit_ci: [bhr.ci_low, bhr.ci_high],
    p_above_50: bhr.p_above_50,
    b_norm_mean: bnr.post_mean,
    b_norm_ci: [bnr.ci_low, bnr.ci_high],
    p_positive: bnr.p_positive,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// TRUST TIER & VERDICT
// ══════════════════════════════════════════════════════════════════════════════

function trustTier(nRaw, nEff, timeframe) {
  if (nRaw < MIN_SIGNALS) return 'DISCARD';
  if (timeframe === '1h') {
    // 1h is structurally capped at ~1 macro regime; n_eff corrects for clustering
    return nEff < 8 ? 'DISCARD' : 'LOW';
  }
  if (nRaw < TIER_MED_N) return 'LOW';
  if (nRaw >= TIER_HIGH_N && ['1d', '1wk', '1mo'].includes(timeframe)) return 'HIGH';
  return 'MED';
}

function oosString(stats, oos) {
  const isNet = stats.avg_net_norm;
  const oosNet = oos && oos.ok ? oos.avg_net_norm : NaN;
  if (Number.isNaN(oosNet)) return 'N/A';
  const arrow = (oosNet > 0 && isNet > 0) ? '✓' : ((isNet > 0 && oosNet <= 0) ? '✗' : '~');
  return `${isNet >= 0 ? '+' : ''}${isNet.toFixed(2)}→${oosNet >= 0 ? '+' : ''}${oosNet.toFixed(2)} ${arrow}`;
}

// DEPLOY: Kelly > 0.10, P(net>0) > 0.80, HIGH trust   ·   CAUTION: Kelly > 0, P(net>0) > 0.60
// MOMENTUM: historically precedes continuation, not reversal — trade the opposite or skip
function verdict(stats, oos, tier) {
  const { kelly, p_net_pos: pnet, score } = stats;

  if (score < -0.5 && !Number.isNaN(stats.p_positive) && stats.p_positive < 0.3) {
    return { label: '⚠ MOMENTUM', oos_ok: '?' };
  }
  if (Number.isNaN(kelly) || Number.isNaN(pnet)) {
    return { label: '— INSUFFICIENT', oos_ok: '?' };
  }

  let oosOk = '?';
  if (oos && oos.ok) {
    const oosNet = oos.avg_net_norm;
    const isNet = stats.avg_net_norm;
    if (!Number.isNaN(oosNet) && !Number.isNaN(isNet)) {
      if (oosNet > 0 && isNet > 0) oosOk = '✓';
      else if (oosNet <= 0 && isNet > 0) oosOk = '✗ degraded';
      else oosOk = '~';
    }
  }

  let label;
  if (kelly > 0.10 && pnet > 0.80 && tier === 'HIGH') label = '✅ DEPLOY';
  else if (kelly > 0.0 && pnet > 0.60) label = '🟡 CAUTION';
  else if (kelly <= 0 || pnet < 0.50) label = '⬛ SKIP';
  else label = '🔵 WEAK';

  return { label, oos_ok: oosOk };
}

function isActionable(verdictLabel) {
  if (verdictLabel.includes('MOMENTUM') || verdictLabel.includes('SKIP') || verdictLabel.includes('INSUFFICIENT')) return false;
  return verdictLabel.includes('DEPLOY') || verdictLabel.includes('CAUTION');
}

// ══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION — one asset/timeframe -> full crossover + recovery analysis,
// mirroring rsi_reversal.py's analyze(). Regime/duration breakdown tables are
// intentionally not computed here (see module header) — only what verdicts need.
// ══════════════════════════════════════════════════════════════════════════════

function oosSplit(rows, oosDate) {
  if (!oosDate || !rows.length) return [summarize([]), summarize([])];
  const cutoff = Date.parse(`${oosDate}T00:00:00Z`);
  const isRows = rows.filter((r) => r.timestamp_ms < cutoff);
  const oosRows = rows.filter((r) => r.timestamp_ms >= cutoff);
  return [summarize(isRows), summarize(oosRows)];
}

/**
 * Full RSI-reversal analysis for one asset/timeframe, on the supplied bars.
 *
 * @param {object} opts
 * @param {Array}  opts.bars         OHLCV bars (ascending by timestamp), each with
 *                                   { timestamp, open, high, low, close, volume }
 * @param {string} opts.timeframe    '1h' | '1d' | '1wk' | '1mo'
 * @param {number} opts.forwardBars  measurement horizon (must match the notebook's
 *                                   per-TF forward_bars for normalized returns to compare)
 * @param {number} opts.regimeMaPeriod  bars for the bull/bear regime MA (~200d-equivalent)
 * @param {string} [opts.oosDate]    'YYYY-MM-DD' OOS split date, or null to disable
 * @param {number} [opts.costPct]    round-trip cost fraction
 *
 * Returns null if there's not enough history (need >= 3*RSI_PERIOD bars), otherwise
 * { ticker omitted by caller, tf, fwd, bars, oversold, overbought, os_recovery,
 *   ob_recovery, os_is/os_oos, ob_is/ob_oos, os_rec_is/os_rec_oos, ob_rec_is/ob_rec_oos }
 * — same shape `extractActionable` expects (one entry per asset is assembled by the caller).
 */
function analyzeSeries({
  bars, timeframe, forwardBars, regimeMaPeriod, oosDate = OOS_DATE, costPct = COST_PCT,
}) {
  if (!bars || bars.length < RSI_PERIOD * 3) return null;

  const closes = bars.map((b) => b.close);
  const rsi = rsiSeries(closes, RSI_PERIOD);
  const atr = atrSeries(bars, ATR_PERIOD);
  const regime = regimeSeries(closes, regimeMaPeriod);

  const osCrossIdx = crossoverIndices(rsi, OVERSOLD_TH, 'below');
  const obCrossIdx = crossoverIndices(rsi, OVERBOUGHT_TH, 'above');
  const osRecIdx = crossoverIndices(rsi, OVERSOLD_TH, 'above');
  const obRecIdx = crossoverIndices(rsi, OVERBOUGHT_TH, 'below');

  const osDur = precomputeDurations(rsi, OVERSOLD_TH, 'below');
  const obDur = precomputeDurations(rsi, OVERBOUGHT_TH, 'above');

  const withTimestamps = (rows) => rows.map((r) => ({ ...r, timestamp_ms: Date.parse(bars[r.pos].timestamp) }));

  const osCrossRows = withTimestamps(measureOutcomes({
    bars, signalIndices: osCrossIdx, fwdBars: forwardBars, atr, mode: 'long', regime, durations: osDur, signalType: 'crossover', costPct,
  }));
  const obCrossRows = withTimestamps(measureOutcomes({
    bars, signalIndices: obCrossIdx, fwdBars: forwardBars, atr, mode: 'short', regime, durations: obDur, signalType: 'crossover', costPct,
  }));
  const osRecRows = withTimestamps(measureOutcomes({
    bars, signalIndices: osRecIdx, fwdBars: forwardBars, atr, mode: 'long', regime, durations: osDur, signalType: 'recovery', costPct,
  }));
  const obRecRows = withTimestamps(measureOutcomes({
    bars, signalIndices: obRecIdx, fwdBars: forwardBars, atr, mode: 'short', regime, durations: obDur, signalType: 'recovery', costPct,
  }));

  const osNEff = countClusters(osCrossRows.map((r) => r.pos), forwardBars);
  const obNEff = countClusters(obCrossRows.map((r) => r.pos), forwardBars);

  const osStats = summarize(osCrossRows);
  const obStats = summarize(obCrossRows);
  osStats.tier = trustTier(osStats.n, osNEff, timeframe);
  obStats.tier = trustTier(obStats.n, obNEff, timeframe);
  osStats.n_eff = osNEff;
  obStats.n_eff = obNEff;

  const [osIs, osOos] = oosSplit(osCrossRows, oosDate);
  const [obIs, obOos] = oosSplit(obCrossRows, oosDate);
  const [osRecIs, osRecOos] = oosSplit(osRecRows, oosDate);
  const [obRecIs, obRecOos] = oosSplit(obRecRows, oosDate);

  return {
    tf: timeframe,
    fwd: forwardBars,
    bars: bars.length,
    oversold: osStats,
    overbought: obStats,
    os_recovery: summarize(osRecRows),
    ob_recovery: summarize(obRecRows),
    os_is: osIs,
    os_oos: osOos,
    ob_is: obIs,
    ob_oos: obOos,
    os_rec_is: osRecIs,
    os_rec_oos: osRecOos,
    ob_rec_is: obRecIs,
    ob_rec_oos: obRecOos,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL FILTERING & EXPORT — same shape/filter as rsi_reversal.py's
// extract_actionable()/export_signal_library(), so the output can drop straight
// into notebooks/signal_library.json (consumed by rsi_reversal_signal.js).
// ══════════════════════════════════════════════════════════════════════════════

const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * @param {Array<{ asset: string, analysis: object|null }>} analyses  one entry per
 *        asset/timeframe pair, `analysis` = analyzeSeries() output (or null)
 * Returns the sorted list of actionable (DEPLOY/CAUTION, OOS-clean) signal dicts —
 * same schema as notebooks/signal_library.json's `signals[]`.
 */
function extractActionable(analyses) {
  const out = [];
  for (const { asset, analysis: r } of analyses) {
    if (!r) continue;
    const groups = [
      { cond: 'oversold', oosKey: 'os_oos', recKey: 'os_recovery', recOosKey: 'os_rec_oos' },
      { cond: 'overbought', oosKey: 'ob_oos', recKey: 'ob_recovery', recOosKey: 'ob_rec_oos' },
    ];
    for (const { cond, oosKey, recKey, recOosKey } of groups) {
      const tier = r[cond].tier || 'DISCARD';
      const entries = [
        { entryLabel: 'crossover', statsKey: cond, oosKey },
        { entryLabel: 'recovery', statsKey: recKey, oosKey: recOosKey },
      ];
      for (const { entryLabel, statsKey, oosKey: oKey } of entries) {
        const stats = r[statsKey];
        const oos = r[oKey];
        if (!stats || !stats.ok || tier === 'DISCARD') continue;
        const v = verdict(stats, oos, tier);
        if (!isActionable(v.label)) continue;
        // exclude OOS-degraded, same as the notebook's _is_actionable()
        if (v.oos_ok && v.oos_ok.includes('✗')) continue;
        const oosStr = oosString(stats, oos);

        out.push({
          asset,
          timeframe: r.tf,
          condition: cond,
          entry: entryLabel,
          n: stats.n,
          kelly: round(stats.kelly, 4),
          quarter_kelly: Number.isFinite(stats.kelly) ? round(stats.kelly / 4, 4) : null,
          payoff: round(stats.payoff, 3),
          expectancy: round(stats.expectancy, 3),
          mae_95_atr: round(stats.p95_mae_norm, 2),
          net_norm: round(stats.avg_net_norm, 3),
          p_net_pos: round(stats.p_net_pos, 4),
          p_above_50: round(stats.p_above_50, 4),
          hit_rate: round(stats.hit_rate, 4),
          trust: tier,
          verdict: v.label.replace(/^[✅🟡⬛🔵⚠—]\s*/, (m) => m).trim(),
          oos_str: oosStr,
          oos_ok: oosStr !== 'N/A' && oosStr.includes('✓'),
        });
      }
    }
  }
  out.sort((a, b) => {
    const da = a.verdict.includes('DEPLOY') ? 0 : 1;
    const db = b.verdict.includes('DEPLOY') ? 0 : 1;
    if (da !== db) return da - db;
    return (b.kelly ?? -999) - (a.kelly ?? -999);
  });
  return out;
}

module.exports = {
  RSI_PERIOD,
  ATR_PERIOD,
  OVERSOLD_TH,
  OVERBOUGHT_TH,
  MIN_SIGNALS,
  COST_PCT,
  OOS_DATE,
  rsiSeries,
  atrSeries,
  regimeSeries,
  crossoverIndices,
  precomputeDurations,
  countClusters,
  measureOutcomes,
  summarize,
  bayesHitRate,
  bayesNormReturn,
  trustTier,
  verdict,
  oosString,
  isActionable,
  analyzeSeries,
  extractActionable,
  // exposed for tests / inspection
  quantile,
  median,
  betaCdf,
  betaPpf,
  tCdf,
  tPpf,
};
