const { OHLCV_FAMILIES, isFiniteNumber } = require('./validation');
const {
  calculateSmartMoneyConceptSignals,
  calculateDivergenceSignals,
  calculateSessionVolumeProfile,
} = require('./price_action');

function groupOhlcv(sources) {
  const records = Array.isArray(sources) ? sources : sources?.sources;
  if (!Array.isArray(records)) {
    throw new TypeError('groupOhlcv expected an array of source records or an object with sources[]');
  }

  const groups = new Map();
  for (const record of records) {
    if (!OHLCV_FAMILIES.has(record.family) || !record.symbol || !record.timeframe) {
      continue;
    }
    const key = `${record.symbol}:${record.timeframe}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const bars of groups.values()) {
    bars.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }
  return groups;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function stddev(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function pearsonCorrelation(valuesA, valuesB) {
  if (!valuesA.length || valuesA.length !== valuesB.length) return 0;
  const avgA = mean(valuesA);
  const avgB = mean(valuesB);
  let numerator = 0;
  let sumSqA = 0;
  let sumSqB = 0;
  for (let i = 0; i < valuesA.length; i++) {
    const dA = valuesA[i] - avgA;
    const dB = valuesB[i] - avgB;
    numerator += dA * dB;
    sumSqA += dA * dA;
    sumSqB += dB * dB;
  }
  const denominator = Math.sqrt(sumSqA * sumSqB);
  return denominator === 0 ? 0 : numerator / denominator;
}

function rollingCorrelation(seriesA, seriesB, period) {
  if (seriesA.length < period || seriesA.length !== seriesB.length) return null;
  const winA = seriesA.slice(-period);
  const winB = seriesB.slice(-period);
  return pearsonCorrelation(winA, winB);
}

function returns(closes, period) {
  if (closes.length <= period || closes[closes.length - 1 - period] === 0) return null;
  return closes[closes.length - 1] / closes[closes.length - 1 - period] - 1;
}

function rollingVolatility(closes, period) {
  if (closes.length <= period) return null;
  const rets = [];
  for (let i = closes.length - period; i < closes.length; i += 1) {
    if (closes[i - 1] !== 0) rets.push(closes[i] / closes[i - 1] - 1);
  }
  return stddev(rets);
}


function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function ema(values, period) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = mean(values.slice(0, period));
  for (let i = period; i < values.length; i += 1) {
    current = values[i] * multiplier + current * (1 - multiplier);
  }
  return current;
}

function macd(closes) {
  if (closes.length < 26) return null;
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  return fast !== null && slow !== null ? fast - slow : null;
}

function atr(bars, period = 14) {
  if (bars.length <= period) return null;
  const ranges = [];
  for (let i = bars.length - period; i < bars.length; i += 1) {
    const previousClose = bars[i - 1].close;
    ranges.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - previousClose),
      Math.abs(bars[i].low - previousClose),
    ));
  }
  return mean(ranges);
}

function bollingerBands(closes, period = 20) {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  const center = mean(window);
  const deviation = stddev(window);
  if (deviation === null) return null;
  return { middle: center, upper: center + 2 * deviation, lower: center - 2 * deviation };
}

const DEFAULT_PERIODS = {
  returnFast: 1,
  returnSlow: 5,
  volatility: 20,
  rsi: 14,
  atr: 14,
  bollinger: 20,
  structure: 2,
  divergence: 14,
  sessionBins: 24,
  sessionMinimumBars: 5,
  sessionStartHour: 0,
  sessionTimezoneOffsetMinutes: 0,
};

function mergePeriods(periods = {}) {
  return { ...DEFAULT_PERIODS, ...periods };
}

/**
 * Registry of available indicator methods.
 */
const IndicatorMethods = {
  returns,
  rollingVolatility,
  rsi,
  macd,
  atr,
  bollingerBands,
  calculateSmartMoneyConceptSignals,
  calculateDivergenceSignals,
  calculateSessionVolumeProfile,
};

const _warnedIndicatorIds = new Set();

let _cachedManifest = null;
/**
 * Loads the indicator manifest from config/system/indicator_manifest.yaml.
 */
function getIndicatorManifest() {
  if (_cachedManifest) return _cachedManifest;
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const { REPO_ROOT } = require('../runtime/paths');
    const { parseYamlRecursive } = require('../runtime/config_loader');
    const manifestPath = path.join(REPO_ROOT, 'config', 'system', 'indicator_manifest.yaml');
    if (fs.existsSync(manifestPath)) {
      const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/);
      const [config] = parseYamlRecursive(lines);
      if (config && config.indicators) {
        _cachedManifest = config.indicators;
      }
    }
  } catch (err) {
    // Fail silently to fallback to legacy hardcoded path if needed
  }
  return _cachedManifest;
}

/**
 * Resiliently applies an indicator defined in the manifest.
 */
function applyManifestIndicator(ind, window, closes, periods) {
  const fn = IndicatorMethods[ind.method];
  if (!fn) return {};

  // Guard: params must be an object (not a string from failed YAML inline-map parse)
  let safeParams = ind.params;
  if (safeParams !== undefined && safeParams !== null && typeof safeParams !== 'object') {
    const warnKey = `params:${ind.id}`;
    if (!_warnedIndicatorIds.has(warnKey)) {
      _warnedIndicatorIds.add(warnKey);
      console.warn(`[indicators] manifest params for "${ind.id}" did not parse as a map; ignoring params`);
    }
    safeParams = {};
  }

  const input = ind.input_type === 'window' ? window : closes;
  let result;

  try {
    if (ind.method.startsWith('calculate')) {
      // Modern object-based parameter style
      const options = {};
      for (const [pKey, pVal] of Object.entries(safeParams || {})) {
        options[pKey] = periods[pVal] ?? pVal;
      }
      result = fn(input, options);
    } else {
      // Legacy positional parameter style
      const pValues = Object.values(safeParams || {}).map((v) => periods[v] ?? v);
      result = fn(input, ...pValues);
    }

    if (result === null || result === undefined) return {};

    const output = {};
    if (ind.output_key) {
      output[ind.output_key] = result;
    } else if (ind.output_keys) {
      for (const [resKey, outKey] of Object.entries(ind.output_keys)) {
        // Support nested property access (e.g., signals.bullish_structure_break)
        const parts = resKey.split('.');
        let val = result;
        for (const part of parts) {
          val = val !== null && typeof val === 'object' ? val[part] : null;
        }
        output[outKey] = val;
      }
    }
    return output;
  } catch (err) {
    const warnKey = `fail:${ind.id}`;
    if (!_warnedIndicatorIds.has(warnKey)) {
      _warnedIndicatorIds.add(warnKey);
      console.warn(`[indicators] manifest indicator "${ind.id}" failed: ${err.message}`);
    }
    return {};
  }
}

function featureFromWindow(key, window, periods = DEFAULT_PERIODS) {
  const lastBar = window[window.length - 1];
  const closes = window.map((bar) => bar.close).filter(isFiniteNumber);

  const feature = {
    key,
    symbol: lastBar.symbol,
    family: lastBar.family,
    provider: lastBar.provider || null,
    timeframe: lastBar.timeframe,
    as_of: lastBar.timestamp,
    bars: window.length,
    close: closes[closes.length - 1],
  };

  const manifest = getIndicatorManifest();
  if (manifest) {
    for (const ind of Object.values(manifest)) {
      Object.assign(feature, applyManifestIndicator(ind, window, closes, periods));
    }
    return feature;
  }

  // Legacy Hardcoded Fallback
  const bands = bollingerBands(closes, periods.bollinger);
  const smc = calculateSmartMoneyConceptSignals(window, { structureStrength: periods.structure });
  const divergence = calculateDivergenceSignals(window, {
    structureStrength: periods.structure,
    rsiPeriod: periods.divergence,
  });
  const sessionProfile = calculateSessionVolumeProfile(window, {
    binCount: periods.sessionBins,
    minimumBars: periods.sessionMinimumBars,
    sessionStartHour: periods.sessionStartHour,
    timezoneOffsetMinutes: periods.sessionTimezoneOffsetMinutes,
  });

  return {
    ...feature,
    return_fast: returns(closes, periods.returnFast),
    return_slow: returns(closes, periods.returnSlow),
    volatility: rollingVolatility(closes, periods.volatility),
    rsi: rsi(closes, periods.rsi),
    macd: macd(closes),
    atr: atr(window, periods.atr),
    bollinger_upper: bands ? bands.upper : null,
    bollinger_middle: bands ? bands.middle : null,
    bollinger_lower: bands ? bands.lower : null,
    smc_score: smc ? smc.score : null,
    smc_bias: smc ? smc.bias : null,
    smc_bullish_structure_break: smc ? smc.signals.bullish_structure_break : null,
    smc_bearish_structure_break: smc ? smc.signals.bearish_structure_break : null,
    smc_bullish_liquidity_sweep: smc ? smc.signals.bullish_liquidity_sweep : null,
    smc_bearish_liquidity_sweep: smc ? smc.signals.bearish_liquidity_sweep : null,
    smc_bullish_fair_value_gap: smc ? smc.signals.bullish_fair_value_gap : null,
    smc_bearish_fair_value_gap: smc ? smc.signals.bearish_fair_value_gap : null,
    divergence_score: divergence ? divergence.score : null,
    divergence_bullish: divergence ? divergence.bullish : null,
    divergence_bearish: divergence ? divergence.bearish : null,
    rsi_bullish_divergence: divergence ? divergence.rsi.bullish : null,
    rsi_bearish_divergence: divergence ? divergence.rsi.bearish : null,
    macd_bullish_divergence: divergence ? divergence.macd.bullish : null,
    macd_bearish_divergence: divergence ? divergence.macd.bearish : null,
    session_volume_profile_session_key: sessionProfile ? sessionProfile.session_key : null,
    session_volume_profile_poc: sessionProfile ? sessionProfile.poc_price : null,
    session_volume_profile_vah: sessionProfile ? sessionProfile.value_area_high : null,
    session_volume_profile_val: sessionProfile ? sessionProfile.value_area_low : null,
    session_volume_profile_vwap: sessionProfile ? sessionProfile.vwap : null,
    session_volume_profile_position: sessionProfile ? sessionProfile.position : null,
    session_volume_profile_imbalance: sessionProfile ? sessionProfile.imbalance : null,
    session_volume_profile_acceptance: sessionProfile ? sessionProfile.acceptance : null,
  };
}

function calculateFeatureFrame(sources, periods = {}) {
  const mergedPeriods = mergePeriods(periods);
  const groups = groupOhlcv(sources);
  const features = [];
  const skipped = [];

  for (const [key, bars] of groups.entries()) {
    if (bars.length < 2) {
      skipped.push({ key, reason: 'insufficient_history', bars: bars.length });
      continue;
    }
    features.push(featureFromWindow(key, bars, mergedPeriods));
  }

  return {
    generated_at: new Date().toISOString(),
    indicator_periods: mergedPeriods,
    feature_count: features.length,
    skipped,
    features,
  };
}

function calculateRollingFeatureFrame(sources, minimumBars = 2, periods = {}) {
  const mergedPeriods = mergePeriods(periods);
  const groups = groupOhlcv(sources);
  const features = [];
  const skipped = [];

  for (const [key, bars] of groups.entries()) {
    if (bars.length < minimumBars) {
      skipped.push({ key, reason: 'insufficient_history', bars: bars.length });
      continue;
    }
    for (let end = minimumBars; end <= bars.length; end += 1) {
      const window = bars.slice(0, end);
      features.push(featureFromWindow(key, window, mergedPeriods));
    }
  }

  return {
    generated_at: new Date().toISOString(),
    indicator_periods: mergedPeriods,
    feature_count: features.length,
    skipped,
    features,
  };
}

function symbolHash(symbol) {
  let h = 5381;
  for (let j = 0; j < symbol.length; j++) h = (Math.imul(h, 31) + symbol.charCodeAt(j)) | 0;
  return Math.abs(h);
}

function generateSampleBars(symbol = 'SPY', count = 96, timeframe = '1d') {
  const bars = [];
  const start = Date.parse('2025-01-01T00:00:00.000Z');
  const seed = symbolHash(symbol);
  // Per-symbol price dynamics — deterministic but genuinely different across assets
  const startPrice = 20 + (seed % 480);              // $20–$500
  const drift      = 0.0001 + (seed % 12) * 0.0001;  // 0.01%–0.13% daily drift
  const cycleFreq  = 3 + (seed % 9);                 // cycle period 3–11 bars
  const cycleMag   = 0.005 + (seed % 8) * 0.001;     // cycle amplitude 0.5%–1.2%
  const shockEvery = 13 + (seed % 17);               // shock every 13–29 bars
  const shockSize  = -(0.008 + (seed % 10) * 0.001); // shock -0.8%–-1.7%
  let close = startPrice;
  const minutesPerBar = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
  const stepMs = (minutesPerBar[timeframe] || 1440) * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    const cycle = Math.sin(i / cycleFreq) * cycleMag;
    const shock = i % shockEvery === 0 ? shockSize : 0;
    const nextClose = close * (1 + drift + cycle + shock);
    const open = close;
    const high = Math.max(open, nextClose) * 1.004;
    const low = Math.min(open, nextClose) * 0.996;
    bars.push({
      family: 'equities',
      provider: 'sample',
      symbol,
      timeframe,
      timestamp: new Date(start + i * stepMs).toISOString(),
      open,
      high,
      low,
      close: nextClose,
      volume: 1000000 + i * 1000,
      source: 'deterministic-sample',
    });
    close = nextClose;
  }
  return bars;
}

function generateSyntheticLTF(bar, targetCount = 24, seed = null) {
  // Deterministic LCG — same algorithm as createSeededRandom in backtest.js.
  // Default seed: bar timestamp, so identical inputs always produce identical output.
  let s = 2166136261;
  const seedStr = String(seed !== null ? seed : bar.timestamp);
  for (let i = 0; i < seedStr.length; i++) { s ^= seedStr.charCodeAt(i); s = Math.imul(s, 16777619); }
  const rand = () => { s += s << 13; s ^= s >>> 7; s += s << 3; s ^= s >>> 17; s += s << 5; return (s >>> 0) / 4294967296; };

  const bars = [];
  const { open, high, low, close, timestamp } = bar;
  const startTs = Date.parse(timestamp);
  const durationMs = 24 * 60 * 60 * 1000; // Assume 1d source
  const stepMs = durationMs / targetCount;

  let currentOpen = open;
  const totalRange = high - low;
  const volatility = totalRange / Math.sqrt(targetCount);

  for (let i = 0; i < targetCount; i++) {
    const isLast = i === targetCount - 1;
    const drift = (close - currentOpen) / (targetCount - i);
    const shock = (rand() - 0.5) * volatility;
    const subClose = isLast ? close : currentOpen + drift + shock;

    // Sub-bar high/low constrained by parent high/low
    const subHigh = Math.min(high, Math.max(currentOpen, subClose) + rand() * (volatility / 2));
    const subLow = Math.max(low, Math.min(currentOpen, subClose) - rand() * (volatility / 2));

    bars.push({
      ...bar,
      timestamp: new Date(startTs + i * stepMs).toISOString(),
      timeframe: `syn_${targetCount}`,
      open: Number(currentOpen.toFixed(4)),
      high: Number(subHigh.toFixed(4)),
      low: Number(subLow.toFixed(4)),
      close: Number(subClose.toFixed(4)),
      volume: Number((bar.volume / targetCount).toFixed(0)),
      source: 'synthetic-ltf',
    });
    currentOpen = subClose;
  }
  return bars;
}

function calculateCorrelationDivergence(seriesA, seriesB, shortPeriod = 20, longPeriod = 100) {
  if (seriesA.length < longPeriod || seriesA.length !== seriesB.length) return null;

  const currentCorr = rollingCorrelation(seriesA, seriesB, shortPeriod);
  
  // Calculate historical baseline (mean of rolling correlations)
  const correlations = [];
  for (let i = longPeriod; i > shortPeriod; i--) {
    const endOffset = -i + shortPeriod;
    const winA = seriesA.slice(-i, endOffset);
    const winB = seriesB.slice(-i, endOffset);
    correlations.push(pearsonCorrelation(winA, winB));
  }
  
  const baselineCorr = mean(correlations);
  const divergence = currentCorr - baselineCorr;

  return {
    current: Number(currentCorr.toFixed(4)),
    baseline: Number(baselineCorr.toFixed(4)),
    divergence: Number(divergence.toFixed(4)),
    isBreaking: Math.abs(divergence) > 0.3 // Threshold for "regime shift"
  };
}

function calculateCryptoStableSentiment(cryptoSeries, stableSeries, period = 20) {
  if (cryptoSeries.length < period || cryptoSeries.length !== stableSeries.length) return null;

  const corr = rollingCorrelation(cryptoSeries, stableSeries, period);
  const cryptoReturns = returns(cryptoSeries, period);
  const stableReturns = returns(stableSeries, period);

  // Interpretation:
  // Usually Crypto and Stablecoin Dominance/Cap are inversely correlated (~ -0.8)
  // If correlation shifts towards 0 or positive, it indicates a liquidity regime shift.
  
  let sentiment = 'NEUTRAL';
  let signal = 'WAIT';

  if (corr < -0.7) {
    sentiment = cryptoReturns > 0 ? 'BULLISH_STABLE' : 'BEARISH_FLIGHT';
    signal = cryptoReturns > 0 ? 'HOLD' : 'DE-RISK';
  } else if (corr > 0) {
    sentiment = (cryptoReturns > 0 && stableReturns > 0) ? 'LOCKED_GROWTH' : 'DIVERGENT';
    signal = (cryptoReturns > 0 && stableReturns > 0) ? 'ACCUMULATE' : 'CAUTION';
  }

  return {
    correlation: Number(corr.toFixed(4)),
    crypto_return: Number((cryptoReturns * 100).toFixed(2)) + '%',
    stable_return: Number((stableReturns * 100).toFixed(2)) + '%',
    sentiment,
    signal
  };
}

module.exports = {
  atr,
  bollingerBands,
  calculateDivergenceSignals,
  calculateCorrelationDivergence,
  calculateCryptoStableSentiment,
  calculateFeatureFrame,
  calculateSmartMoneyConceptSignals,
  calculateSessionVolumeProfile,
  calculateRollingFeatureFrame,
  DEFAULT_PERIODS,
  generateSampleBars,
  generateSyntheticLTF,
  groupOhlcv,
  mergePeriods,
  macd,
  pearsonCorrelation,
  returns,
  rollingCorrelation,
  rollingVolatility,
  rsi,
};
