const {
  SUPPORTED_INTERVALS,
  parseTimeframeMs,
  bucketStartFor,
} = require('./constants');

function aggregateCandles(candles, interval, symbol, provider, family = "unknown", options = {}) {
  const intervalMs = SUPPORTED_INTERVALS[interval] ?? parseTimeframeMs(interval);
  if (!intervalMs) {
    throw new Error(`Unsupported timeframe: ${interval}`);
  }
  const sourceTimeframe = options.sourceTimeframe || options.baseTimeframe || null;
  const sourceIntervalMs = sourceTimeframe ? (SUPPORTED_INTERVALS[sourceTimeframe] ?? parseTimeframeMs(sourceTimeframe)) : null;
  const derivedFromDaily = sourceIntervalMs && sourceIntervalMs >= SUPPORTED_INTERVALS['1d'] && intervalMs < SUPPORTED_INTERVALS['1d'];
  const source = sourceTimeframe ? `${provider}-rollup-from-${sourceTimeframe}` : `${provider}-rollup`;

  const buckets = new Map();
  for (const candle of candles) {
    const bucketStart = bucketStartFor(candle.openTime, interval);
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        family,
        provider,
        symbol,
        timeframe: interval,
        timestamp: new Date(bucketStart).toISOString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        source,
        provenance: source,
        ...(sourceTimeframe ? { derived_from_timeframe: sourceTimeframe } : {}),
        ...(derivedFromDaily ? { experimental_only: true, experimental_reason: 'daily_derived_lower_timeframe' } : {}),
      });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }

  return Array.from(buckets.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

module.exports = {
  aggregateCandles,
};
