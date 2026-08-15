'use strict';

// ingest_market_data imports are lazy (inside each function) so that test stubs
// applied via Module._load intercept are always picked up fresh per call.

const path = require('node:path');
const fs = require('node:fs');
const { guardEquitySessionBars } = require('../../../../shared/lib/market/equity_session.js');

const { readSnapshot, validateSnapshot, readTsIndexSince } = require('../../../../shared/lib/market/validation.js');

const { loadResearchConfig } = require('../../lib/research_config.js');

const utils = require('../../lib/utils.js');

const { optionValue, hasFlag, numericOption } = utils;

const { DEFAULT_SNAPSHOT } = utils;
const { STORAGE_TS_DIR } = require('../../../../shared/lib/runtime/paths.js');

const MIN_BACKTEST_BARS = 50;

function loadSourcesFromTsIndex(family, days = 400, timeframe = '1d') {
  if (!STORAGE_TS_DIR || !fs.existsSync(STORAGE_TS_DIR)) return [];
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sources = [];
  let files;
  try { files = fs.readdirSync(STORAGE_TS_DIR); } catch (_) { return []; }
  const suffix = `_${timeframe}.meta.json`;
  const fallbackSuffix = '_1d.meta.json';

  let targetSuffix = suffix;
  let hasTargetFiles = files.some((f) => f.endsWith(suffix));
  if (!hasTargetFiles && timeframe !== '1d') {
    targetSuffix = fallbackSuffix;
  }

  const activeTf = targetSuffix === suffix ? timeframe : '1d';

  for (const file of files) {
    if (!file.endsWith(targetSuffix)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(STORAGE_TS_DIR, file), 'utf8'));
      if (meta.family !== family) continue;
      sources.push(...readTsIndexSince(STORAGE_TS_DIR, meta.symbol, activeTf, sinceMs));
    } catch (_) { /* Skip unreadable bins. */ }
  }
  return sources;
}

const researchConfig = loadResearchConfig();

