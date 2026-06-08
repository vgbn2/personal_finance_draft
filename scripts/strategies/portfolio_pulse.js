#!/usr/bin/env node
'use strict';

// Portfolio-as-asset pulse check.
//
// The platform's own equity curve IS a price series — if we expect the portfolio to
// "hypothetically appreciate" the way any held asset should, we can read it with the same
// technical lens (RSI, trend regime, drawdown) the rsi_reversal research applies to
// SPY/BTC/etc: where does our own asset sit right now relative to its own recent momentum?
//
// This is explicitly NOT a backtested edge. notebooks/research/rsi_reversal.py only trusts
// a read once it has N>=20 independent signal clusters, multiple regimes, and an OOS check —
// that's possible because SPY/BTC have a decade of history across many cycles. A portfolio's
// own NAV curve is N=1: one path, whatever history it has accumulated, no independent repeats
// to draw a hit-rate from. So this gives the SAME LENS ("is our asset stretched or beaten
// down right now, relative to its own trend?"), explicitly not the same STATISTICAL WEIGHT —
// directional context for capital-allocation calls ("add while it's down" / "trim, it's
// stretched"), the way you'd eyeball RSI on a stock before sizing into it, not a validated
// reversal signal you'd Kelly-size against.
//
// Data source: storage/data/backtests/latest_backtest.json `equity_curve` — currently the
// longest NAV series the platform produces. The live paper-trading ledger
// (storage/data/paper_trading/) has only a handful of fills so far; once it accumulates
// enough multi-regime history, point `pulse({ filePath })` at a live-equity export instead.
//
// Usage: node scripts/strategies/portfolio_pulse.js [--file <path-to-backtest-json>]

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../shared/lib/paths');
const { rsi, rollingVolatility } = require('../../shared/lib/indicators');

const BACKTEST_PATH = path.join(REPO_ROOT, 'storage', 'data', 'backtests', 'latest_backtest.json');
const RSI_PERIOD = 14;
const TREND_MA_PERIOD = 20;

function loadEquityCurve(filePath = BACKTEST_PATH) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const curve = Array.isArray(raw.equity_curve) ? raw.equity_curve : [];
  return curve.filter((p) => typeof p.equity === 'number' && Number.isFinite(p.equity));
}

function simpleMovingAverage(values, period) {
  if (values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((sum, v) => sum + v, 0) / window.length;
}

// Largest peak-to-trough decline anywhere in the series (fraction, e.g. -0.12 = -12%).
function maxDrawdown(values) {
  let peak = values[0];
  let peakIndex = 0;
  let worst = { drawdown: 0, peakIndex: 0, troughIndex: 0 };
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > peak) {
      peak = values[i];
      peakIndex = i;
    }
    const drawdown = peak > 0 ? (values[i] - peak) / peak : 0;
    if (drawdown < worst.drawdown) {
      worst = { drawdown, peakIndex, troughIndex: i };
    }
  }
  return worst;
}

const CAVEAT = 'N=1 equity curve — a same-lens technical read, NOT a backtested edge '
  + '(rsi_reversal needed N>=20 independent signal clusters per asset/timeframe, multiple '
  + 'regimes and an OOS check to call something HIGH-trust; one NAV path across one short '
  + 'window has no independent repeats to draw a hit-rate from). Use this as "where does '
  + 'our own asset sit right now", not as a sized, validated reversal signal.';

/**
 * Reads the equity curve as if it were any other tradeable asset's price series.
 *
 * @param {object} [opts]
 * @param {string} [opts.filePath]  path to a backtest JSON with an `equity_curve` array
 *                                  of { timestamp, equity } points (defaults to latest_backtest.json)
 * Returns { ok:false, error } if there isn't enough history for an RSI read, otherwise a
 * snapshot: current equity vs. peak/drawdown, RSI zone, trend regime vs. its own MA, and
 * rolling volatility — plus `caveat` explaining why this isn't a sized signal.
 */
