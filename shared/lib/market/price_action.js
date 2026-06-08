const { isFiniteNumber } = require('./validation');

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
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

function macd(closes) {
  if (closes.length < 26) return null;
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  return fast !== null && slow !== null ? fast - slow : null;
}

function swingPoints(bars, strength = 2) {
  const lookback = Math.max(1, Math.floor(strength));
  if (!Array.isArray(bars) || bars.length < lookback * 2 + 1) {
    return { highs: [], lows: [] };
  }

  const highs = [];
  const lows = [];
  for (let i = lookback; i < bars.length - lookback; i += 1) {
    const bar = bars[i];
    if (!bar || !isFiniteNumber(bar.high) || !isFiniteNumber(bar.low)) continue;
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = i - lookback; j <= i + lookback; j += 1) {
      if (j === i) continue;
      const peer = bars[j];
      if (!peer) continue;
      if (isFiniteNumber(peer.high) && peer.high > bar.high) isSwingHigh = false;
      if (isFiniteNumber(peer.low) && peer.low < bar.low) isSwingLow = false;
      if (!isSwingHigh && !isSwingLow) break;
    }
    if (isSwingHigh) highs.push({ index: i, timestamp: bar.timestamp, price: bar.high });
    if (isSwingLow) lows.push({ index: i, timestamp: bar.timestamp, price: bar.low });
  }
  return { highs, lows };
}

function lastTwo(values) {
  if (!Array.isArray(values) || values.length < 2) return [null, null];
  return [values[values.length - 2], values[values.length - 1]];
}

function rsiAtIndex(closes, index, period = 14) {
  if (!Array.isArray(closes) || index < 1) return null;
  return rsi(closes.slice(0, index + 1), period);
}

function macdAtIndex(closes, index) {
  if (!Array.isArray(closes) || index < 1) return null;
  return macd(closes.slice(0, index + 1));
}

function summarizeDivergence(priceSwings, closes, oscillatorAt, direction) {
  const [previous, current] = lastTwo(priceSwings);
  if (!previous || !current) {
    return { detected: false, previous: null, current: null, delta_price: null, delta_oscillator: null };
  }

  const previousOsc = oscillatorAt(closes, previous.index);
  const currentOsc = oscillatorAt(closes, current.index);
  if (!Number.isFinite(previousOsc) || !Number.isFinite(currentOsc)) {
    return { detected: false, previous, current, delta_price: current.price - previous.price, delta_oscillator: null };
  }

  const deltaPrice = current.price - previous.price;
  const deltaOscillator = currentOsc - previousOsc;
  const detected = direction === 'bullish'
    ? deltaPrice < 0 && deltaOscillator > 0
    : deltaPrice > 0 && deltaOscillator < 0;

  return {
    detected,
    previous,
    current,
    previous_oscillator: previousOsc,
    current_oscillator: currentOsc,
    delta_price: deltaPrice,
    delta_oscillator: deltaOscillator,
  };
}

