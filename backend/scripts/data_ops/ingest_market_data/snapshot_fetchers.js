const {
  fetchAlpacaBaseCandles,
  fetchBinanceBaseCandles,
  fetchCoinbaseBaseCandles,
  fetchCoinGeckoBaseCandles,
  fetchYahooBaseCandles,
  cachedFetch,
} = require('../../../../shared/lib/providers');

const { fetchPaginated } = require('../../../../shared/lib/data/backfill');

const {
  SUPPORTED_INTERVALS,
  selectYahooBase,
  YAHOO_INDEX_SYMBOLS,
  YAHOO_COMMODITY_SYMBOLS,
  YAHOO_COMMODITY_REVERSE,
  YAHOO_FX_SYMBOLS,
  STOOQ_EQUITY_SUFFIX,
  STOOQ_INDEX_SYMBOLS,
  STOOQ_COMMODITY_SYMBOLS,
  COINBASE_PRODUCTS,
} = require('./constants');

const { aggregateCandles } = require('./candle_utils');

// redactUrl/appendRecords/resolveEquityOrIndexSymbol stay in index.js (used broadly
// beyond these snapshot fetchers — e.g. appendRecords is called from ingestMarketData
// itself, resolveEquityOrIndexSymbol is also called directly from the FAMILIES_MANIFEST
// dispatch loop). index.js requires this module at its own top level, so a top-level
// require here would be circular — lazy-require on every call instead (cheap: Node
// caches the module).
function redactUrl(value) {
  return require('./index.js').redactUrl(value);
}
function appendRecords(target, records) {
  return require('./index.js').appendRecords(target, records);
}
function resolveEquityOrIndexSymbol(...args) {
  return require('./index.js').resolveEquityOrIndexSymbol(...args);
}

// Timeframes at or below this duration are considered "sub-daily" and require
// native intraday bars — aggregation from 1d base produces only 1 synthetic bar/day.
const INTRADAY_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4h in ms