function pulse({ filePath = BACKTEST_PATH } = {}) {
  const curve = loadEquityCurve(filePath);
  if (curve.length < RSI_PERIOD + 2) {
    return { ok: false, error: `equity curve has only ${curve.length} usable point(s) — need >= ${RSI_PERIOD + 2} for an RSI(${RSI_PERIOD}) read` };
  }

  const equity = curve.map((p) => p.equity);
  const current = equity[equity.length - 1];
  const peakSoFar = Math.max(...equity);
  const drawdownFromPeak = peakSoFar > 0 ? (current - peakSoFar) / peakSoFar : 0;
  const trendMa = simpleMovingAverage(equity, Math.min(TREND_MA_PERIOD, equity.length));
  const worstDrawdown = maxDrawdown(equity);
  const volatility = rollingVolatility(equity, Math.min(TREND_MA_PERIOD, equity.length - 1));

  const rsiPrev = rsi(equity.slice(0, -1), RSI_PERIOD);
  const rsiCurr = rsi(equity, RSI_PERIOD);

  let rsiZone = 'neutral';
  if (rsiCurr !== null) {
    if (rsiCurr < 30) rsiZone = 'oversold — own-momentum exhausted to the downside';
    else if (rsiCurr > 70) rsiZone = 'overbought — own-momentum stretched to the upside';
  }

  const regime = trendMa === null
    ? 'unknown — not enough history for a trend MA yet'
    : (current > trendMa ? 'above its own trend (currently appreciating)' : 'below its own trend (currently lagging its own trend)');

  return {
    ok: true,
    n_points: curve.length,
    as_of: curve[curve.length - 1].timestamp,
    current_equity: current,
    peak_equity: peakSoFar,
    drawdown_from_peak: drawdownFromPeak,
    worst_drawdown: worstDrawdown,
    rsi_prev: rsiPrev,
    rsi_curr: rsiCurr,
    rsi_zone: rsiZone,
    trend_ma: trendMa,
    trend_ma_period: TREND_MA_PERIOD,
    regime,
    rolling_volatility: volatility,
    caveat: CAVEAT,
  };
}

function printPulse(result) {
  if (!result.ok) {
    console.log(`[portfolio-pulse] ${result.error}`);
    return;
  }
  console.log(`[portfolio-pulse] ${result.n_points} equity points (as of ${result.as_of})`);
  console.log(`  Equity      : ${result.current_equity.toFixed(4)}  (peak ${result.peak_equity.toFixed(4)}, ${(result.drawdown_from_peak * 100).toFixed(1)}% off peak)`);
  console.log(`  RSI(${RSI_PERIOD})    : ${result.rsi_prev !== null ? result.rsi_prev.toFixed(1) : '—'} -> ${result.rsi_curr !== null ? result.rsi_curr.toFixed(1) : '—'}  [${result.rsi_zone}]`);
  console.log(`  Trend       : ${result.regime}${result.trend_ma !== null ? ` (MA${result.trend_ma_period} = ${result.trend_ma.toFixed(4)})` : ''}`);
  console.log(`  Worst DD    : ${(result.worst_drawdown.drawdown * 100).toFixed(1)}% (index ${result.worst_drawdown.peakIndex} -> ${result.worst_drawdown.troughIndex})`);
  console.log(`  Volatility  : ${result.rolling_volatility !== null ? result.rolling_volatility.toFixed(4) : '—'}`);
  console.log(`\n  ${result.caveat}`);
}

function parseArgs(argv) {
  const out = { filePath: BACKTEST_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file') out.filePath = path.resolve(argv[++i] || out.filePath);
  }
  return out;
}

module.exports = {
  pulse, loadEquityCurve, printPulse, BACKTEST_PATH,
};

if (require.main === module) {
  const { filePath } = parseArgs(process.argv.slice(2));
  printPulse(pulse({ filePath }));
}
