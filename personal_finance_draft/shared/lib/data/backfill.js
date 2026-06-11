const { fetchBinanceBaseCandles } = require('../providers/binance');
const { fetchCoinbaseBaseCandles } = require('../providers/coinbase');
const { fetchYahooBaseCandles } = require('../providers/yahoo');
const { fetchAlpacaBaseCandles } = require('../providers/alpaca');

const BARS_PER_DAY = {
  crypto: { '1m': 1440, '5m': 288, '15m': 96, '30m': 48, '1h': 24, '4h': 6, '1d': 1, '1w': 1 / 7, '1mo': 1 / 30 },
  equities: { '1m': 390, '5m': 78, '15m': 26, '30m': 13, '1h': 7, '4h': 2, '1d': 1, '1w': 1 / 7, '1mo': 1 / 30 },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVIDER_MAX_BARS = 1000;

function toIso(ts) {
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function windowText(startTs, endTs) {
  const start = toIso(startTs) || 'unknown';
  const end = toIso(endTs) || 'unknown';
  return `[${start} - ${end}]`;
}

function candleWindow(candles) {
  if (!candles || candles.length === 0) {
    return { startTs: null, endTs: null };
  }
  return {
    startTs: candles[0].openTime,
    endTs: candles[candles.length - 1].openTime,
  };
}

function dedupeSortCandles(candles) {
  const seen = new Set();
  return candles.filter(c => {
    if (seen.has(c.openTime)) return false;
    seen.add(c.openTime);
    return true;
  }).sort((a, b) => a.openTime - b.openTime);
}

function attachBackfillMeta(candles, meta) {
  Object.defineProperty(candles, 'backfillMeta', {
    value: meta,
    enumerable: false,
    configurable: true,
  });
  return candles;
}

async function fetchPaginated(symbol, timeframe, days, family, fetchFn, forcedEndTs = null) {
  if (typeof fetchFn !== 'function') {
    throw new Error(`No fetch function supplied for ${symbol}:${timeframe}`);
  }

  const marketType = family === 'crypto' ? 'crypto' : 'equities';
  const barsPerDay = BARS_PER_DAY[marketType][timeframe] || 1;
  const providerMaxBars = PROVIDER_MAX_BARS;
  const maxDaysPerChunk = Math.max(1, Math.floor(providerMaxBars / barsPerDay));
  const requestedEndTs = forcedEndTs || Date.now();
  let currentEndTs = requestedEndTs;
  const targetStartTs = requestedEndTs - (days * DAY_MS);
  const allCandles = [];
  const chunks = [];

  while (currentEndTs > targetStartTs) {
    let currentStartTs = currentEndTs - (maxDaysPerChunk * DAY_MS);
    if (currentStartTs < targetStartTs) currentStartTs = targetStartTs;

    try {
      let chunk;
      if (family === 'crypto') {
        chunk = await fetchFn(symbol, providerMaxBars, timeframe, currentStartTs, currentEndTs);
      } else {
        chunk = await fetchFn(symbol, timeframe, null, currentStartTs, currentEndTs);
      }

      if (!chunk || chunk.length === 0) break;
      chunks.push({
        start_ts: currentStartTs,
        end_ts: currentEndTs,
        window: windowText(currentStartTs, currentEndTs),
        fetched_bars: chunk.length,
        max_bars: providerMaxBars,
      });
      allCandles.push(...chunk);
      currentEndTs = chunk[0].openTime - 1;
    } catch (error) {
      console.error(`  [BACKFILL] Chunk failed for ${symbol}:${timeframe} ${windowText(currentStartTs, currentEndTs)} max_bars=${providerMaxBars}: ${error.message}`);
      break;
    }
  }

  const sorted = dedupeSortCandles(allCandles);
  const actual = candleWindow(sorted);
  return attachBackfillMeta(sorted, {
    symbol,
    timeframe,
    family,
    requested_start_ts: targetStartTs,
    requested_end_ts: requestedEndTs,
    requested_window: windowText(targetStartTs, requestedEndTs),
    actual_start_ts: actual.startTs,
    actual_end_ts: actual.endTs,
    actual_window: windowText(actual.startTs, actual.endTs),
    provider_max_bars: providerMaxBars,
    max_days_per_chunk: maxDaysPerChunk,
    chunks,
    fetched_bars: sorted.length,
  });
}

async function fetchParallelBackfill(symbol, timeframe, totalDays, family, providers) {
  if (!providers || providers.length === 0) throw new Error('No providers supplied for parallel backfill');

  const capableProviders = providers.filter(p => {
    if (family === 'crypto') return p === 'binance' || p === 'coinbase' || p === 'alpaca';
    return p === 'yahoo' || p === 'alpaca';
  });

  if (capableProviders.length === 0) return [];

  const primaryProvider = capableProviders[0];
  const fetchByProvider = {
    binance: fetchBinanceBaseCandles,
    coinbase: fetchCoinbaseBaseCandles,
    yahoo: fetchYahooBaseCandles,
    alpaca: fetchAlpacaBaseCandles,
  };
  const fetchFn = fetchByProvider[primaryProvider];
  if (!fetchFn) throw new Error(`No fetch function for provider ${primaryProvider}`);

  // Parallel "Divide by N" strategy.
  const numWorkers = 4;
  const daysPerWorker = totalDays / numWorkers;
  const now = Date.now();
  const requestedStartTs = now - (totalDays * DAY_MS);

  console.log(`[PARALLEL] Orchestrating ${numWorkers} workers for ${totalDays} days of ${symbol}:${timeframe} using ${primaryProvider} ${windowText(requestedStartTs, now)} max_bars=${PROVIDER_MAX_BARS}`);

  const tasks = Array.from({ length: numWorkers }).map((_, index) => {
    const endTs = now - (index * daysPerWorker * DAY_MS);
    return fetchPaginated(symbol, timeframe, daysPerWorker, family, fetchFn, endTs);
  });

  const results = await Promise.all(tasks);
  const sorted = dedupeSortCandles(results.flat());
  const actual = candleWindow(sorted);
  return attachBackfillMeta(sorted, {
    symbol,
    timeframe,
    family,
    provider: primaryProvider,
    requested_start_ts: requestedStartTs,
    requested_end_ts: now,
    requested_window: windowText(requestedStartTs, now),
    actual_start_ts: actual.startTs,
    actual_end_ts: actual.endTs,
    actual_window: windowText(actual.startTs, actual.endTs),
    provider_max_bars: PROVIDER_MAX_BARS,
    workers: numWorkers,
    worker_windows: results.map((candles, index) => ({
      worker: index + 1,
      ...(candles.backfillMeta || {}),
    })),
    fetched_bars: sorted.length,
  });
}

module.exports = {
  fetchPaginated,
  fetchParallelBackfill,
  BARS_PER_DAY,
  windowText,
};
