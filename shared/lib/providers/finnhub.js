const { fetchJson } = require('./common');
const { resolveCurrencyPair } = require('./fx');

const BASE_URL = 'https://finnhub.io/api/v1';

function getApiKey() {
  return (
    process.env.FINNHUB_API_KEY ||
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_TOKEN ||
    process.env.FINHUB_SECRET_KEY ||
    ''
  ).trim();
}

function resolutionFromTimeframe(timeframe) {
  const map = {
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '60',
    '1d': 'D',
    '1w': 'W',
  };
  return map[timeframe] || 'D';
}

function baseTimeframeFromRequested(timeframes = []) {
  if (timeframes.includes('5m')) return '5m';
  if (timeframes.includes('15m')) return '15m';
  if (timeframes.includes('30m')) return '30m';
  if (timeframes.includes('1h') || timeframes.includes('4h')) return '1h';
  if (timeframes.includes('1d')) return '1d';
  if (timeframes.includes('1w')) return '1w';
  return '1d';
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
    throw new Error(`Unsupported Finnhub timeframe: ${timeframe}`);
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

function normalizeCryptoSymbol(symbol) {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean) return clean;
  if (clean.includes(':')) return clean;
  return `BINANCE:${clean}`;
}

function normalizeForexSymbol(symbol) {
  const pair = resolveCurrencyPair(symbol);
  return `OANDA:${pair.base}_${pair.quote}`;
}

function normalizeStockSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function normalizeSymbol(family, symbol) {
  if (family === 'fx') return normalizeForexSymbol(symbol);
  if (family === 'crypto') return normalizeCryptoSymbol(symbol);
  return normalizeStockSymbol(symbol);
}

function parseCandles(response, family, symbol, timeframe, provider) {
  if (!response || String(response.s || '').toLowerCase() !== 'ok') {
    return [];
  }

  const timestamps = response.t || [];
  const opens = response.o || [];
  const highs = response.h || [];
  const lows = response.l || [];
  const closes = response.c || [];
  const volumes = response.v || [];

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = Number(opens[i]);
    const high = Number(highs[i]);
    const low = Number(lows[i]);
    const close = Number(closes[i]);
    if (![open, high, low, close].every(Number.isFinite)) continue;

    candles.push({
      family,
      provider,
      symbol,
      timeframe,
      openTime: Number(timestamps[i]) * 1000,
      timestamp: new Date(Number(timestamps[i]) * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume: Number(volumes[i] || 0) || 0,
    });
  }

  return candles.sort((a, b) => a.openTime - b.openTime);
}

async function fetchFinnhubBaseCandles(family, symbol, timeframe, historyDays = 5, startTime = null, endTime = null) {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const normalized = normalizeSymbol(family, symbol);
  const resolution = resolutionFromTimeframe(timeframe);
  const now = Math.floor((endTime || Date.now()) / 1000);
  const from = startTime ? Math.floor(startTime / 1000) : Math.floor((Date.now() - historyDays * 24 * 60 * 60 * 1000) / 1000);

  const pathName = family === 'fx' ? 'forex/candle' : family === 'crypto' ? 'crypto/candle' : 'stock/candle';
  const url = new URL(`${BASE_URL}/${pathName}`);
  url.searchParams.set('symbol', normalized);
  url.searchParams.set('resolution', resolution);
  url.searchParams.set('from', String(from));
  url.searchParams.set('to', String(now));
  url.searchParams.set('token', apiKey);

  const response = await fetchJson(url.toString());
  return parseCandles(response, family, symbol, timeframe, 'finnhub');
}

async function fetchFinnhubSnapshot(family, symbol, timeframes, options = {}) {
  if (!Array.isArray(timeframes) || timeframes.length === 0) {
    return [];
  }

  const baseTimeframe = baseTimeframeFromRequested(timeframes);
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;

  const baseCandles = await fetchFinnhubBaseCandles(family, symbol, baseTimeframe, historyDays, startTime, endTime);
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
    output.push(...aggregateCandles(baseCandles, timeframe, family, symbol, 'finnhub'));
  }

  return output.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

module.exports = {
  fetchFinnhubBaseCandles,
  fetchFinnhubSnapshot,
  normalizeSymbol,
};