// ---------------------------------------------------------------------------
// Internal helper — mirrors historicalWindowFromArgs in research.js so that
// sources child has no circular dependency on the parent.
// ---------------------------------------------------------------------------
function _historicalWindowFromArgs(args, fallbackDays) {
  const defaults = researchConfig.historical_defaults || {};
  const actualFallback = fallbackDays || defaults.fallback_days || 365;
  const days = Math.max(1, Math.floor(numericOption(args, '--days', actualFallback)));
  const endTs = Math.floor(Date.now() / 1000);
  return {
    days,
    endTs,
    startTs: endTs - days * 24 * 60 * 60,
  };
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

function loadUsableSources(args, options = {}) {
  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const family = options.family || null;
  const timeframe = options.timeframe || optionValue(args, '--timeframe', '1d');

  if (input === DEFAULT_SNAPSHOT && family) {
    const tsBars = loadSourcesFromTsIndex(family, 400, timeframe);
    if (tsBars.length >= MIN_BACKTEST_BARS) {
      const tsSnapshot = { mode: 'ts_index', sources: tsBars, errors: [] };
      const { report, usableSources } = validateSnapshot(tsSnapshot);
      if (usableSources.length >= MIN_BACKTEST_BARS) {
        return {
          snapshot: { ...tsSnapshot, sources: usableSources },
          quality: report,
          loaded_family: family,
        };
      }
    }
  }

  const snapshot = readSnapshot(input, { family }) || readSnapshot(input);
  const { report, usableSources } = validateSnapshot(snapshot);
  return { snapshot: { ...snapshot, sources: usableSources }, quality: report, loaded_family: snapshot?.loaded_family || null };
}

function validatedSnapshot(snapshot) {
  const { report, usableSources } = validateSnapshot(snapshot);
  return { snapshot: { ...snapshot, sources: usableSources }, quality: report };
}

function loadSampleSources(args, symbols = []) {
  const { generateSampleBars } = require('../../../../shared/lib/market/indicators.js');
  const timeframe = optionValue(args, '--timeframe', '1d');
  const sampleSize = Math.max(96, Math.floor(numericOption(args, '--sample-size', 120)));
  const targetSymbols = [...new Set(symbols.length > 0 ? symbols : ['SPY', 'BTCUSDT'])];
  return {
    snapshot: {
      mode: 'sample',
      sources: targetSymbols.flatMap((symbol) => generateSampleBars(symbol, sampleSize, timeframe)),
      errors: [],
    },
    quality: null,
  };
}

async function withProviderLogFilter(args, fn) {
  if (hasFlag(args, '--debug')) return fn();
  const originalLog = console.log;
  const originalWarn = console.warn;
  const shouldHide = (value) => /^\[(DEBUG|INGEST)\]/.test(String(value || ''));
  console.log = (...items) => {
    if (shouldHide(items[0])) return;
    originalLog(...items);
  };
  console.warn = (...items) => {
    if (shouldHide(items[0])) return;
    originalWarn(...items);
  };
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function candlesToSources(candles, family, provider, symbol, timeframe) {
  return candles.map((candle) => ({
    family,
    provider,
    symbol,
    timeframe,
    timestamp: new Date(candle.openTime).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    source: `${provider}-${timeframe}-history`,
  }));
}

function recordBackfillSummary(summaries, candles, family, provider, symbol, timeframe) {
  const meta = candles && candles.backfillMeta;
  if (!meta) return;
  summaries.push({
    family,
    symbol,
    provider: meta.provider || provider,
    timeframe,
    requested_window: meta.requested_window,
    actual_window: meta.actual_window,
    max_bars: meta.provider_max_bars,
    fetched_bars: meta.fetched_bars ?? candles.length,
    workers: meta.workers || null,
    chunks: Array.isArray(meta.chunks) ? meta.chunks.length : null,
    worker_windows: Array.isArray(meta.worker_windows)
      ? meta.worker_windows.map((worker) => ({
        worker: worker.worker,
        requested_window: worker.requested_window,
        actual_window: worker.actual_window,
        max_bars: worker.provider_max_bars,
        fetched_bars: worker.fetched_bars,
        chunks: Array.isArray(worker.chunks) ? worker.chunks.length : null,
      }))
      : null,
  });
}

async function loadHistoricalSources(args) {
  const { ingestMarketData, loadConfig } = require('../../../scripts/data_ops/ingest_market_data.js');
  const timeframe = optionValue(args, '--timeframe', null);
  const targetSymbol = optionValue(args, '--symbol', null);
  const targetFamily = optionValue(args, '--family', null);
  const force = args.historyForce || hasFlag(args, '--force');
  const window = _historicalWindowFromArgs(args);
  const config = await loadConfig();
  const sources = [];
  const backfillWindows = [];
  const chosenTimeframe = timeframe;

  const targetSymbols = targetSymbol ? new Set(targetSymbol.split(',').map(s => s.trim())) : null;


  const filterSymbolsForFamily = (symbols, family) => {
    if (targetSymbols) {
        return (symbols || []).filter(s => targetSymbols.has(s));
    }
    if (targetFamily === family) {
        return (symbols || []); // Return all symbols for the target family
    }
    if (targetFamily && targetFamily !== family) {
        return []; // Skip other families if one is targeted
    }
    // Default: slice to 2 for safety when no target is provided
        return (symbols || []).slice(0, 2);
  };

  const symbolsByFamily = {
    equities: filterSymbolsForFamily(config.equities.symbols, 'equities'),
    indices: filterSymbolsForFamily(config.indices.symbols, 'indices'),
    commodities: filterSymbolsForFamily(config.commodities.symbols, 'commodities'),
    fx: filterSymbolsForFamily(config.fx.symbols, 'fx'),
    crypto: filterSymbolsForFamily(config.crypto.symbols, 'crypto'),
    macro: filterSymbolsForFamily(config.macro.series, 'macro'),
    pmi: filterSymbolsForFamily(config.pmi.series, 'pmi'),
  };

  if (hasFlag(args, '--debug')) {
    console.log('[DEBUG] symbolsByFamily:', JSON.stringify(Object.fromEntries(Object.entries(symbolsByFamily).map(([k,v]) => [k, v.length]))));
  }

  const families = ['equities', 'indices', 'commodities', 'fx', 'crypto', 'macro', 'pmi'];
  for (const family of families) {
      const symbols = symbolsByFamily[family];
      if (!symbols || symbols.length === 0) {
          if (hasFlag(args, '--debug') && (targetFamily === family || !targetFamily)) {
              console.log(`[DEBUG] No symbols found for family: ${family}`);
          }
          continue;
      }

      if (hasFlag(args, '--debug')) console.log(`[DEBUG] Backfilling family ${family} with ${symbols.length} symbols`);
      for (const symbol of symbols) {
          if (targetSymbols && !targetSymbols.has(symbol)) continue;
          try {
              const syncTimeframes = chosenTimeframe ? [chosenTimeframe] : ((config[family]?.timeframes && Array.isArray(config[family].timeframes) && config[family].timeframes.length > 0) ? config[family].timeframes : ['1d']);
              for (const tf of syncTimeframes) {
                if (hasFlag(args, '--debug')) console.log(`[DEBUG] Calling ingestMarketData for ${family}:${symbol}:${tf}`);
                const snapshot = await withProviderLogFilter(args, () => ingestMarketData({
                    family,
                    symbol,
                    timeframe: tf,
                    historyDays: window.days,
                    force
                }));

                const candles = snapshot.sources.filter(s =>
                    (s.symbol === symbol || s.series === symbol || s.series_id === symbol || s.underlying === symbol) &&
                    (s.timeframe === tf || s.timeframe === 'point' || !s.timeframe)
                );

                if (candles.length > 0) {
                    sources.push(...candles);
                    backfillWindows.push({
                      family,
                      symbol,
                      timeframe: tf,
                      days: window.days,
                      fetched_at: snapshot.fetched_at || new Date().toISOString(),
                      records: candles.length,
                    });
                }
              }
          } catch (err) {
              console.warn(`[BACKFILL] Failed to load ${family}:${symbol}: ${err.message}`);
          }
      }
  }

  // Drop pre/post-market equity & index intraday bars before features/backtests
  // consume them (other families and daily bars pass through untouched).
  const sessionGuard = guardEquitySessionBars(sources);
  if (sessionGuard.dropped > 0 && hasFlag(args, '--debug')) {
    console.log(`[BACKFILL] equity session guard dropped ${sessionGuard.dropped} out-of-session intraday bars`);
  }

  const snapshot = {
    mode: 'provider_history',
    fetched_at: new Date().toISOString(),
    sources: sessionGuard.records,
    backfill_windows: backfillWindows,
  };
  return validatedSnapshot(snapshot);
}

async function loadPredictionMarketHistory(args) {
  const {
    fetchKalshiHistoricalCandlesticks,
    fetchKalshiHistoricalMarkets,
    fetchPolymarketHistoricalPrices,
    fetchPredictionInterestSignal,
    loadConfig,
  } = require('../../../scripts/data_ops/ingest_market_data.js');
  const config = await loadConfig();
  const defaults = researchConfig.prediction_market || {};
  const provider = optionValue(args, '--prediction-provider', 'all');
  const marketLimit = Math.max(1, Math.floor(numericOption(args, '--prediction-market-limit', defaults.market_limit || 3)));
  const periodInterval = Math.floor(numericOption(args, '--prediction-period-minutes', defaults.period_minutes || 1440));
  const { startTs, endTs } = _historicalWindowFromArgs(args);
  const sources = [];
  const errors = [];

  for (const eventName of config.prediction_market.events || []) {
    if (provider === 'all' || provider === 'kalshi') {
      try {
        const { records } = await fetchKalshiHistoricalMarkets(eventName, { limit: 1000 });
        sources.push(...records);
        for (const market of records.slice(0, marketLimit)) {
          if (!market.market_ticker) continue;
          sources.push(...await fetchKalshiHistoricalCandlesticks(market.market_ticker, { startTs, endTs, periodInterval }));
        }
      } catch (error) {
        errors.push({ family: 'prediction_market', provider: 'kalshi', symbol: eventName, message: error.message });
      }
    }

    if (provider === 'all' || provider === 'polymarket') {
      try {
        sources.push(...await fetchPolymarketHistoricalPrices(eventName, {
          marketLimit,
          startTs,
          endTs,
          interval: periodInterval >= 1440 ? '1d' : 'max',
          fidelity: periodInterval >= 1440 ? 1440 : Math.max(1, periodInterval),
        }));
      } catch (error) {
        errors.push({ family: 'prediction_market', provider: 'polymarket', symbol: eventName, message: error.message });
      }
    }

    try {
      sources.push(await fetchPredictionInterestSignal(eventName));
    } catch (error) {
      errors.push({ family: 'sentiment', provider: 'google_custom_search', symbol: eventName, message: error.message });
    }
  }

  return { sources, errors };
}

module.exports = {
  withProviderLogFilter,
  candlesToSources,
  recordBackfillSummary,
  loadUsableSources,
  validatedSnapshot,
  loadSampleSources,
  loadHistoricalSources,
  loadPredictionMarketHistory,
};