async function fetchText(url, accept = 'application/xml,text/xml') {
  const response = await cachedFetch(url, {
    headers: {
      accept,
      'user-agent': 'sovereign-market-ingestor/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${redactUrl(url)}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseStooqCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('Unable to parse Stooq CSV');
  }
  const header = lines[0].split(',').map((value) => value.trim().toLowerCase());
  const cols = new Map(header.map((name, index) => [name, index]));
  const records = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    if (parts.length < header.length) continue;
    const date = parts[cols.get('date')];
    const open = Number(parts[cols.get('open')]);
    const high = Number(parts[cols.get('high')]);
    const low = Number(parts[cols.get('low')]);
    const close = Number(parts[cols.get('close')]);
    const volume = Number(parts[cols.get('volume')]);
    if (!date || [open, high, low, close].some((value) => !Number.isFinite(value))) continue;
    records.push({
      openTime: Date.parse(`${date}T00:00:00Z`),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  if (records.length === 0) {
    throw new Error('Stooq CSV produced no usable candles');
  }
  return records.sort((a, b) => a.openTime - b.openTime);
}

function resolveStooqSymbol(family, symbol) {
  if (family === 'equities') {
    return `${String(symbol).toLowerCase()}${STOOQ_EQUITY_SUFFIX}`;
  }
  if (family === 'indices') {
    return STOOQ_INDEX_SYMBOLS[symbol] || `${String(symbol).toLowerCase()}_us`;
  }
  if (family === 'commodities') {
    return STOOQ_COMMODITY_SYMBOLS[symbol] || String(symbol).toLowerCase();
  }
  return null;
}

async function fetchStooqDailyHistory(symbol) {
  const url = new URL('https://stooq.com/q/d/l/');
  url.searchParams.set('s', symbol);
  url.searchParams.set('i', 'd');
  const csv = await fetchText(url.toString(), 'text/csv,text/plain');
  return parseStooqCsv(csv);
}

function resolveCommoditySymbol(provider, symbol) {
  if (provider !== 'yahoo') {
    return null;
  }

  return YAHOO_COMMODITY_SYMBOLS[symbol] || null;
}

async function fetchEquityOrIndexSnapshot(family, provider, symbol, timeframes, config, options = {}) {
  timeframes = timeframes || ['1d'];
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;
  const targetStartMs = startTime || (Date.now() - (historyDays * 24 * 60 * 60 * 1000));
  const subDailyTimeframes = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms <= INTRADAY_THRESHOLD_MS;
  });
  const dailyOrAbove = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms > INTRADAY_THRESHOLD_MS;
  });
  const output = [];

  if (provider === 'alpaca' && subDailyTimeframes.length > 0) {
    const providerSymbol = resolveEquityOrIndexSymbol(family, symbol, provider);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }

    const ORDER = ['1m', '5m', '15m', '30m', '1h', '4h'];
    const finestSubDaily = ORDER.find(tf => subDailyTimeframes.includes(tf)) || subDailyTimeframes[0];
    let nativeCandles = null;
    try {
      nativeCandles = await fetchPaginated(providerSymbol, finestSubDaily, historyDays, family, fetchAlpacaBaseCandles, endTime || null, {
        chunkDelayMs: options.chunkDelayMs || 0,
      });
    } catch (err) {
      console.warn(`[INGEST] Native ${finestSubDaily} fetch failed for ${symbol} via ${provider}: ${err.message}`);
    }

    if (nativeCandles && nativeCandles.length > 0) {
      const nativeBarsForAgg = nativeCandles.map(c => ({
        openTime: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      for (const tf of subDailyTimeframes) {
        if (!SUPPORTED_INTERVALS[tf]) continue;
        const aggregated = tf === finestSubDaily
          ? nativeCandles.map(c => ({
              family,
              provider,
              symbol,
              timeframe: tf,
              timestamp: new Date(c.openTime).toISOString(),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            }))
          : aggregateCandles(nativeBarsForAgg, tf, symbol, provider, family, { sourceTimeframe: finestSubDaily });

        if (aggregated.length > 0) {
          for (const r of aggregated) {
            if (new Date(r.timestamp).getTime() >= targetStartMs) output.push(r);
          }
        }
      }
    }
  }

  const unresolvedSubDailyTimeframes = subDailyTimeframes.filter(tf => !output.some(r => r.timeframe === tf));
  if (provider === 'alpaca' && unresolvedSubDailyTimeframes.length > 0) {
    if (dailyOrAbove.length === 0) {
      throw new Error(`No native Alpaca ${unresolvedSubDailyTimeframes.join(',')} candles returned for ${symbol}`);
    }
    console.warn(`[INGEST] Alpaca returned no native ${unresolvedSubDailyTimeframes.join(',')} candles for ${symbol}; not synthesizing sub-daily bars from daily data`);
  }

  const remainingTimeframes = [
    ...dailyOrAbove,
    ...(provider === 'alpaca' ? [] : unresolvedSubDailyTimeframes),
  ];

  if (remainingTimeframes.length === 0) return output;

  let baseCandles = null;
  let baseTimeframe = '1d';
  if (provider === 'stooq') {
    const stooqSymbol = resolveStooqSymbol(family, symbol);
    if (!stooqSymbol) {
      throw new Error(`No stooq symbol mapping for ${symbol}`);
    }
    baseCandles = await fetchStooqDailyHistory(stooqSymbol);
  } else if (provider === 'alpaca') {
    const providerSymbol = resolveEquityOrIndexSymbol(family, symbol, provider);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }
    baseCandles = await fetchAlpacaBaseCandles(providerSymbol, Math.max(100, Math.ceil(historyDays * 1.5)), '1d', startTime, endTime);
  } else {
    const providerSymbol = resolveEquityOrIndexSymbol(family, symbol, provider);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }
    const { base: bestBase, effectiveDays } = selectYahooBase(remainingTimeframes, historyDays);
    baseTimeframe = bestBase;
    baseCandles = await fetchYahooBaseCandles(providerSymbol, bestBase, effectiveDays, startTime, endTime);
  }

  for (const timeframe of remainingTimeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported derived timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family, { sourceTimeframe: baseTimeframe });
    if (aggregated.length > 0) {
      if (historyDays > 5) {

        appendRecords(output, aggregated);
      } else {
        output.push({
          ...aggregated[aggregated.length - 1],
          family,
        });
      }
    }
  }

  return output;
}

