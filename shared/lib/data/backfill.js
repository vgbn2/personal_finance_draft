const { fetchBinanceBaseCandles } = require('../providers/binance');
const { fetchCoinbaseBaseCandles } = require('../providers/coinbase');
const { fetchYahooBaseCandles } = require('../providers/yahoo');
const { fetchAlpacaBaseCandles } = require('../providers/alpaca');

const BARS_PER_DAY = {
  crypto: { '1m': 1440, '5m': 288, '15m': 96, '30m': 48, '1h': 24, '4h': 6, '1d': 1, '1w': 1 / 7, '1mo': 1 / 30 },
  equities: { '1m': 390, '5m': 78, '15m': 26, '30m': 13, '1h': 7, '4h': 2, '1d': 1, '1w': 1 / 7, '1mo': 1 / 30 },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CRYPTO_PROVIDER_MAX_BARS = 1000;
const EQUITY_PROVIDER_MAX_BARS = 10000;

function providerMaxBarsFor(family) {
  return family === 'crypto' ? CRYPTO_PROVIDER_MAX_BARS : EQUITY_PROVIDER_MAX_BARS;
}

function toIso(ts) {
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function windowText(startTs, endTs) {
  const start = toIso(startTs) || 'unknown';
  const end = toIso(endTs) || 'unknown';
  return `[${start} - ${end}]`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function fetchPaginated(symbol, timeframe, days, family, fetchFn, forcedEndTs = null, options = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error(`No fetch function supplied for ${symbol}:${timeframe}`);
  }

  const marketType = family === 'crypto' ? 'crypto' : 'equities';
  const barsPerDay = BARS_PER_DAY[marketType][timeframe] || 1;
  const providerMaxBars = providerMaxBarsFor(family);
  const maxDaysPerChunk = Math.max(1, Math.floor(providerMaxBars / barsPerDay));
  const requestedEndTs = forcedEndTs || Date.now();
  const targetStartTs = requestedEndTs - (days * DAY_MS);

  // Repeated backfills only need a one-day overlap with existing tail coverage.
  // Internal holes remain a separate repair concern because coverage is boundary-only.
  let effectiveStartTs = targetStartTs;
  let gapAwareMeta = null;
  if (options.tsDir) {
    try {
      const { readCoverage } = require('../market/coverage.js');
      const coverage = readCoverage(options.tsDir, symbol, timeframe);
      if (coverage.exists && coverage.lastBarMs != null && coverage.lastBarMs > targetStartTs) {
        effectiveStartTs = Math.min(requestedEndTs, Math.max(targetStartTs, coverage.lastBarMs - DAY_MS));
        gapAwareMeta = {
          gap_aware: true,
          existing_first_bar_ms: coverage.firstBarMs,
          existing_last_bar_ms: coverage.lastBarMs,
          narrowed_from_start_ts: targetStartTs,
          narrowed_to_start_ts: effectiveStartTs,
        };
      }
    } catch (_) { /* Fall back to the full requested window. */ }
  }

  let currentEndTs = requestedEndTs;
  const allCandles = [];
  const chunks = [];
  const chunkDelayMs = Math.max(0, Number(options.chunkDelayMs || 0));

  while (currentEndTs > effectiveStartTs) {
    let currentStartTs = currentEndTs - (maxDaysPerChunk * DAY_MS);
    if (currentStartTs < effectiveStartTs) currentStartTs = effectiveStartTs;

    try {
      let chunk;
      if (family === 'crypto') {
        chunk = await fetchFn(symbol, providerMaxBars, timeframe, currentStartTs, currentEndTs);
      } else {
        chunk = await fetchFn(symbol, timeframe, providerMaxBars, currentStartTs, currentEndTs);
      }

      if (!chunk || chunk.length === 0) break;
      chunks.push({
        start_ts: currentStartTs,
        end_ts: currentEndTs,
        window: windowText(currentStartTs, currentEndTs),
        fetched_bars: chunk.length,
        max_bars: providerMaxBars,
      });
      for (let i = 0; i < chunk.length; i++) {
        allCandles.push(chunk[i]);
      }
      if (currentStartTs <= effectiveStartTs) {
        break;
      }
      const nextEndTs = chunk[0].openTime - 1;
      if (nextEndTs >= currentEndTs) {
        break;
      }
      currentEndTs = nextEndTs;
      if (chunkDelayMs > 0 && currentEndTs > effectiveStartTs) {
        await sleep(chunkDelayMs);
      }
    } catch (error) {
      if (!global.suppressLogs) console.error(`  [BACKFILL] Chunk failed for ${symbol}:${timeframe} ${windowText(currentStartTs, currentEndTs)} max_bars=${providerMaxBars}: ${error.message}`);
      break;
    }
  }

  // The chunks are fetched backwards in time, so the array is completely reverse-sorted.
  // Reversing it first prevents V8's Timsort from blowing the call stack due to max recursion depth!
  allCandles.reverse();
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
    gap_aware: gapAwareMeta,
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
  const providerMaxBars = providerMaxBarsFor(family);

  console.log(`[PARALLEL] Orchestrating ${numWorkers} workers for ${totalDays} days of ${symbol}:${timeframe} using ${primaryProvider} ${windowText(requestedStartTs, now)} max_bars=${providerMaxBars}`);

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
    provider_max_bars: providerMaxBars,
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
  providerMaxBarsFor,
  windowText,
};
