const { fetchJson } = require('./common');

const BASE_URL = 'https://api.twelvedata.com/time_series';

function getApiKey() {
  return (
    process.env.TWELVE_DATA_API_KEY ||
    process.env.TWELVE_API_KEY ||
    process.env.TWELVEDATA_API_KEY ||
    ''
  ).trim();
}

function intervalFromTimeframe(timeframe) {
  const map = {
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1h',
    '4h': '4h',
    '1d': '1day',
    '1w': '1week',
  };
  return map[timeframe] || '1day';
}

function baseTimeframeFromRequested(timeframes = []) {
  const order = ['5m', '15m', '30m', '1h', '4h', '1d', '1w'];
  return order.find((tf) => timeframes.includes(tf)) || '1d';
}

function intervalMs(timeframe) {
  const map = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
  };
  return map[timeframe] || null;
}

function aggregateCandles(candles, timeframe, family, symbol, provider) {
  const bucketMs = intervalMs(timeframe);
  if (!bucketMs) {
    throw new Error(`Unsupported Twelve Data timeframe: ${timeframe}`);
  }

  const buckets = new Map();
  for (const candle of candles) {
    const ts = Number(candle.openTime);
    if (!Number.isFinite(ts)) continue;
    const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        family,
        provider,
        symbol,
        timeframe,
        timestamp: new Date(bucketStart).toISOString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume || 0;
  }

  return Array.from(buckets.values()).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function normalizeForexOrCryptoSymbol(symbol) {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean) return clean;
  if (clean.includes('/')) return clean;
  if (clean.endsWith('USDT')) return `${clean.slice(0, -4)}/USD`;
  if (clean.endsWith('USD')) return `${clean.slice(0, -3)}/USD`;
  if (clean.length === 6) return `${clean.slice(0, 3)}/${clean.slice(3)}`;
  return clean;
}

function normalizeSymbol(family, symbol) {
  if (family === 'fx' || family === 'crypto' || family === 'commodities') {
    return normalizeForexOrCryptoSymbol(symbol);
  }
  return String(symbol || '').trim().toUpperCase();
}

function parseRows(response, family, symbol, timeframe, provider) {
  if (!response || String(response.status || '').toLowerCase() !== 'ok') {
    return [];
  }

  const values = Array.isArray(response.values) ? response.values : [];
  const candles = [];
  for (const row of values) {
    const ts = row.datetime ? Date.parse(`${String(row.datetime).replace(' ', 'T')}Z`) : Number.NaN;
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    if (!Number.isFinite(ts) || ![open, high, low, close].every(Number.isFinite)) continue;

    candles.push({
      family,
      provider,
      symbol,
      timeframe,
      openTime: ts,
      timestamp: new Date(ts).toISOString(),
      open,
      high,
      low,
      close,
      volume: Number(row.volume || 0) || 0,
    });
  }

  return candles.sort((a, b) => a.openTime - b.openTime);
}

async function fetchTwelveDataBaseCandles(family, symbol, timeframe, historyDays = 5, startTime = null, endTime = null) {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const normalized = normalizeSymbol(family, symbol);
  const url = new URL(BASE_URL);
  url.searchParams.set('symbol', normalized);
  url.searchParams.set('interval', intervalFromTimeframe(timeframe));
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('apikey', apiKey);

  const end = new Date(endTime || Date.now());
  const start = startTime ? new Date(startTime) : new Date(end.getTime() - historyDays * 24 * 60 * 60 * 1000);
  url.searchParams.set('start_date', start.toISOString());
  url.searchParams.set('end_date', end.toISOString());

  const response = await fetchJson(url.toString());
  return parseRows(response, family, symbol, timeframe, 'twelve');
}

async function fetchTwelveDataSnapshot(family, symbol, timeframes, options = {}) {
  if (!Array.isArray(timeframes) || timeframes.length === 0) {
    return [];
  }

  const baseTimeframe = baseTimeframeFromRequested(timeframes);
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;

  const baseCandles = await fetchTwelveDataBaseCandles(family, symbol, baseTimeframe, historyDays, startTime, endTime);
  if (baseCandles.length === 0) return [];

  const output = [];
  for (const timeframe of timeframes) {
    if (timeframe === baseTimeframe) {
      output.push(...baseCandles.map((candle) => ({ ...candle, timeframe, timestamp: candle.timestamp || new Date(candle.openTime).toISOString() })));
      continue;
    }

    const bucketMs = intervalMs(timeframe);
    if (!bucketMs) continue;
    if (intervalMs(baseTimeframe) && bucketMs < intervalMs(baseTimeframe)) {
      continue;
    }
    output.push(...aggregateCandles(baseCandles, timeframe, family, symbol, 'twelve'));
  }

  return output.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

module.exports = {
  fetchTwelveDataBaseCandles,
  fetchTwelveDataSnapshot,
  normalizeSymbol,
};
