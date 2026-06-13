'use strict';

// ML feature builder (Design B: JS is the single feature source for both training-dump
// and live serving — no train/serve skew). Composes the existing per-asset technical
// features (shared/lib/indicators.js) with cross-family correlation/regime features and
// a forward-return label.
//
// Point-in-time discipline: every feature at row date d uses only data <= d. The label
// (and only the label) looks forward by `horizon` bars; rows without a full forward
// window are dropped so no partial-future label leaks in.

const {
  calculateRollingFeatureFrame,
  pearsonCorrelation,
  returns: trailingReturn,
} = require('../market/indicators');

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function dayKey(ts) {
  return String(ts).slice(0, 10);
}

// Forward-fill an anchor's [{date,value}] onto a target sorted date axis: for each target
// date, carry the most recent anchor value with date <= target (no lookahead).
function forwardFillOnto(targetDates, series) {
  const sorted = [...series]
    .filter((p) => p && p.date && isNum(p.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = new Array(targetDates.length).fill(null);
  let j = 0;
  let last = null;
  for (let i = 0; i < targetDates.length; i += 1) {
    while (j < sorted.length && sorted[j].date <= targetDates[i]) {
      last = sorted[j].value;
      j += 1;
    }
    out[i] = last; // null until the first anchor observation on/!before this date
  }
  return out;
}

// Simple-return series from a level series (ret[i] = v[i]/v[i-1]-1; ret[0]=null).
function toReturns(levels) {
  const out = new Array(levels.length).fill(null);
  for (let i = 1; i < levels.length; i += 1) {
    if (isNum(levels[i]) && isNum(levels[i - 1]) && levels[i - 1] !== 0) {
      out[i] = levels[i] / levels[i - 1] - 1;
    }
  }
  return out;
}

// Pearson over the last `period` aligned (asset, anchor) return pairs ending at index i.
function rollingPairCorr(aRet, bRet, i, period) {
  if (i + 1 < period) return null;
  const a = [];
  const b = [];
  for (let k = i - period + 1; k <= i; k += 1) {
    if (isNum(aRet[k]) && isNum(bRet[k])) {
      a.push(aRet[k]);
      b.push(bRet[k]);
    }
  }
  if (a.length < Math.max(3, Math.floor(period / 2))) return null;
  const c = pearsonCorrelation(a, b);
  return isNum(c) ? c : null;
}

/**
 * Builds the ML feature frame.
 *
 * @param {object} opts
 * @param {Array}  opts.assetSources  OHLCV bars (same shape calculateRollingFeatureFrame expects:
 *                                    {symbol, family, timeframe, timestamp, open, high, low, close, volume})
 * @param {Object<string, Array<{date:string, value:number}>>} [opts.anchors]
 *                                    cross-family anchor level series keyed by name
 *                                    (e.g. CRYPTO_TOTAL_MCAP, BTC_DOMINANCE, STABLECOIN_MCAP, GOLD, OIL, DXY, CPI...)
 * @param {number} [opts.horizon=5]      forward bars for the label
 * @param {number} [opts.corrPeriod=20]  rolling window for cross-family correlation + anchor momentum
 * @param {number} [opts.deadzone=0]     |fwd return| <= deadzone => class 1 (flat); >deadzone up(2)/down(0)
 * @param {number} [opts.minimumBars]    min bars before emitting a technical row
 * @returns {{features:Array, feature_names:string[], meta:object}}
 */
function buildMLFeatureFrame(opts = {}) {
  const assetSources = opts.assetSources || [];
  const anchors = opts.anchors || {};
  const horizon = opts.horizon || 5;
  const corrPeriod = opts.corrPeriod || 20;
  const deadzone = opts.deadzone || 0;
  const minimumBars = opts.minimumBars || Math.max(corrPeriod + 2, 2);

  // 1) Per-asset technical rows (point-in-time, expanding window). Index by key+date.
  const tech = calculateRollingFeatureFrame(assetSources, minimumBars);
  const techByKeyDate = new Map();
  for (const row of tech.features) {
    techByKeyDate.set(`${row.key}|${dayKey(row.as_of)}`, row);
  }

  // 2) Group bars per key -> sorted daily closes (for label + asset returns).
  // Key must match indicators.groupOhlcv ("symbol:timeframe") so techByKeyDate lookups hit.
  const barsByKey = new Map();
  for (const bar of assetSources) {
    const key = `${bar.symbol}:${bar.timeframe || ''}`;
    if (!barsByKey.has(key)) barsByKey.set(key, []);
    barsByKey.get(key).push(bar);
  }

  const anchorNames = Object.keys(anchors).sort();
  const featureNames = new Set();
  const features = [];
  let droppedNoLabel = 0;

  for (const [key, barsRaw] of barsByKey) {
    const bars = [...barsRaw].sort((a, b) =>
      a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0);
    const dates = bars.map((b) => dayKey(b.timestamp));
    const closes = bars.map((b) => Number(b.close));
    const assetRet = toReturns(closes);

    // Pre-align anchor returns and level series onto this asset's date axis (forward-filled,
    // point-in-time). Both are computed once per (symbol, anchor) pair outside the row loop;
    // the aligned level array is reused inside the loop via .slice(0, i+1) for trailingReturn,
    // eliminating O(n) redundant forwardFillOnto calls per anchor per row.
    const anchorRet = {};
    const anchorAligned = {}; // full forward-filled level series, pre-computed once per anchor
    for (const name of anchorNames) {
      anchorAligned[name] = forwardFillOnto(dates, anchors[name]);
      anchorRet[name] = toReturns(anchorAligned[name]);
    }

    for (let i = 0; i < bars.length; i += 1) {
      const techRow = techByKeyDate.get(`${key}|${dates[i]}`);
      if (!techRow) continue; // below minimumBars

      // Label: forward N-bar direction. Drop rows without a full forward window.
      const fwdIdx = i + horizon;
      if (fwdIdx >= closes.length || !isNum(closes[fwdIdx]) || !isNum(closes[i]) || closes[i] === 0) {
        droppedNoLabel += 1;
        continue;
      }
      const fwdReturn = closes[fwdIdx] / closes[i] - 1;
      const labelClass = fwdReturn > deadzone ? 2 : fwdReturn < -deadzone ? 0 : 1;

      const out = { ...techRow };
      // Cross-family features (corr + anchor momentum/regime input), all <= date i.
      for (const name of anchorNames) {
        const corr = rollingPairCorr(assetRet, anchorRet[name], i, corrPeriod);
        // Use the pre-computed aligned level array; only slice to the current row window.
        const mom = i + 1 >= corrPeriod
          ? trailingReturn(anchorAligned[name].slice(0, i + 1), corrPeriod)
          : null;
        out[`xf_corr_${name}`] = isNum(corr) ? corr : null;
        out[`regime_${name}_mom`] = isNum(mom) ? mom : null;
        featureNames.add(`xf_corr_${name}`);
        featureNames.add(`regime_${name}_mom`);
      }
      out.label_fwd_return = fwdReturn;
      out.label_class = labelClass;
      out.label_horizon = horizon;
      features.push(out);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    features,
    feature_names: [...featureNames].sort(),
    meta: {
      assets: barsByKey.size,
      rows: features.length,
      dropped_no_label: droppedNoLabel,
      anchors: anchorNames,
      horizon,
      corr_period: corrPeriod,
      deadzone,
    },
  };
}

module.exports = { buildMLFeatureFrame };