function calculateSmartMoneyConceptSignals(bars, options = {}) {
  const series = Array.isArray(bars) ? bars.filter((bar) => bar && isFiniteNumber(bar.high) && isFiniteNumber(bar.low) && isFiniteNumber(bar.close)) : [];
  const current = series[series.length - 1];
  if (!current || series.length < 5) return null;

  const strength = Math.max(1, Math.floor(options.structureStrength ?? 2));
  const swings = swingPoints(series, strength);
  const highs = swings.highs;
  const lows = swings.lows;
  const [previousHigh, lastHigh] = lastTwo(highs);
  const [previousLow, lastLow] = lastTwo(lows);
  const prior = series[series.length - 2] || null;

  const bullishStructure = Number.isFinite(lastHigh?.price) && Number.isFinite(prior?.close) && prior.close <= lastHigh.price && current.close > lastHigh.price;
  const bearishStructure = Number.isFinite(lastLow?.price) && Number.isFinite(prior?.close) && prior.close >= lastLow.price && current.close < lastLow.price;
  const bullishSweep = Number.isFinite(lastHigh?.price) && current.high > lastHigh.price && current.close < lastHigh.price;
  const bearishSweep = Number.isFinite(lastLow?.price) && current.low < lastLow.price && current.close > lastLow.price;
  const bullishFvg = series.length >= 3 && current.low > series[series.length - 3].high;
  const bearishFvg = series.length >= 3 && current.high < series[series.length - 3].low;

  const higherHighs = Number.isFinite(previousHigh?.price) && Number.isFinite(lastHigh?.price) && lastHigh.price > previousHigh.price;
  const higherLows = Number.isFinite(previousLow?.price) && Number.isFinite(lastLow?.price) && lastLow.price > previousLow.price;
  const lowerHighs = Number.isFinite(previousHigh?.price) && Number.isFinite(lastHigh?.price) && lastHigh.price < previousHigh.price;
  const lowerLows = Number.isFinite(previousLow?.price) && Number.isFinite(lastLow?.price) && lastLow.price < previousLow.price;

  let bias = 'neutral';
  if (higherHighs && higherLows) bias = 'bullish';
  else if (lowerHighs && lowerLows) bias = 'bearish';
  else if (bullishStructure || bullishSweep) bias = 'bullish';
  else if (bearishStructure || bearishSweep) bias = 'bearish';

  let score = 0;
  if (bias === 'bullish') score += 0.35;
  if (bias === 'bearish') score -= 0.35;
  if (bullishStructure) score += 0.55;
  if (bearishStructure) score -= 0.55;
  if (bullishSweep) score += 0.4;
  if (bearishSweep) score -= 0.4;
  if (bullishFvg) score += 0.2;
  if (bearishFvg) score -= 0.2;
  score = Math.max(-1, Math.min(1, score));

  return {
    ok: true,
    bias,
    score,
    structure_strength: strength,
    swings: {
      swing_highs: highs,
      swing_lows: lows,
      last_swing_high: lastHigh,
      previous_swing_high: previousHigh,
      last_swing_low: lastLow,
      previous_swing_low: previousLow,
    },
    signals: {
      bullish_structure_break: bullishStructure,
      bearish_structure_break: bearishStructure,
      bullish_liquidity_sweep: bullishSweep,
      bearish_liquidity_sweep: bearishSweep,
      bullish_fair_value_gap: bullishFvg,
      bearish_fair_value_gap: bearishFvg,
    },
  };
}

function calculateDivergenceSignals(bars, options = {}) {
  const series = Array.isArray(bars) ? bars.filter((bar) => bar && isFiniteNumber(bar.close)) : [];
  if (series.length < 5) return null;

  const closes = series.map((bar) => bar.close);
  const strength = Math.max(1, Math.floor(options.structureStrength ?? 2));
  const rsiPeriod = Math.max(2, Math.floor(options.rsiPeriod ?? 14));
  const swings = swingPoints(series, strength);

  const bullishRsi = summarizeDivergence(swings.lows, closes, (values, index) => rsiAtIndex(values, index, rsiPeriod), 'bullish');
  const bearishRsi = summarizeDivergence(swings.highs, closes, (values, index) => rsiAtIndex(values, index, rsiPeriod), 'bearish');
  const bullishMacd = summarizeDivergence(swings.lows, closes, macdAtIndex, 'bullish');
  const bearishMacd = summarizeDivergence(swings.highs, closes, macdAtIndex, 'bearish');

  const bullishCount = [bullishRsi, bullishMacd].filter((item) => item.detected).length;
  const bearishCount = [bearishRsi, bearishMacd].filter((item) => item.detected).length;
  const score = Math.max(-1, Math.min(1, (bullishCount - bearishCount) / 2));

  return {
    ok: true,
    score,
    bullish: bullishCount > 0,
    bearish: bearishCount > 0,
    bullish_count: bullishCount,
    bearish_count: bearishCount,
    rsi: {
      bullish: bullishRsi.detected,
      bearish: bearishRsi.detected,
      bullish_details: bullishRsi,
      bearish_details: bearishRsi,
    },
    macd: {
      bullish: bullishMacd.detected,
      bearish: bearishMacd.detected,
      bullish_details: bullishMacd,
      bearish_details: bearishMacd,
    },
  };
}

function sessionKeyFromTimestamp(timestamp, options = {}) {
  const stamp = Date.parse(timestamp || '');
  if (!Number.isFinite(stamp)) return null;
  const timezoneOffsetMinutes = Number.isFinite(Number(options.timezoneOffsetMinutes))
    ? Number(options.timezoneOffsetMinutes)
    : 0;
  const sessionStartHour = Number.isFinite(Number(options.sessionStartHour))
    ? Number(options.sessionStartHour)
    : 0;
  const shifted = stamp + (timezoneOffsetMinutes * 60 * 1000) - (sessionStartHour * 60 * 60 * 1000);
  return new Date(shifted).toISOString().slice(0, 10);
}