async function fetchCommoditySnapshot(family, provider, symbol, timeframes, config, options = {}) {
  // Normalize Yahoo-native symbols (GC=F, BZ=F, etc.) to canonical names
  symbol = YAHOO_COMMODITY_REVERSE[symbol] || symbol;
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;

  let baseCandles = null;
  let baseTimeframe = '1d';
  if (provider === 'stooq') {
    const stooqSymbol = resolveStooqSymbol('commodities', symbol);
    if (!stooqSymbol) {
      throw new Error(`No stooq symbol mapping for ${symbol}`);
    }
    baseCandles = await fetchStooqDailyHistory(stooqSymbol);
  } else {
    const providerSymbol = resolveCommoditySymbol(provider, symbol);
    if (!providerSymbol) {
      throw new Error(`No ${provider} symbol mapping for ${symbol}`);
    }

    const allSubDaily = timeframes.length > 0 && timeframes.every(tf => {
      const ms = SUPPORTED_INTERVALS[tf];
      return ms !== undefined && ms <= INTRADAY_THRESHOLD_MS;
    });
    let bestBase;
    let effectiveDaysForFetch;
    if (allSubDaily) {
      const { base, effectiveDays } = selectYahooBase(timeframes, historyDays);
      bestBase = base;
      effectiveDaysForFetch = effectiveDays;
    } else {
      bestBase = (historyDays > 730 || !timeframes.includes("1h")) ? "1d" : "1h";
      effectiveDaysForFetch = historyDays;
    }
    baseTimeframe = bestBase;
    baseCandles = await fetchYahooBaseCandles(providerSymbol, bestBase, effectiveDaysForFetch, startTime, endTime);
  }
  const output = [];

  for (const timeframe of timeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported derived timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family, { sourceTimeframe: baseTimeframe });
    if (aggregated.length > 0) {
      if (historyDays > 5) {

        appendRecords(output, aggregated);
      } else {
        output.push({
          ...aggregated[aggregated.length - 1],
          family,
        });
      }
    }
  }

  return output;
}

async function fetchFxSnapshot(family, provider, symbol, timeframes, config, options = {}) {
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;

  const providerSymbol = YAHOO_FX_SYMBOLS[String(symbol).toUpperCase()];
  if (!providerSymbol) {
    throw new Error(`No ${provider} symbol mapping for ${symbol}`);
  }

  let baseTimeframe;
  let effectiveDaysForFetch;
  const allSubDaily = timeframes.length > 0 && timeframes.every(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms <= INTRADAY_THRESHOLD_MS;
  });
  if (allSubDaily) {
    const { base, effectiveDays } = selectYahooBase(timeframes, historyDays);
    baseTimeframe = base;
    effectiveDaysForFetch = effectiveDays;
  } else {
    baseTimeframe = (historyDays > 730 || !timeframes.includes('1h')) ? '1d' : '1h';
    effectiveDaysForFetch = historyDays;
  }

  const baseCandles = await fetchYahooBaseCandles(providerSymbol, baseTimeframe, effectiveDaysForFetch, startTime, endTime);
  const output = [];

  for (const timeframe of timeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported derived timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family, { sourceTimeframe: baseTimeframe });
    if (aggregated.length > 0) {
      if (historyDays > 5) {
        appendRecords(output, aggregated);
      } else {
        output.push({
          ...aggregated[aggregated.length - 1],
          family,
        });
      }
    }
  }

  return output;
}

