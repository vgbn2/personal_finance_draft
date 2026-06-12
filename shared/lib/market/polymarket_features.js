'use strict';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_SECOND = 1000;

const BARS_PER_DAY = Object.freeze({
  '1d': 1,
  '1h': 24,
  '5m': 288,
});

function normalizeInterval(interval = '1d') {
  const key = String(interval || '1d').trim().toLowerCase();
  if (key === 'daily' || key === 'day') return '1d';
  if (key === 'hourly' || key === 'hour') return '1h';
  if (key === '5min' || key === '5minutely') return '5m';
  return key;
}

function rollingWindowBars(interval = '1d', days = 7) {
  const normalized = normalizeInterval(interval);
  const barsPerDay = BARS_PER_DAY[normalized];
  if (!barsPerDay) {
    throw new RangeError(`Unsupported Polymarket feature interval '${interval}'. Use 1d, 1h, or 5m.`);
  }
  const parsedDays = Number(days);
  if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
    throw new RangeError(`Rolling window days must be positive, got '${days}'.`);
  }
  return Math.max(1, Math.round(barsPerDay * parsedDays));
}

function timeToMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) > 1e12 ? numeric : numeric * MS_PER_SECOND;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function pointTimeToMs(point) {
  const fromT = timeToMs(point && point.t);
  if (fromT !== null) return fromT;
  return timeToMs(point && point.iso);
}

function normalizePricePoints(points = []) {
  if (!Array.isArray(points)) {
    throw new TypeError('normalizePricePoints expected an array of { t, iso, p } points');
  }

  const deduped = new Map();
  for (const point of points) {
    const ms = pointTimeToMs(point);
    const p = Number(point && point.p);
    if (!Number.isFinite(ms) || !Number.isFinite(p) || p < 0 || p > 1) continue;
    deduped.set(ms, {
      t: Math.floor(ms / MS_PER_SECOND),
      iso: new Date(ms).toISOString(),
      p,
      _ms: ms,
    });
  }

  return Array.from(deduped.values()).sort((a, b) => a._ms - b._ms);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function stddev(values) {
  if (!values.length) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function resolveEndTime(options = {}) {
  return timeToMs(
    options.market_end_time
      ?? options.marketEndTime
      ?? options.end_time
      ?? options.endTime
      ?? null,
  );
}

function resolveStartTime(options = {}, fallbackMs = null) {
  return timeToMs(
    options.market_start_time
      ?? options.marketStartTime
      ?? options.start_time
      ?? options.startTime
      ?? null,
  ) ?? fallbackMs;
}

function buildPolymarketFeatureRows(points = [], options = {}) {
  const interval = normalizeInterval(options.interval || options.timeframe || '1d');
  const window7 = rollingWindowBars(interval, 7);
  const window14 = rollingWindowBars(interval, 14);
  const series = normalizePricePoints(points);
  const endMs = resolveEndTime(options);
  const startMs = resolveStartTime(options, series[0]?._ms ?? null);
  const totalDurationMs = endMs !== null && startMs !== null && endMs > startMs
    ? endMs - startMs
    : null;

  let peak = null;
  const rows = [];
  const prices = series.map((point) => point.p);

  for (let i = 0; i < series.length; i += 1) {
    const point = series[i];
    peak = peak === null ? point.p : Math.max(peak, point.p);

    const prices7 = prices.slice(Math.max(0, i - window7 + 1), i + 1);
    const prices14 = prices.slice(Math.max(0, i - window14 + 1), i + 1);
    const ma7 = mean(prices7);
    const vol7 = stddev(prices7);
    const momentum7 = i >= window7 ? point.p - prices[i - window7] : null;
    const zscore7 = vol7 && vol7 > 0 ? (point.p - ma7) / vol7 : 0;
    const timeToResolutionHours = endMs !== null
      ? Math.max(0, (endMs - point._ms) / MS_PER_HOUR)
      : null;
    const elapsedFraction = totalDurationMs !== null
      ? clamp01((point._ms - startMs) / totalDurationMs)
      : null;

    rows.push({
      t: point.t,
      iso: point.iso,
      interval,
      p: point.p,
      p_ma_7d: finiteOrNull(ma7),
      p_ma_14d: finiteOrNull(mean(prices14)),
      p_vol_7d: finiteOrNull(vol7),
      p_momentum_7d: finiteOrNull(momentum7),
      p_zscore_7d: finiteOrNull(zscore7),
      drawdown_from_peak: peak > 0 ? (point.p / peak) - 1 : 0,
      time_to_resolution_hours: finiteOrNull(timeToResolutionHours),
      elapsed_fraction: elapsedFraction,
    });
  }

  return rows;
}

function nonNegativeFinite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function estimatePolymarketExecutionCost(options = {}) {
  const fee = nonNegativeFinite(options.fee, 0);
  const halfSpreadEstimate = nonNegativeFinite(
    options.half_spread_estimate ?? options.halfSpreadEstimate,
    0,
  );
  const yInput = options.Y ?? options.y;
  const y = yInput === undefined || yInput === null ? 1 : nonNegativeFinite(yInput, 1);
  const rollingVolatility = nonNegativeFinite(
    options.rolling_volatility ?? options.rollingVolatility,
    0,
  );
  const orderNotional = nonNegativeFinite(options.order_notional ?? options.orderNotional, 0);
  const rollingMarketVolume = nonNegativeFinite(
    options.rolling_market_volume ?? options.rollingMarketVolume,
    0,
  );

  const impactEstimate = y > 0 && orderNotional > 0 && rollingMarketVolume > 0 && rollingVolatility > 0
    ? y * rollingVolatility * Math.sqrt(orderNotional / rollingMarketVolume)
    : 0;

  return {
    fee,
    half_spread_estimate: halfSpreadEstimate,
    impact_estimate: impactEstimate,
    total_cost: fee + halfSpreadEstimate + impactEstimate,
    Y: y,
    rolling_volatility: rollingVolatility,
    order_notional: orderNotional,
    rolling_market_volume: rollingMarketVolume,
  };
}

module.exports = {
  BARS_PER_DAY,
  buildPolymarketFeatureRows,
  estimatePolymarketExecutionCost,
  generatePolymarketFeatures: buildPolymarketFeatureRows,
  normalizePricePoints,
  rollingWindowBars,
};