function calculateSessionVolumeProfile(bars, options = {}) {
  const normalizedSeries = Array.isArray(bars)
    ? bars.filter((bar) => bar && isFiniteNumber(bar.close) && isFiniteNumber(bar.high) && isFiniteNumber(bar.low) && isFiniteNumber(bar.volume) && Number.isFinite(Date.parse(bar.timestamp || '')))
    : [];
  if (normalizedSeries.length < Math.max(5, Math.floor(options.minimumBars || 5))) return null;

  const sessionGroups = new Map();
  for (const bar of normalizedSeries) {
    const sessionKey = sessionKeyFromTimestamp(bar.timestamp, options);
    if (!sessionKey) continue;
    if (!sessionGroups.has(sessionKey)) sessionGroups.set(sessionKey, []);
    sessionGroups.get(sessionKey).push(bar);
  }
  const sessions = Array.from(sessionGroups.entries()).sort(([left], [right]) => left.localeCompare(right));
  if (!sessions.length) return null;
  const [sessionKey, sessionBars] = sessions[sessions.length - 1];
  if (sessionBars.length < Math.max(5, Math.floor(options.minimumBars || 5))) return null;

  const binCount = Math.max(8, Math.min(80, Math.floor(options.binCount || 24)));
  const lows = sessionBars.map((bar) => bar.low);
  const highs = sessionBars.map((bar) => bar.high);
  let minPrice = Math.min(...lows);
  let maxPrice = Math.max(...highs);
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) return null;
  if (minPrice === maxPrice) { minPrice -= 0.5; maxPrice += 0.5; }
  const range = maxPrice - minPrice;
  const binWidth = range / binCount;
  if (!Number.isFinite(binWidth) || binWidth <= 0) return null;

  const bins = Array.from({ length: binCount }, (_, index) => ({
    index,
    low: minPrice + index * binWidth,
    high: index === binCount - 1 ? maxPrice : minPrice + (index + 1) * binWidth,
    center: minPrice + (index + 0.5) * binWidth,
    volume: 0,
    bars: 0,
  }));

  let totalVolume = 0;
  let weightedPriceTotal = 0;
  for (const bar of sessionBars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const safeVolume = Math.max(0, Number(bar.volume) || 0);
    const rawIndex = Math.floor((typicalPrice - minPrice) / binWidth);
    const index = Math.max(0, Math.min(binCount - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
    bins[index].volume += safeVolume;
    bins[index].bars += 1;
    totalVolume += safeVolume;
    weightedPriceTotal += typicalPrice * safeVolume;
  }
  if (totalVolume <= 0) return null;

  let pocIndex = 0;
  for (let i = 1; i < bins.length; i += 1) {
    if (bins[i].volume > bins[pocIndex].volume) pocIndex = i;
  }

  let lowIndex = pocIndex;
  let highIndex = pocIndex;
  let cumulative = bins[pocIndex].volume;
  const targetVolume = totalVolume * 0.7;
  while (cumulative < targetVolume && (lowIndex > 0 || highIndex < bins.length - 1)) {
    const leftVolume = lowIndex > 0 ? bins[lowIndex - 1].volume : -1;
    const rightVolume = highIndex < bins.length - 1 ? bins[highIndex + 1].volume : -1;
    if (rightVolume >= leftVolume && highIndex < bins.length - 1) {
      highIndex += 1;
      cumulative += bins[highIndex].volume;
    } else if (lowIndex > 0) {
      lowIndex -= 1;
      cumulative += bins[lowIndex].volume;
    } else {
      break;
    }
  }

  const current = sessionBars[sessionBars.length - 1];
  const valueAreaLow = bins[lowIndex].low;
  const valueAreaHigh = bins[highIndex].high;
  const vwap = weightedPriceTotal / totalVolume;
  const position = valueAreaHigh > valueAreaLow
    ? Math.max(0, Math.min(1, (current.close - valueAreaLow) / (valueAreaHigh - valueAreaLow)))
    : 0.5;
  const acceptance = current.close > valueAreaHigh ? 'above_value_area' : current.close < valueAreaLow ? 'below_value_area' : 'inside_value_area';

  const summary = {
    ok: true,
    session_key: sessionKey,
    session_bars: sessionBars.length,
    total_volume: totalVolume,
    open: sessionBars[0].open,
    high: Math.max(...highs),
    low: Math.min(...lows),
    close: current.close,
    vwap,
    poc_price: bins[pocIndex].center,
    poc_volume: bins[pocIndex].volume,
    value_area_low: valueAreaLow,
    value_area_high: valueAreaHigh,
    position,
    imbalance: range > 0 ? (current.close - vwap) / range : 0,
    acceptance,
    bin_count: binCount,
  };

  if (options.includeBins) summary.bins = bins;
  return summary;
}

module.exports = {
  calculateSmartMoneyConceptSignals,
  calculateDivergenceSignals,
  calculateSessionVolumeProfile,
};