async function fetchCryptoSnapshot(provider, symbol, timeframes, family = 'crypto', options = {}) {
  const historyDays = options.historyDays || options.days || 5;
  const startTime = options.startTime || null;
  const endTime = options.endTime || null;

  // Determine if any requested timeframe is sub-daily (requires native intraday bars)
  const subDailyTimeframes = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms <= INTRADAY_THRESHOLD_MS;
  });
  const dailyOrAbove = timeframes.filter(tf => {
    const ms = SUPPORTED_INTERVALS[tf];
    return ms !== undefined && ms > INTRADAY_THRESHOLD_MS;
  });

  const output = [];
  const targetStartMs = startTime || (Date.now() - (historyDays * 24 * 60 * 60 * 1000));

  // --- Sub-daily branch: route to native Binance fetch via fetchPaginated ---
  // This produces real intraday bars instead of the 1-bar-per-day aggregation from 1d base.
  // Only for binance/coinbase providers (not coingecko/alpaca which lack 5m intraday depth).
  if (subDailyTimeframes.length > 0 && historyDays > 5 && (provider === 'binance' || provider === 'coinbase')) {
    // Fetch at the finest sub-daily timeframe requested; coarser sub-daily TFs aggregate from it.
    // '1m' leads the order so crypto can use a native 1-minute base (Binance serves deep 1m).
    const ORDER = ['1m', '5m', '15m', '30m', '1h', '4h'];
    const finestSubDaily = ORDER.find(tf => subDailyTimeframes.includes(tf)) || subDailyTimeframes[0];

    const fetchBaseFn = provider === 'coinbase' ? fetchCoinbaseBaseCandles : fetchBinanceBaseCandles;
    let nativeCandles = null;
    try {
      // fetchPaginated handles chunked pagination (3-day chunks for 5m), sequential, rate-safe.
      nativeCandles = await fetchPaginated(symbol, finestSubDaily, historyDays, 'crypto', fetchBaseFn, endTime || null);
    } catch (err) {
      console.warn(`[INGEST] Native ${finestSubDaily} fetch failed for ${symbol} via ${provider}: ${err.message}`);
    }

    if (nativeCandles && nativeCandles.length > 0) {
      // Convert fetchPaginated output {openTime, open, high, low, close, volume} to snapshot record shape
      const nativeBarsForAgg = nativeCandles.map(c => ({
        openTime: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      for (const tf of subDailyTimeframes) {
        if (!SUPPORTED_INTERVALS[tf]) continue;
        const aggregated = tf === finestSubDaily
          ? nativeCandles.map(c => ({
              family,
              provider,
              symbol,
              timeframe: tf,
              timestamp: new Date(c.openTime).toISOString(),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            }))
          : aggregateCandles(nativeBarsForAgg, tf, symbol, provider, family, { sourceTimeframe: finestSubDaily });

        if (aggregated.length > 0) {
          // No JSON cap here: the snapshot must carry FULL depth so the binary
          // ts-index receives it. The 90-day JSON cap is applied at write time
          // in the save block (capSubDailyJsonView). Plain loop, not push(...):
          // a 5-year 5m fetch is ~526k records and spread args overflow the stack.
          for (const r of aggregated) {
            if (new Date(r.timestamp).getTime() >= targetStartMs) output.push(r);
          }
        }
      }
    }
    // Fall through to daily aggregation for any dailyOrAbove timeframes still needed
  }

  // --- Daily-and-above branch (or sub-daily fallback when native fetch unavailable) ---
  const remainingTimeframes = [
    ...dailyOrAbove,
    // Include sub-daily TFs that weren't handled (e.g., provider is coingecko/alpaca, or native fetch failed)
    ...subDailyTimeframes.filter(tf => !output.some(r => r.timeframe === tf)),
  ];

  if (remainingTimeframes.length === 0) return output;

  let baseCandles = null;

  // Primary Provider Fetch
  if (provider === 'coingecko') {
    baseCandles = await fetchCoinGeckoBaseCandles(symbol, Math.max(historyDays, 365));
  } else {
    let fetchBase = fetchBinanceBaseCandles;
    if (provider === 'coinbase') fetchBase = fetchCoinbaseBaseCandles;
    else if (provider === 'alpaca') fetchBase = fetchAlpacaBaseCandles;

    try {
      const limit = Math.max(100, Math.ceil(historyDays * 1.5));
      baseCandles = await fetchBase(symbol, limit, '1d', startTime, endTime);
    } catch (err) {
      console.warn(`[INGEST] Primary provider ${provider} failed for ${symbol}: ${err.message}. Attempting Yahoo fallback.`);
    }
  }

  // Yahoo Fallback (only if primary failed and history requested)
  if (!baseCandles && historyDays > 5 && (provider === 'binance' || provider === 'coinbase')) {
    const yahooSymbol = COINBASE_PRODUCTS[symbol] || symbol;
    const { base: bestBase, effectiveDays } = selectYahooBase(remainingTimeframes, historyDays);
    try {
      baseCandles = await fetchYahooBaseCandles(yahooSymbol, bestBase, effectiveDays, startTime, endTime);
      console.log(`[INGEST] Using Yahoo fallback for ${symbol} (${bestBase}, ${effectiveDays}d)`);
    } catch (err) {
      console.warn(`[INGEST] Yahoo fallback failed for ${symbol}: ${err.message}`);
    }
  }

  if (!baseCandles) {
    if (output.length > 0) {
      // Sub-daily succeeded; daily base failed — not fatal if caller only needs sub-daily
      console.warn(`[INGEST] Daily base fetch failed for ${symbol} via ${provider}; returning sub-daily results only`);
      return output;
    }
    throw new Error(`Failed to fetch crypto data for ${symbol} via ${provider} or fallbacks`);
  }

  for (const timeframe of remainingTimeframes) {
    if (!SUPPORTED_INTERVALS[timeframe]) {
      throw new Error(`Unsupported crypto timeframe: ${timeframe}`);
    }
    const aggregated = aggregateCandles(baseCandles, timeframe, symbol, provider, family, { sourceTimeframe: '1d' });
    if (aggregated.length > 0) {
      const filtered = aggregated.filter(r => new Date(r.timestamp).getTime() >= targetStartMs);
      if (historyDays > 5) {
        appendRecords(output, filtered);
      } else if (filtered.length > 0) {
        output.push({
          ...filtered[filtered.length - 1],
          family,
        });
      }
    }
  }

  return output;
}

module.exports = {
  fetchText,
  parseStooqCsv,
  resolveStooqSymbol,
  fetchStooqDailyHistory,
  resolveCommoditySymbol,
  fetchEquityOrIndexSnapshot,
  fetchCommoditySnapshot,
  fetchFxSnapshot,
  fetchCryptoSnapshot,
};
