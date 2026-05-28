const { OHLCV_FAMILIES, isFiniteNumber } = require('./market_validation');

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
};

function mergePeriods(periods = {}) {
  return { ...DEFAULT_PERIODS, ...periods };
}

function featureFromWindow(key, window, periods = DEFAULT_PERIODS) {
  const closes = window.map((bar) => bar.close).filter(isFiniteNumber);
  const bands = bollingerBands(closes, periods.bollinger);
  return {
    key,
    symbol: window[window.length - 1].symbol,
    family: window[window.length - 1].family,
    provider: window[window.length - 1].provider || null,
    timeframe: window[window.length - 1].timeframe,
    as_of: window[window.length - 1].timestamp,
    bars: window.length,
    close: closes[closes.length - 1],
    return_fast: returns(closes, periods.returnFast),
    return_slow: returns(closes, periods.returnSlow),
    volatility: rollingVolatility(closes, periods.volatility),
    rsi: rsi(closes, periods.rsi),
    macd: macd(closes),
    atr: atr(window, periods.atr),
    bollinger_upper: bands ? bands.upper : null,
    bollinger_middle: bands ? bands.middle : null,
    bollinger_lower: bands ? bands.lower : null,
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

function generateSampleBars(symbol = 'SPY', count = 96, timeframe = '1d') {
  const bars = [];
  const start = Date.parse('2025-01-01T00:00:00.000Z');
  let close = 100;
  const stepMs = timeframe === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    const drift = 0.0008;
    const cycle = Math.sin(i / 5) * 0.01;
    const shock = i % 23 === 0 ? -0.015 : 0;
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

module.exports = {
  atr,
  bollingerBands,
  calculateFeatureFrame,
  calculateRollingFeatureFrame,
  DEFAULT_PERIODS,
  generateSampleBars,
  groupOhlcv,
  mergePeriods,
  macd,
  returns,
  rollingVolatility,
  rsi,
};
