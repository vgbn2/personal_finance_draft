const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../../scripts/data_ops/ingest_market_data.js');

const { DEFAULT_PROVIDER_PRIORITY } = require('../../../../shared/lib/market/quote_router.js');
const { upsertStrategyGradeRecord, inferStrategyTaxonomy, normalizeStrategyPath } = require('../../../../shared/lib/strategy/registry.js');

const { filterFeatureFrame, runBacktest, splitFeatureFrame, rollingWalkForward } = require('../../../../shared/lib/strategy/backtest.js');

const { calculateFeatureFrame, calculateRollingFeatureFrame,
        DEFAULT_PERIODS } = require('../../../../shared/lib/market/indicators.js');

const { compareModels } = require('../../../../shared/lib/ml/models.js');

const { mergeSnapshots, readSnapshot, 
        validateSnapshot, writeJson } = require('../../../../shared/lib/market/validation.js');

const { runInteractiveMenu, handleIntersection, promptSelect, 
        promptText, promptConfirm, isRichTerminal } = require('../../tui/index.js');
const { resolvePropFirmProfile } = require('../../../../shared/lib/profiles/prop_firms.js');
const { classifyStrategyAssetMode, formatStrategyAssetModeLabel } = require('../../../../shared/lib/strategy/registry.js');

const { loadResearchConfig } = require('../../lib/research_config.js');

const utils = require('../../lib/utils.js');

const { usage,helpText, pageText, optionValue,
        hasFlag, printPayload, currentPhaseLabel,
        formatHumanNumber, formatHumanPayload, renderHumanValue,
        safeReadJson, labelState, numericOption,
        get_Full_Universe_Symbols, withLoadingAnimation } = utils;

const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT,
        DEFAULT_HISTORY, DEFAULT_FEATURES, 
        DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH,
        BACKEND_CANDIDATES, HELP_TOPICS } = utils;

const researchConfig = loadResearchConfig();
//dev suggest, what if i want to add more indicators?, then we have to manually add this to here
function periodOptionsFromArgs(args) {
  const periods = researchConfig.indicator_periods || {};
  return {
    returnFast: numericOption(args, '--return-fast', periods.return_fast || DEFAULT_PERIODS.returnFast),
    returnSlow: numericOption(args, '--return-slow', periods.return_slow || DEFAULT_PERIODS.returnSlow),
    volatility: numericOption(args, '--volatility', periods.volatility || DEFAULT_PERIODS.volatility),
    rsi: numericOption(args, '--rsi', periods.rsi || DEFAULT_PERIODS.rsi),
    atr: numericOption(args, '--atr', periods.atr || DEFAULT_PERIODS.atr),
    bollinger: numericOption(args, '--bollinger', periods.bollinger || DEFAULT_PERIODS.bollinger),
  };
}

function periodOptionsFromStrategy(strategyMeta, args) {
  const cliPeriods = periodOptionsFromArgs(args);
  const strategyPeriods = strategyMeta?.indicator_periods || {};
  return {
    returnFast: Number.isFinite(Number(strategyPeriods.return_fast)) ? Number(strategyPeriods.return_fast) : cliPeriods.returnFast,
    returnSlow: Number.isFinite(Number(strategyPeriods.return_slow)) ? Number(strategyPeriods.return_slow) : cliPeriods.returnSlow,
    volatility: Number.isFinite(Number(strategyPeriods.volatility)) ? Number(strategyPeriods.volatility) : cliPeriods.volatility,
    rsi: Number.isFinite(Number(strategyPeriods.rsi)) ? Number(strategyPeriods.rsi) : cliPeriods.rsi,
    atr: Number.isFinite(Number(strategyPeriods.atr)) ? Number(strategyPeriods.atr) : cliPeriods.atr,
    bollinger: Number.isFinite(Number(strategyPeriods.bollinger)) ? Number(strategyPeriods.bollinger) : cliPeriods.bollinger,
  };
}

function normalizeIndicatorFlags(strategyMeta) {
  const indicators = strategyMeta?.indicators || {};
  return {
    return_fast: indicators.return_fast !== false,
    return_slow: indicators.return_slow !== false,
    volatility: indicators.volatility !== false,
    rsi: indicators.rsi !== false,
    atr: indicators.atr !== false,
    bollinger: indicators.bollinger !== false,
  };
}

function buildOptimizationGrid(strategyMeta, args) {
  const gridConfig = researchConfig.optimization_grid || {};
  const basePeriods = periodOptionsFromStrategy(strategyMeta, args);
  const indicatorFlags = normalizeIndicatorFlags(strategyMeta);
  const dimensions = {
    rsi: indicatorFlags.rsi ? (gridConfig.rsi || [7, 14, 21]) : [basePeriods.rsi],
    atr: indicatorFlags.atr ? (gridConfig.atr || [7, 14, 21]) : [basePeriods.atr],
    bollinger: indicatorFlags.bollinger ? (gridConfig.bollinger || [10, 20, 30]) : [basePeriods.bollinger],
    volatility: indicatorFlags.volatility ? (gridConfig.volatility || [10, 20, 60]) : [basePeriods.volatility],
  };
  const grid = [];
  for (const rsi of dimensions.rsi) {
    for (const atr of dimensions.atr) {
      for (const bollinger of dimensions.bollinger) {
        for (const volatility of dimensions.volatility) {
          grid.push({
            ...basePeriods,
            rsi,
            atr,
            bollinger,
            volatility,
            enabled_indicators: indicatorFlags,
          });
        }
      }
    }
  }
  return { grid, basePeriods, indicatorFlags };
}

function historicalWindowFromArgs(args, fallbackDays) {
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

function filterCandlesByWindow(candles, window) {
  const startMs = window.startTs * 1000;
  const endMs = window.endTs * 1000;
  return candles.filter((candle) => {
    const timestamp = Number(candle.openTime);
    return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs;
  });
}

function cryptoLimitForWindow(timeframe, days, provider) {
  const barsPerDay = {
    '5m': 288,
    '15m': 96,
    '30m': 48,
    '1h': 24,
    '4h': 6,
    '1d': 1,
  }[timeframe] || 1;
  const requested = Math.max(1, Math.ceil(days * barsPerDay));
  const maxLimit = provider === 'coinbase' ? 300 : 1000;
  return Math.min(requested, maxLimit);
}

function inferSnapshotFamily(args, strategyMeta = null) {
  const explicitFamily = optionValue(args, '--snapshot-family', null) || optionValue(args, '--family', null);
  if (explicitFamily) return explicitFamily;

  const symbols = symbolsFromArgs(args);
  const universe = symbols.length > 0 ? symbols : (Array.isArray(strategyMeta?.universe) ? strategyMeta.universe : []);
  if (!universe.length) return null;

  const cryptoLike = universe.every((symbol) => /(?:USDT|USD|BTC|ETH)$/i.test(String(symbol || '')));
  return cryptoLike ? 'crypto' : null;
}

function loadUsableSources(args, options = {}) {
  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const family = options.family || null;
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
  const timeframe = optionValue(args, '--timeframe', null);
  const targetSymbol = optionValue(args, '--symbol', null);
  const targetFamily = optionValue(args, '--family', null);
  const force = args.historyForce || hasFlag(args, '--force');
  const window = historicalWindowFromArgs(args);
  const config = await loadConfig();
  const sources = [];
  const backfillWindows = [];
  const chosenTimeframe = ['5m', '15m', '30m', '1h', '4h', '1d'].includes(timeframe) ? timeframe : null;
  
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
                    (s.timeframe === tf || s.timeframe === '1d' || s.timeframe === 'point' || !s.timeframe)
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

  const snapshot = {
    mode: 'provider_history',
    fetched_at: new Date().toISOString(),
    sources,
    backfill_windows: backfillWindows,
  };
  return validatedSnapshot(snapshot);
}

async function loadPredictionMarketHistory(args) {
  const config = await loadConfig();
  const defaults = researchConfig.prediction_market || {};
  const provider = optionValue(args, '--prediction-provider', 'all');
  const marketLimit = Math.max(1, Math.floor(numericOption(args, '--prediction-market-limit', defaults.market_limit || 3)));
  const periodInterval = Math.floor(numericOption(args, '--prediction-period-minutes', defaults.period_minutes || 1440));
  const { startTs, endTs } = historicalWindowFromArgs(args);
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

function dateFilterOptionsFromArgs(args) {
  return {
    timeframe: optionValue(args, '--timeframe', null),
    from: optionValue(args, '--from', null),
    to: optionValue(args, '--to', null),
  };
}

function rejectDegradedResearchInput(quality, args, label) {
  const message = backtestDataQualityError(quality, args);
  if (!message) return false;
  const error = `${label} input failed data-quality validation. ${message.replace(/^Data-quality validation failed[:.]?\s*/, '')}`;
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ error }, null, 2));
  } else {
    console.error(error);
  }
  return true;
}

function dataQualityIssueSummary(quality) {
  if (!quality) return 'no blocking issues';
  const details = [];
  const errors = quality.counts?.error || 0;
  const providerErrors = Array.isArray(quality.provider_errors) ? quality.provider_errors.length : 0;
  const staleRecords = quality.freshness?.stale_records || 0;

  if (errors > 0) details.push(`${errors} errors`);
  if (providerErrors > 0) details.push(`${providerErrors} provider errors`);
  if (staleRecords > 0) details.push(`${staleRecords} stale records`);

  return details.length > 0 ? details.join(', ') : 'no blocking issues';
}

function backtestDataQualityError(quality, args) {
  if (!quality || quality.ok || hasFlag(args, '--allow-degraded')) return null;
  return [
    `Data-quality validation failed: ${dataQualityIssueSummary(quality)}.`,
    'Fix with `check --strict` or `ingest`/`backfill`.',
  ].join(' ');
}

function dataQualitySummary(quality) {
  if (!quality) return null;
  const issues = quality.issues || [];
  const nonFreshnessIssues = issues.filter((issue) => issue.code !== 'stale_record');
  const displayIssues = nonFreshnessIssues.length ? nonFreshnessIssues : issues;
  const issueCodes = displayIssues
    .map((issue) => issue.code)
    .filter(Boolean);
  const displayWarnings = nonFreshnessIssues.filter((issue) => issue.severity === 'warning').length;
  const topCodes = [...new Set(issueCodes)].slice(0, 4);
  const errors = quality.counts?.error || 0;
  const warnings = displayWarnings;
  const freshnessWarnings = Math.max(0, (quality.counts?.warning || 0) - displayWarnings);
  return {
    ok: Boolean(quality.ok),
    risk: (quality.rejected_records || errors) > 0 ? 'elevated' : (warnings > 0 || freshnessWarnings > 0) ? 'watch' : 'clean',
    total_records: quality.total_records || 0,
    usable_records: quality.usable_records || 0,
    rejected_records: quality.rejected_records || 0,
    errors,
    warnings,
    freshness_warnings: freshnessWarnings,
    top_issue_codes: topCodes,
  };
}

function backtestModeNote(sampleMode, quality) {
  const base = sampleMode
    ? 'Sample mode - deterministic generated bars used; --days is ignored. Drop --sample to run on real historical bars.'
    : 'Live data mode - real historical bars used. Sharpe/Sortino on real data is typically 0.1-1.5; above 2.0 warrants skepticism.';
  const summary = dataQualitySummary(quality);
  if (!summary || (summary.rejected_records === 0 && summary.warnings === 0 && summary.freshness_warnings === 0)) return base;
  const codes = summary.top_issue_codes.length ? ` (${summary.top_issue_codes.join(', ')})` : '';
  const freshness = summary.freshness_warnings ? `, ${summary.freshness_warnings} freshness warnings` : '';
  return `${base} Data quality: ${summary.rejected_records} rejected, ${summary.warnings} warnings${freshness}${codes}; see data_quality_report.`;
}

function formatPercent(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const percent = value * 100;
  if (Math.abs(percent) > 9999) return percent > 0 ? '>9999%' : '<-9999%';
  return `${percent.toFixed(digits)}%`;
}

function formatDecimal(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

function formatBacktestLine(label, value, width = 22) {
  return `  ${label.padEnd(width)} ${value}`;
}

function formatPanelLine(label, value) {
  return formatBacktestLine(label, value, 17);
}

function formatCompactPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const percent = value * 100;
  if (Math.abs(percent) >= 1000) return `${Math.round(percent)}%`;
  if (Math.abs(percent) >= 100) return `${percent.toFixed(0)}%`;
  return `${percent.toFixed(1)}%`;
}

const ANSI_STRIP_RE = /\u001b\[[0-9;]*m/g;

function visibleLength(text) {
  return String(text || '').replace(ANSI_STRIP_RE, '').length;
}

function padVisibleRight(text, width) {
  const value = String(text || '');
  const pad = Math.max(0, width - visibleLength(value));
  return value + ' '.repeat(pad);
}

function clipVisible(text, width) {
  const value = String(text || '');
  if (visibleLength(value) <= width) return value;
  const plain = value.replace(ANSI_STRIP_RE, '');
  if (width <= 3) return plain.slice(0, width);
  return `${plain.slice(0, width - 3)}...`;
}

function splitLines(text) {
  return String(text || '').split(/\r?\n/);
}

function shortTimestamp(value) {
  if (!value) return 'n/a';
  return String(value).replace('T', ' ').replace('.000Z', '').replace('Z', '').slice(0, 16);
}

function shortDate(value) {
  if (!value) return 'n/a';
  return String(value).slice(0, 10);
}

function sampleSeries(values, width) {
  if (!Array.isArray(values) || values.length === 0 || width <= 0) return [];
  if (values.length <= width) return values.slice();
  const samples = [];
  for (let index = 0; index < width; index += 1) {
    const ratio = width === 1 ? 0 : index / (width - 1);
    const position = ratio * (values.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    samples.push(lower === upper ? values[lower] : values[lower] * (1 - weight) + values[upper] * weight);
  }
  return samples;
}

function drawBar(value, min, max, width, fill = '#') {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return `[${'.'.repeat(width)}]`;
  }
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const filled = Math.round(pct * width);
  return `[${fill.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}]`;
}

function renderReturnTape(points, options = {}) {
  const width = Math.max(18, Math.floor(options.width || 28));
  const validPoints = (Array.isArray(points) ? points : []).filter((point) => Number.isFinite(point?.equity));
  if (validPoints.length === 0) return '  (no return path available)';

  const startEquity = validPoints[0].equity || 1;
  const returns = validPoints.map((point) => Math.max(-1, (point.equity / startEquity) - 1));
  const endReturn = returns[returns.length - 1];
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  const finalEquity = validPoints[validPoints.length - 1].equity;
  let peakEquity = startEquity;
  let maxDrawdown = 0;
  for (const point of validPoints) {
    peakEquity = Math.max(peakEquity, point.equity);
    if (peakEquity > 0) maxDrawdown = Math.max(maxDrawdown, (peakEquity - point.equity) / peakEquity);
  }

  const sampled = sampleSeries(returns, width);
  const floor = -1;
  const ceiling = Math.max(0.05, maxReturn);
  const baseline = 0;
  const path = sampled.map((value, index) => {
    const previous = index > 0 ? sampled[index - 1] : value;
    if (value < floor + 0.02) return '_';
    if (value < baseline) return '\\';
    if (value > previous + 0.02) return '/';
    if (value < previous - 0.02) return '\\';
    return '|';
  }).join('');
  const scale = `-${formatCompactPercent(1)} ${formatCompactPercent(baseline)} ${formatCompactPercent(ceiling)}`;

  const lines = [];
  lines.push(formatPanelLine('End', formatCompactPercent(endReturn)));
  lines.push(formatPanelLine('Range', `${formatCompactPercent(minReturn)}..${formatCompactPercent(maxReturn)}`));
  lines.push(formatPanelLine('Peak equity', formatCompactPercent((peakEquity / startEquity) - 1)));
  lines.push(formatPanelLine('Max DD', formatCompactPercent(maxDrawdown)));
  lines.push(`  Trace             ${path}`);
  lines.push(`  Scale             ${scale}`);
  lines.push(`  Drawdown         ${drawBar(maxDrawdown, 0, 1, 28, '#')} ${formatCompactPercent(maxDrawdown)}`);
  lines.push(formatPanelLine('Floor', '-100%'));
  lines.push(formatPanelLine('Last equity', formatDecimal(finalEquity)));
  return lines.join('\n');
}

function renderStressShape(stress) {
  const medianFinal = Number.isFinite(stress.median_final_return) ? stress.median_final_return : 0;
  const worstFinal = Number.isFinite(stress.worst_path?.final_return)
    ? stress.worst_path.final_return
    : stress.p05_final_return;
  const p05 = Number.isFinite(stress.p05_final_return) ? stress.p05_final_return : worstFinal;
  const p95 = Number.isFinite(stress.p95_final_return) ? stress.p95_final_return : medianFinal;
  const ddMean = Number.isFinite(stress.mean_max_drawdown) ? stress.mean_max_drawdown : 0;
  const ddP95 = Number.isFinite(stress.p95_max_drawdown) ? stress.p95_max_drawdown : ddMean;
  const lossProb = Number.isFinite(stress.probability_of_loss) ? stress.probability_of_loss : 0;
  const upsideScale = Math.max(0.01, Math.min(10, Math.max(medianFinal, p95)));

  return [
    formatPanelLine('Median final', formatCompactPercent(medianFinal)),
    `  Median lift      ${drawBar(Math.max(0, medianFinal), 0, upsideScale, 30, '+')}`,
    formatPanelLine('Worst sample', formatCompactPercent(worstFinal)),
    `  Loss risk        ${drawBar(lossProb, 0, 1, 30, '!')} ${formatCompactPercent(lossProb)}`,
    formatPanelLine('P05 / P95', `${formatCompactPercent(p05)} / ${formatCompactPercent(p95)}`),
    `  Tail width       ${drawBar(Math.min(10, Math.max(0, p95 - p05)), 0, 10, 30, '=')}`,
    formatPanelLine('Mean DD', formatCompactPercent(ddMean)),
    `  DD pressure      ${drawBar(ddMean, 0, 1, 30, '#')}`,
    formatPanelLine('P95 DD', formatCompactPercent(ddP95)),
    `  DD shock         ${drawBar(ddP95, 0, 1, 30, '#')}`,
  ].join('\n');
}

function renderSideBySide(leftText, rightText, leftWidth = 48, gap = '  ') {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const rows = Math.max(leftLines.length, rightLines.length);
  const lines = [];
  for (let index = 0; index < rows; index += 1) {
    const left = padVisibleRight(leftLines[index] || '', leftWidth);
    const right = rightLines[index] || '';
    lines.push(`${left}${gap}${right}`);
  }
  return lines.join('\n');
}

function renderVerdictBlock(report) {
  const trust = report.trust_gate || {};
  const propFirm = report.metrics && report.metrics.prop_firm ? report.metrics.prop_firm : null;
  const oos = report.out_of_sample && report.out_of_sample.metrics ? report.out_of_sample.metrics : {};

  // Determine overall action
  const trustFail = trust.grade === 'F' || trust.verdict === 'do-not-trust-yet';
  const propFail = propFirm && propFirm.passable === false;
  const oosNegative = typeof oos.net_return === 'number' && oos.net_return < 0;

  let action, actionColor, fixes;

  if (trustFail && propFail) {
    action = 'DO NOT TRADE';
    actionColor = '\x1b[1;31m';
    fixes = [];
    if (trust.warnings && trust.warnings.length) fixes.push(`Resolve trust warnings: ${trust.warnings.slice(0, 2).join(', ')}`);
    if (propFirm && propFirm.max_daily_loss_usage > 100) fixes.push(`Daily loss ${(propFirm.max_daily_loss_usage).toFixed(0)}% of limit — reduce position size`);
    if (propFirm && propFirm.max_total_loss_usage > 100) fixes.push(`Total loss ${(propFirm.max_total_loss_usage).toFixed(0)}% of limit — tighten stop-loss`);
    if (oosNegative) fixes.push(`OOS return negative (${(oos.net_return * 100).toFixed(1)}%) — strategy needs re-optimisation`);
  } else if (trustFail) {
    action = 'HOLD — trust gate not met';
    actionColor = '\x1b[1;33m';
    fixes = trust.warnings && trust.warnings.length ? [`Fix: ${trust.warnings.slice(0, 2).join('; ')}`] : ['Refresh data cache and re-run'];
  } else if (propFail) {
    action = 'HOLD — prop firm breach risk';
    actionColor = '\x1b[1;33m';
    fixes = [];
    if (propFirm.max_daily_loss_usage > 100) fixes.push(`Cut daily risk: loss usage ${(propFirm.max_daily_loss_usage).toFixed(0)}% > 100%`);
    if (propFirm.max_total_loss_usage > 100) fixes.push(`Cut total risk: loss usage ${(propFirm.max_total_loss_usage).toFixed(0)}% > 100%`);
    if (!fixes.length && propFirm.warnings && propFirm.warnings.length) fixes.push(propFirm.warnings[0]);
  } else if (oosNegative) {
    action = 'CAUTION — OOS underperforms';
    actionColor = '\x1b[1;33m';
    fixes = [`OOS return ${(oos.net_return * 100).toFixed(1)}% — consider extending training window or adjusting threshold`];
  } else {
    action = 'PROCEED — strategy passes gates';
    actionColor = '\x1b[1;32m';
    fixes = ['Run live paper trade before committing capital'];
  }

  const W = 96;
  const sep = '─'.repeat(W);
  let out = `\n\x1b[1mVerdict\x1b[0m\n${sep}\n`;
  out += `  Action    ${actionColor}${action}\x1b[0m\n`;
  if (fixes.length) {
    fixes.forEach((f, i) => {
      out += `  ${i === 0 ? 'Fix' : '   '}       ${f}\n`;
    });
  }
  if (propFirm) {
    const pfColor = propFirm.passable ? '\x1b[32m' : '\x1b[31m';
    out += `  Prop firm ${pfColor}${propFirm.profile_name || propFirm.profile_id || 'active'} — ${propFirm.passable ? 'passable' : 'breach risk'}\x1b[0m`;
    if (propFirm.grade) out += ` (grade ${propFirm.grade})`;
    out += '\n';
  }
  out += sep;
  return out;
}

function renderFramedBlock(title, body, width) {
  const innerWidth = Math.max(18, width - 2);
  const lines = splitLines(body);
  const framed = [];
  framed.push(`+${'-'.repeat(innerWidth)}+`);
  if (title) {
    framed.push(`| ${padVisibleRight(clipVisible(title, innerWidth - 2), innerWidth - 2)} |`);
    framed.push(`|${'-'.repeat(innerWidth)}|`);
  }
  if (lines.length === 0) {
    framed.push(`|${padVisibleRight('', innerWidth)}|`);
  } else {
    for (const line of lines) {
      const clipped = clipVisible(line, innerWidth);
      framed.push(`|${padVisibleRight(clipped, innerWidth)}|`);
    }
  }
  framed.push(`+${'-'.repeat(innerWidth)}+`);
  return framed.join('\n');
}

function annualizedReturn(netReturn, start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  if (typeof netReturn !== 'number' || !Number.isFinite(netReturn) || netReturn <= -1) return null;
  const years = (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000);
  if (years <= 0) return null;
  return Math.pow(1 + netReturn, 1 / years) - 1;
}

function timeSpanYears(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000);
}

function compactBenchmark(benchmark) {
  if (!benchmark) return null;
  return {
    name: benchmark.name,
    symbol_count: benchmark.symbol_count,
    net_return: benchmark.net_return,
    best: benchmark.best ? {
      symbol: benchmark.best.symbol,
      net_return: benchmark.best.net_return,
      start: benchmark.best.start,
      end: benchmark.best.end,
    } : null,
    worst: benchmark.worst ? {
      symbol: benchmark.worst.symbol,
      net_return: benchmark.worst.net_return,
      start: benchmark.worst.start,
      end: benchmark.worst.end,
    } : null,
  };
}

function compactBenchmarks(benchmarks) {
  if (!benchmarks) return null;
  return {
    buy_hold_equal_weight: compactBenchmark(benchmarks.buy_hold_equal_weight),
  };
}

function buildTrustAssessment(report, outOfSample, options = {}) {
  const quality = report.data_quality_summary || {};
  const benchmark = outOfSample.benchmarks?.buy_hold_equal_weight || null;
  const oosAlpha = benchmark && Number.isFinite(benchmark.net_return)
    ? outOfSample.metrics.net_return - benchmark.net_return
    : null;
  const annualized = options.annualized;
  const oosAnnualized = options.oosAnnualized;
  const wf = options.walkForward && options.walkForward.ok ? options.walkForward : null;
  const freshnessRatio = quality.total_records > 0
    ? (quality.freshness_warnings || 0) / quality.total_records
    : 0;
  let score = 100;
  const warnings = [];

  if (report.source_mode === 'sample') {
    score -= 35;
    warnings.push('sample mode is not research evidence');
  }
  if (quality.risk === 'elevated') {
    score -= 35;
    warnings.push('data rejects/errors present');
  } else if (quality.risk === 'watch') {
    score -= 15;
    warnings.push('data freshness/provenance needs review');
  }
  if (freshnessRatio > 0.25) {
    score -= 15;
    warnings.push('large stale-record share');
  } else if (freshnessRatio > 0) {
    score -= 5;
    warnings.push('some stale records');
  }
  if ((outOfSample.metrics.trades || 0) < 50) {
    score -= 20;
    warnings.push('small OOS trade sample');
  }
  if (Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0.75) {
    score -= 20;
    warnings.push('extreme full-sample drawdown');
  } else if (Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0.5) {
    score -= 12;
    warnings.push('large full-sample drawdown');
  }
  if (Number.isFinite(oosAlpha) && oosAlpha < 0) {
    score -= 20;
    warnings.push('OOS underperforms buy-and-hold');
  }
  if (Number.isFinite(annualized) && Number.isFinite(oosAnnualized) && annualized > 1 && oosAnnualized < annualized * 0.35) {
    score -= 15;
    warnings.push('in-sample return far exceeds OOS');
  }
  const lossProb = report.metrics.monte_carlo?.probability_of_loss;
  if (Number.isFinite(lossProb) && lossProb > 0.5) {
    score -= 18;
    warnings.push('stress loss probability high');
  } else if (Number.isFinite(lossProb) && lossProb > 0.2) {
    score -= 10;
    warnings.push('stress loss probability elevated');
  }

  // Rolling walk-forward evidence
  const wfSummary = wf ? wf.aggregate : null;
  if (wf) {
    const positiveRate = wf.aggregate.positive_oos_rate;
    const meanOosReturn = wf.aggregate.mean_oos_return;
    if (Number.isFinite(positiveRate) && positiveRate < 0.5) {
      score -= 15;
      warnings.push(`rolling WF: only ${Math.round(positiveRate * 100)}% of folds profitable`);
    } else if (Number.isFinite(positiveRate) && positiveRate >= 0.67) {
      score = Math.min(100, score + 5);
    }
    if (Number.isFinite(meanOosReturn) && meanOosReturn < 0) {
      score -= 10;
      warnings.push('rolling WF mean OOS return negative');
    }
  } else if (report.source_mode !== 'sample') {
    score -= 5;
    warnings.push('rolling walk-forward not run');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  const verdict = grade === 'A' || grade === 'B'
    ? 'researchable'
    : grade === 'C'
      ? 'provisional'
      : 'do-not-trust-yet';
  return {
    grade,
    score,
    verdict,
    warnings: [...new Set(warnings)].slice(0, 6),
    oos_alpha_vs_buy_hold: oosAlpha,
    freshness_warning_ratio: freshnessRatio,
    walk_forward_summary: wfSummary || null,
  };
}

function backtestSummaryPayload(report, outOfSample, output, note = null) {
  const tailRisk = report.metrics.tail_risk || {};
  const monteCarlo = report.metrics.monte_carlo || {};
  const propFirm = report.metrics.prop_firm || null;
  const annualized = annualizedReturn(report.metrics.net_return, report.data_start, report.data_end);
  const tradeDensity = timeSpanYears(report.data_start, report.data_end);
  const recoveryFactor = Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0
    ? report.metrics.net_return / report.metrics.max_drawdown
    : null;
  const propFirmExpectancy = propFirm ? {
    profile_id: propFirm.profile_id || null,
    profile_name: propFirm.profile_name || null,
    firm: propFirm.firm || null,
    account_type: propFirm.account_type || null,
    step_count: propFirm.step_count ?? null,
    grade: propFirm.grade || null,
    score: propFirm.score ?? null,
    verdict: propFirm.verdict || null,
    passable: typeof propFirm.passable === 'boolean' ? propFirm.passable : null,
    trading_days: propFirm.trading_days ?? null,
    max_daily_loss_usage: propFirm.max_daily_loss_usage ?? null,
    max_total_loss_usage: propFirm.max_total_loss_usage ?? null,
    best_day_share_of_positive_profit: propFirm.best_day_share_of_positive_profit ?? null,
    time_weighted_variance: propFirm.time_weighted_variance ?? null,
    warnings: Array.isArray(propFirm.warnings) ? propFirm.warnings : [],
  } : null;
  const oosAnnualized = annualizedReturn(outOfSample.metrics.net_return, report.oos_start_at, report.oos_end_at);
  return {
    generated_at: report.generated_at,
    source_mode: report.source_mode,
    backtest_engine: report.engine || 'sovereign_js',
    data_quality_ok: report.data_quality_ok,
    data_quality_summary: report.data_quality_summary || null,
    trust_assessment: report.trust_assessment || null,
    strategy: report.strategy,
    strategy_source: report.strategy_source,
    strategy_family: report.strategy_family,
    strategy_lane: report.strategy_lane,
    strategy_role: report.strategy_role,
    strategy_universe: report.strategy_universe,
    strategy_asset_mode: report.strategy_asset_mode || null,
    model: report.model,
    timeframe: report.timeframe,
    period: report.period,
    threshold: report.threshold,
    data_start: report.data_start,
    data_end: report.data_end,
    data_bars: report.data_bars,
    oos_start_at: report.oos_start_at,
    oos_end_at: report.oos_end_at,
    oos_bars: report.oos_bars,
    run_started_at: report.run_started_at,
    run_ended_at: report.run_ended_at,
    runtime_ms: report.runtime_ms,
    trade_logs: report.trades.length,
    trades: report.metrics.trades,
    fee_bps: report.fee_bps,
    slippage_bps: report.slippage_bps,
    net_return: report.metrics.net_return,
    annualized_return: annualized,
    oos_annualized_return: oosAnnualized,
    calmar_ratio: report.calmar_ratio,
    trade_density_per_year: tradeDensity && tradeDensity > 0 ? report.metrics.trades / tradeDensity : null,
    recovery_factor: recoveryFactor,
    max_drawdown: report.metrics.max_drawdown,
    profit_factor: report.metrics.profit_factor,
    sharpe_ratio: report.metrics.sharpe_ratio,
    sortino_ratio: report.metrics.sortino_ratio,
    average_win: report.metrics.average_win,
    average_loss: report.metrics.average_loss,
    payoff_ratio: report.metrics.payoff_ratio,
    win_rate: report.metrics.win_rate,
    expected_value: report.metrics.expected_value,
    time_weighted_variance: report.metrics.time_weighted_variance,
    time_weighted_stddev: report.metrics.time_weighted_stddev,
    daily_summary: report.metrics.daily_summary || null,
    tail_var_95: tailRisk.value_at_risk,
    tail_es_95: tailRisk.expected_shortfall,
    mc_p05_return: monteCarlo.p05_final_return,
    mc_loss_prob: monteCarlo.probability_of_loss,
    mc_mean_max_drawdown: monteCarlo.mean_max_drawdown,
    mc_p95_max_drawdown: monteCarlo.p95_max_drawdown,
    stress_test: monteCarlo,
    benchmarks: compactBenchmarks(report.benchmarks),
    oos_benchmarks: compactBenchmarks(outOfSample.benchmarks),
    oos_trades: outOfSample.metrics.trades,
    oos_expected_value: outOfSample.metrics.expected_value,
    oos_net_return: outOfSample.metrics.net_return,
    prop_firm_suitability: propFirm,
    prop_firm_expectancy: propFirmExpectancy,
    prop_firm_profile: propFirm ? {
      id: propFirm.profile_id || null,
      name: propFirm.profile_name || null,
      firm: propFirm.firm || null,
      account_type: propFirm.account_type || null,
      step_count: propFirm.step_count ?? null,
    } : null,
    walk_forward: report.walk_forward ? {
      ok: report.walk_forward.ok,
      folds_run: report.walk_forward.folds_run,
      aggregate: report.walk_forward.aggregate || null,
    } : null,
    notes: note ? [note] : [],
    output,
  };
}

function renderBacktestSummary(report, outOfSample, output, note = null) {
  const universe = Array.isArray(report.strategy_universe) && report.strategy_universe.length
    ? report.strategy_universe.join(', ')
    : 'all available symbols';
  const assetMode = report.strategy_asset_mode || 'single_asset';
  const period = report.period && (report.period.from || report.period.to)
    ? `${report.period.from || 'start'} -> ${report.period.to || 'latest'}`
    : 'full sample';
  const tailRisk = report.metrics.tail_risk || {};
  const monteCarlo = report.metrics.monte_carlo || {};
  const annualized = annualizedReturn(report.metrics.net_return, report.data_start, report.data_end);
  const oosAnnualized = annualizedReturn(outOfSample.metrics.net_return, report.oos_start_at, report.oos_end_at);
  const tradeDensity = timeSpanYears(report.data_start, report.data_end);
  const recoveryFactor = Number.isFinite(report.metrics.max_drawdown) && report.metrics.max_drawdown > 0
    ? report.metrics.net_return / report.metrics.max_drawdown
    : null;
  const oosRecoveryFactor = Number.isFinite(outOfSample.metrics.max_drawdown) && outOfSample.metrics.max_drawdown > 0
    ? outOfSample.metrics.net_return / outOfSample.metrics.max_drawdown
    : null;

  console.log('');
  console.log('Backtest Summary');
  console.log('----------------');
  console.log(formatBacktestLine('Strategy', report.strategy));
  if (report.strategy_source) console.log(formatBacktestLine('Source', report.strategy_source));
  console.log(formatBacktestLine('Asset mode', formatStrategyAssetModeLabel(assetMode)));
  console.log(formatBacktestLine('Universe', universe));
  console.log(formatBacktestLine('Model', report.model));
  console.log(formatBacktestLine('Timeframe', report.timeframe || 'all'));
  console.log(formatBacktestLine('Period', period));
  console.log(formatBacktestLine('Threshold', formatDecimal(report.threshold, 2)));
  if (report.data_start || report.data_end) {
    const windowLabel = report.data_start && report.data_end
      ? `${report.data_start} -> ${report.data_end}`
      : report.data_start || report.data_end;
    console.log(formatBacktestLine('Data window', windowLabel));
    if (Number.isFinite(report.data_bars)) {
      console.log(formatBacktestLine('Data bars', String(report.data_bars)));
    }
  }
  console.log(formatBacktestLine('Runtime', Number.isFinite(report.runtime_ms) ? `${report.runtime_ms} ms` : 'n/a'));
  if (note) {
    const color = '\x1b[2;32m';
    console.log(`  \x1b[90mNote\x1b[0m                   ${color}${note}\x1b[0m`);
  }
  if (report.data_quality_summary && !report.data_quality_summary.ok) {
    const summary = report.data_quality_summary;
    const codes = summary.top_issue_codes && summary.top_issue_codes.length
      ? ` (${summary.top_issue_codes.join(', ')})`
      : '';
    console.log(formatBacktestLine('Data quality', `${summary.rejected_records} rejected, ${summary.warnings} warnings${codes}`));
  }

  const metricPanelBody = (title, metrics, start, end, annReturn, recovery) => [
    formatPanelLine('Window', `${shortDate(start)}..${shortDate(end)}`),
    formatPanelLine('Net return', formatPercent(metrics.net_return)),
    formatPanelLine('Annualized', formatPercent(annReturn)),
    formatPanelLine('Max drawdown', formatPercent(metrics.max_drawdown)),
    formatPanelLine('Recovery', formatDecimal(recovery)),
    formatPanelLine('Profit factor', formatDecimal(metrics.profit_factor)),
    formatPanelLine('Trades', String(metrics.trades)),
    formatPanelLine('Win rate', formatPercent(metrics.win_rate)),
    formatPanelLine('Expected value', formatPercent(metrics.expected_value)),
    formatPanelLine('Sharpe/Sortino', `${formatDecimal(metrics.sharpe_ratio)} / ${formatDecimal(metrics.sortino_ratio)}`),
    formatPanelLine('Avg win/loss', `${formatPercent(metrics.average_win)} / ${formatPercent(metrics.average_loss)}`),
  ].join('\n');

  const equitySeries = Array.isArray(report.compare_equity_curves) && report.compare_equity_curves.length
    ? report.compare_equity_curves
    : Array.isArray(report.equity_curve) && report.equity_curve.length
      ? [{ label: report.strategy, points: report.equity_curve, symbol: '|' }]
      : [];
  const equityChart = equitySeries.length > 0
    ? renderReturnTape(equitySeries[0].points, { width: 42, height: 5 })
    : '  (no return tape available)';
  const metricsPanel = renderFramedBlock('Backtest Metrics', metricPanelBody('Backtest', report.metrics, report.data_start, report.data_end, annualized, recoveryFactor), 46);
  const equityPanel = renderFramedBlock('Backtest Return Tape', equityChart, 68);

  console.log('');
  console.log('Backtest Panel');
  console.log('--------------');
  console.log(renderSideBySide(metricsPanel, equityPanel, 46));

  const oosSeries = Array.isArray(outOfSample.equity_curve) && outOfSample.equity_curve.length
    ? [{ label: `${report.strategy} OOS`, points: outOfSample.equity_curve, color: '\x1b[36m', symbol: '|' }]
    : [];
  const oosChart = oosSeries.length > 0
    ? renderReturnTape(oosSeries[0].points, { width: 42, height: 5 })
    : '  (no OOS return tape available)';
  const oosMetricsPanel = renderFramedBlock(
    'OOS Metrics',
    metricPanelBody('OOS', outOfSample.metrics, report.oos_start_at, report.oos_end_at, oosAnnualized, oosRecoveryFactor),
    46,
  );
  const oosCurvePanel = renderFramedBlock('OOS Return Tape', oosChart, 68);

  console.log('');
  console.log('Out Of Sample Panel');
  console.log('-------------------');
  console.log(renderSideBySide(oosMetricsPanel, oosCurvePanel, 46));

  const riskPanel = renderFramedBlock('Risk', [
    formatPanelLine('Fee/slippage', `${formatDecimal(report.fee_bps, 1)} / ${formatDecimal(report.slippage_bps, 1)} bps`),
    formatPanelLine('VaR 95', formatPercent(tailRisk.value_at_risk)),
    formatPanelLine('ES 95', formatPercent(tailRisk.expected_shortfall)),
    formatPanelLine('MC p05 return', formatPercent(monteCarlo.p05_final_return)),
    formatPanelLine('MC loss prob', formatPercent(monteCarlo.probability_of_loss)),
    formatPanelLine('MC p95 max DD', formatPercent(monteCarlo.p95_max_drawdown)),
  ].join('\n'), 46);

  const hygiene = report.data_quality_summary || {};
  const issueCodes = Array.isArray(hygiene.top_issue_codes) && hygiene.top_issue_codes.length
    ? hygiene.top_issue_codes.join(', ')
    : 'none';
  const hygienePanel = renderFramedBlock('Data Hygiene', [
    formatPanelLine('Status', hygiene.risk || 'clean'),
    formatPanelLine('Total records', String(hygiene.total_records ?? report.data_bars ?? 0)),
    formatPanelLine('Usable records', String(hygiene.usable_records ?? report.data_bars ?? 0)),
    formatPanelLine('Rejected', String(hygiene.rejected_records ?? 0)),
    formatPanelLine('Fresh stale', String(hygiene.freshness_warnings ?? 0)),
    formatPanelLine('Issues', issueCodes),
    formatPanelLine('Action', (hygiene.rejected_records || 0) > 0 ? 'clean/reingest' : (hygiene.freshness_warnings || 0) > 0 ? 'refresh cache' : 'none'),
  ].join('\n'), 46);

  console.log('');
  console.log('Evaluation');
  console.log('----------');
  console.log(renderSideBySide(riskPanel, hygienePanel, 46));

  const trust = report.trust_assessment || {};
  const fullBenchmark = report.benchmarks?.buy_hold_equal_weight || {};
  const oosBenchmark = outOfSample.benchmarks?.buy_hold_equal_weight || {};
  const benchmarkAlpha = Number.isFinite(trust.oos_alpha_vs_buy_hold) ? trust.oos_alpha_vs_buy_hold : null;
  const trustPanel = renderFramedBlock('Trust Gate', [
    formatPanelLine('Grade', trust.grade ? `${trust.grade} (${trust.score}/100)` : 'n/a'),
    formatPanelLine('Verdict', trust.verdict || 'n/a'),
    formatPanelLine('OOS alpha', formatPercent(benchmarkAlpha)),
    formatPanelLine('Fresh ratio', formatPercent(trust.freshness_warning_ratio)),
    formatPanelLine('Warnings', Array.isArray(trust.warnings) && trust.warnings.length ? trust.warnings.join(', ') : 'none'),
  ].join('\n'), 46);
  const propFirm = report.metrics.prop_firm || null;
  const propFirmPanel = renderFramedBlock('Prop Firm Expectancy', propFirm ? [
    formatPanelLine('Profile', propFirm.profile_name || propFirm.profile_id || 'active'),
    formatPanelLine('Firm', propFirm.firm || 'n/a'),
    formatPanelLine('Account type', propFirm.account_type || 'n/a'),
    formatPanelLine('Expectancy', propFirm.score != null ? `${propFirm.score}/100` : 'n/a'),
    formatPanelLine('Grade', propFirm.grade ? `${propFirm.grade}` : 'n/a'),
    formatPanelLine('Verdict', propFirm.verdict || 'n/a'),
    formatPanelLine('Passable', typeof propFirm.passable === 'boolean' ? (propFirm.passable ? 'yes' : 'no') : 'n/a'),
    formatPanelLine('Trading days', String(propFirm.trading_days ?? 'n/a')),
    formatPanelLine('Max daily loss', formatPercent(propFirm.max_daily_loss_usage)),
    formatPanelLine('Max total loss', formatPercent(propFirm.max_total_loss_usage)),
    formatPanelLine('Best day share', formatPercent(propFirm.best_day_share_of_positive_profit)),
    formatPanelLine('TW variance', formatDecimal(propFirm.time_weighted_variance, 6)),
    formatPanelLine('Warnings', Array.isArray(propFirm.warnings) && propFirm.warnings.length ? propFirm.warnings.join(', ') : 'none'),
  ].join('\n') : [
    formatPanelLine('Expectancy', 'n/a'),
    formatPanelLine('Grade', 'n/a'),
    formatPanelLine('Verdict', 'n/a'),
    formatPanelLine('Passable', 'n/a'),
  ].join('\n'), 46);
  const benchmarkPanel = renderFramedBlock('Benchmark', [
    formatPanelLine('Type', 'buy-hold EW'),
    formatPanelLine('Full return', formatPercent(fullBenchmark.net_return)),
    formatPanelLine('OOS return', formatPercent(oosBenchmark.net_return)),
    formatPanelLine('Symbols', String(oosBenchmark.symbol_count ?? fullBenchmark.symbol_count ?? 0)),
    formatPanelLine('Best OOS', oosBenchmark.best ? `${oosBenchmark.best.symbol} ${formatPercent(oosBenchmark.best.net_return)}` : 'n/a'),
    formatPanelLine('Worst OOS', oosBenchmark.worst ? `${oosBenchmark.worst.symbol} ${formatPercent(oosBenchmark.worst.net_return)}` : 'n/a'),
  ].join('\n'), 46);

  console.log('');
  console.log('Reliability');
  console.log('-----------');
  console.log(renderSideBySide(trustPanel, benchmarkPanel, 46));
  console.log('');
  console.log(renderSideBySide(propFirmPanel, renderFramedBlock('Return Shape', [
    formatPanelLine('TW variance', formatDecimal(report.metrics.time_weighted_variance, 6)),
    formatPanelLine('TW stddev', formatDecimal(report.metrics.time_weighted_stddev, 6)),
    formatPanelLine('Daily stddev', formatDecimal(report.metrics.daily_summary?.daily_return_stddev, 6)),
    formatPanelLine('Profitable days', `${report.metrics.daily_summary?.positive_days ?? 'n/a'}/${report.metrics.daily_summary?.trading_days ?? 'n/a'}`),
    formatPanelLine('Worst day', formatPercent(report.metrics.daily_summary?.worst_day_return)),
  ].join('\n'), 46), 46));

  const wf = report.walk_forward;
  if (wf && wf.ok && wf.folds && wf.folds.length > 0) {
    const wfAgg = wf.aggregate || {};
    const wfPanel = renderFramedBlock('Walk-Forward', [
      formatPanelLine('Folds run', `${wf.folds_run} of ${wf.folds_requested}`),
      formatPanelLine('Mean OOS return', formatPercent(wfAgg.mean_oos_return)),
      formatPanelLine('Mean OOS Sharpe', formatDecimal(wfAgg.mean_oos_sharpe, 2)),
      formatPanelLine('Mean OOS DD', formatPercent(wfAgg.mean_oos_drawdown)),
      formatPanelLine('Profitable folds', `${wfAgg.positive_oos_folds}/${wf.folds_run} (${formatPercent(wfAgg.positive_oos_rate)})`),
    ].join('\n'), 46);
    const foldRows = wf.folds.map((f) =>
      formatPanelLine(`Fold ${f.fold}`, `${formatPercent(f.out_of_sample.net_return)} | ${f.out_of_sample.trades}t | Sharpe ${formatDecimal(f.out_of_sample.sharpe_ratio, 1)}`),
    ).join('\n');
    const foldPanel = renderFramedBlock('WF Fold Detail', foldRows, 68);
    console.log('');
    console.log('Walk-Forward');
    console.log('------------');
    console.log(renderSideBySide(wfPanel, foldPanel, 46));
  }

  const stress = report.metrics.monte_carlo || {};
  if (stress && Object.keys(stress).length > 0) {
    const stressStats = renderFramedBlock('Stress Test', [
      formatPanelLine('Median final', formatPercent(stress.median_final_return)),
      formatPanelLine('Worst sample', formatPercent(stress.worst_path ? stress.worst_path.final_return : stress.p05_final_return)),
      formatPanelLine('P05 final', formatPercent(stress.p05_final_return)),
      formatPanelLine('P95 final', formatPercent(stress.p95_final_return)),
      formatPanelLine('Mean max DD', formatPercent(stress.mean_max_drawdown)),
      formatPanelLine('P95 max DD', formatPercent(stress.p95_max_drawdown)),
    ].join('\n'), 46);
    console.log('');
    console.log('Stress Test');
    console.log('-----------');
    if (stress.paths_available === false) {
      console.log(stressStats);
    } else {
      const stressChart = renderFramedBlock('Stress Shape', renderStressShape(stress), 68);
      console.log(renderSideBySide(stressStats, stressChart, 46));
    }
  }

  console.log('');
  console.log(renderVerdictBlock(report));
  console.log('');
  console.log(`Output: ${output}`);
}

function featureFrameDateRange(featureFrame) {
  const stamps = (featureFrame.features || [])
    .map((feature) => Date.parse(feature.as_of))
    .filter((stamp) => Number.isFinite(stamp));
  if (stamps.length === 0) return { start: null, end: null, bars: 0 };
  return {
    start: new Date(Math.min(...stamps)).toISOString(),
    end: new Date(Math.max(...stamps)).toISOString(),
    bars: stamps.length,
  };
}

function hasValueFlag(args, name) {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length;
}

function resolvePropFirmProfileFromArgs(args) {
  const ref = optionValue(args, '--prop-firm', optionValue(args, '--prop-firm-profile', null));
  return resolvePropFirmProfile(ref);
}

function optionValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && index + 1 < args.length) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function symbolsFromArgs(args) {
  return optionValues(args, '--symbol')
    .flatMap((value) => String(value || '').split(','))
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function filterFeatureFrameBySymbols(featureFrame, symbols) {
  const target = new Set((symbols || []).map((symbol) => String(symbol).toUpperCase()));
  if (target.size === 0) return featureFrame;
  const features = (featureFrame.features || []).filter((feature) => target.has(String(feature.symbol || '').toUpperCase()));
  return { ...featureFrame, features, feature_count: features.length };
}

function resolveStrategyPathInput(strategyPath) {
  if (!strategyPath) return strategyPath;
  const raw = String(strategyPath).trim();
  if (!raw || path.isAbsolute(raw) || raw.includes('/') || raw.includes('\\')) return raw;
  const candidate = path.join('config', 'strategies', raw).replace(/\\/g, '/');
  return fs.existsSync(path.join(REPO_ROOT, candidate)) ? candidate : raw;
}

async function resolveStrategyBacktestDefaults(args) {
  const { inspectStrategyFile, registeredStrategyOptions } = require('../strategy/strategy.js');
  let strategyPath = resolveStrategyPathInput(optionValue(args, '--strategy', null));

  if (!strategyPath && isRichTerminal() && !hasFlag(args, '--json')) {
    const options = registeredStrategyOptions();
    if (options.length > 0) {
      strategyPath = await promptSelect('Strategy:', [
        ...options,
        { label: 'Manual flags only', value: null, category: 'Other' },
      ]);
    }
  }

  if (!strategyPath) {
    return { args: [...args], strategy: null };
  }

  const strategy = inspectStrategyFile(strategyPath);
  if (!strategy.ok) {
    throw new Error(`Strategy file is invalid: ${strategyPath} (${(strategy.issues || []).join(', ') || 'unknown issue'})`);
  }

  const effectiveArgs = [...args];
  if (!hasValueFlag(effectiveArgs, '--strategy')) {
    effectiveArgs.push('--strategy', strategy.path);
  }
  if (!hasValueFlag(effectiveArgs, '--threshold') && Number.isFinite(Number(strategy.risk?.signal_threshold))) {
    effectiveArgs.push('--threshold', String(strategy.risk.signal_threshold));
  }
  if (!hasValueFlag(effectiveArgs, '--model') && strategy.model) {
    effectiveArgs.push('--model', strategy.model);
  }

  return { args: effectiveArgs, strategy };
}

function commandIndicators(args) {
  const output = optionValue(args, '--output', DEFAULT_FEATURES);
  const { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (rejectDegradedResearchInput(quality, args, 'Feature generation')) return 1;
  const periods = periodOptionsFromArgs(args);
  const features = calculateFeatureFrame(snapshot.sources, periods);
  const payload = {
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_report: quality ? DEFAULT_QUALITY_REPORT : null,
    ...features,
  };
  writeJson(output, payload);
  printPayload({
    feature_count: payload.feature_count,
    skipped: payload.skipped.length,
    periods: payload.indicator_periods,
    output,
  }, args);
  return 0;
}

function commandModelCompare(args) {
  const output = optionValue(args, '--output', DEFAULT_MODEL_REPORT);
  const { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (rejectDegradedResearchInput(quality, args, 'Model comparison')) return 1;
  const defaults = researchConfig.backtest_defaults || {};
  const featureFrame = filterFeatureFrame(calculateRollingFeatureFrame(snapshot.sources, 2, periodOptionsFromArgs(args)), dateFilterOptionsFromArgs(args));
  const report = {
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_report: quality ? DEFAULT_QUALITY_REPORT : null,
    ...compareModels(featureFrame, {
      horizon: numericOption(args, '--horizon', defaults.horizon || 5),
      threshold: numericOption(args, '--threshold', defaults.threshold || 0.55),
    }),
  };
  writeJson(output, report);
  printPayload({
    winner: report.winner,
    models: report.models.length,
    families: report.families,
    per_symbol_winners: report.per_symbol_winners,
    feature_count: report.feature_count,
    output,
  }, args);
  return 0;
}

async function pickBacktestSymbols(preSelected = [], assetMode = 'single_asset') {
  const { pickAssets } = require('../../tui/asset_picker.js');
  const assetModeLabel = formatStrategyAssetModeLabel(assetMode);
  const prompt = assetMode === 'portfolio_management'
    ? 'Select portfolio assets for this backtest:'
    : 'Select assets to backtest:';
  const label = `Backtest — ${assetModeLabel}`;
  const picked = await pickAssets({ multi: true, label, preSelected, prompt });
  return picked;
}

async function commandBacktest(args) {
  const backtestStartedAt = Date.now();
  const requestedDays = Math.max(0, Math.floor(numericOption(args, '--days', 0)));
  let resolved;
  try {
    resolved = await resolveStrategyBacktestDefaults(args);
  } catch (error) {
    printPayload({ error: error.message }, args);
    return 1;
  }
  args = resolved.args;
  const strategyConfig = resolved.strategy;
  const defaults = researchConfig.backtest_defaults || {};
  const output = optionValue(args, '--output', DEFAULT_BACKTEST);
  
  let strategyPath = resolveStrategyPathInput(optionValue(args, '--strategy', null));
  let strategyMeta = null;

 
  if (!strategyPath && isRichTerminal() && !hasFlag(args, '--json') && !hasFlag(args, '--sample')) {
    const { readStrategyRegistry, inspectStrategyFile } = require('../strategy/strategy.js');
    const files = readStrategyRegistry();
    const strategies = files.map(inspectStrategyFile);
    
    if (strategies.length > 0) {
      console.log(`\n\x1b[1;36mSelect Strategy for Backtest\x1b[0m`);
      strategyPath = await promptSelect('Select registered strategy:', strategies.map(s => ({
        label: `${s.name} (${s.kind})`,
        value: s.path
      })));
    }
  }

  if (strategyPath) {
    const { inspectStrategyFile } = require('../strategy/strategy.js');
    strategyMeta = inspectStrategyFile(strategyPath);
    if (!strategyMeta.exists) {
      console.warn(`\x1b[1;33m[WARNING]\x1b[0m Strategy file not found: ${strategyPath}. Using defaults.`);
    }
  }

  const model = optionValue(args, '--model', strategyMeta?.model || defaults.model || 'cnn_window_v0');
  const timeframe = optionValue(args, '--timeframe', null);
  const fromArg = optionValue(args, '--from', null);
  const from = fromArg || (requestedDays > 0 && !hasFlag(args, '--sample')
    ? new Date(Date.now() - requestedDays * 86400_000).toISOString()
    : null);
  const to = optionValue(args, '--to', null);
  const horizon = numericOption(args, '--horizon', defaults.horizon || 5);
  const threshold = numericOption(args, '--threshold', strategyMeta?.risk?.signal_threshold || defaults.threshold || 0.55);

  // Symbol selection: interactive in rich terminal, auto-inject otherwise
  const strategyUniverse = strategyMeta?.universe || [];
  const strategyAssetMode = classifyStrategyAssetMode(strategyMeta || strategyConfig || {});
  if (!optionValue(args, '--symbol', null)) {
    if (isRichTerminal() && !hasFlag(args, '--json')) {
      const picked = await pickBacktestSymbols(strategyUniverse, strategyAssetMode);
      if (picked === null) return 1; // user cancelled
      if (picked.length > 0) {
        args = [...args, '--symbol', picked.join(',')];
      } else if (strategyUniverse.length > 0) {
        console.log(`\x1b[90m[INFO] No symbols selected, using strategy universe: ${strategyUniverse.join(', ')}\x1b[0m`);
        args = [...args, '--symbol', strategyUniverse.join(',')];
      }
    } else if (hasFlag(args, '--json') && strategyUniverse.length > 0) {
      args = [...args, '--symbol', strategyUniverse.join(',')];
    } else if (strategyUniverse.length > 0) {
      console.log(`\x1b[90m[INFO] Using universe from strategy: ${strategyUniverse.join(', ')}\x1b[0m`);
      args = [...args, '--symbol', strategyUniverse.join(',')];
    }
  }

  const costBps = numericOption(args, '--cost-bps', defaults.cost_bps || 5);
  const feeBps = numericOption(args, '--fee-bps', defaults.fee_bps || costBps / 2);
  const slippageBps = numericOption(args, '--slippage-bps', defaults.slippage_bps || costBps / 2);
  const trainRatio = numericOption(args, '--train-ratio', defaults.train_ratio || 0.7);
  const tailAlpha = numericOption(args, '--tail-alpha', defaults.tail_alpha || 0.05);
  const monteCarloRuns = numericOption(args, '--monte-carlo-runs', defaults.monte_carlo_runs || 200);
  const selectedSymbols = symbolsFromArgs(args);
  const sampleMode = hasFlag(args, '--sample');
  const snapshotFamily = inferSnapshotFamily(args, strategyMeta);
  let { snapshot, quality } = sampleMode
    ? loadSampleSources(args, selectedSymbols)
    : loadUsableSources(args, { family: snapshotFamily });
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (!sampleMode && requestedDays > 0) {
    try {
      const historical = await withLoadingAnimation('Fetching historical data', () => loadHistoricalSources(args), args);
      snapshot = historical.snapshot;
      quality = historical.quality;
      if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
    } catch (error) {
      const message = `Unable to fetch provider history for ${requestedDays} days: ${error.message}. Refresh the live cache with 'backfill' or check network access.`;
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(message);
      }
      return 1;
    }
  }
  const initialQualityError = backtestDataQualityError(quality, args);
  if (initialQualityError) {
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: initialQualityError }, null, 2));
    } else {
      console.error(initialQualityError);
    }
    return 1;
  }
  let featureFrame;
  await withLoadingAnimation('Computing indicators', async () => {
    featureFrame = filterFeatureFrameBySymbols(calculateRollingFeatureFrame(snapshot.sources, 2, periodOptionsFromArgs(args)), selectedSymbols);
  }, args);
  const qualityError = backtestDataQualityError(quality, args);
  if (qualityError) {
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: qualityError }, null, 2));
    } else {
      console.error(qualityError);
    }
    return 1;
  }
  const filteredFrame = filterFeatureFrame(featureFrame, { timeframe, from, to });
  const split = splitFeatureFrame(filteredFrame, trainRatio);
  const dataRange = featureFrameDateRange(filteredFrame);
  const oosRange = featureFrameDateRange(split.test);
  const selectedPropFirm = resolvePropFirmProfileFromArgs(args);
  const selectedPropFirmRef = optionValue(args, '--prop-firm', optionValue(args, '--prop-firm-profile', null));
  const backtestOptions = {
    strategy: strategyMeta?.name || strategyConfig?.name || 'cnn_momentum',
    model,
    horizon,
    threshold,
    costBps,
    feeBps,
    slippageBps,
    tailAlpha,
    monteCarloRuns,
    propFirm: selectedPropFirmRef,
    propFirmProfile: selectedPropFirm,
    engine: sampleMode ? 'js' : (strategyMeta?.engine || 'auto'),
  };
  const sampleWindowNote = backtestModeNote(sampleMode, quality);
  let inSample;
  let outOfSample;
  let fullBacktest;
  let wfResult;
  await withLoadingAnimation('Running backtest', async () => {
    inSample = runBacktest(split.train, backtestOptions);
    outOfSample = runBacktest(split.test, backtestOptions);
    fullBacktest = runBacktest(featureFrame, { ...backtestOptions, timeframe, from, to });
    if (!sampleMode) {
      wfResult = rollingWalkForward(filteredFrame, runBacktest, {
        folds: 3,
        backtestOptions,
      });
    }
  }, args);
  const annualized = annualizedReturn(fullBacktest.metrics.net_return, dataRange.start, dataRange.end);
  const oosAnnualized = annualizedReturn(outOfSample.metrics.net_return, oosRange.start, oosRange.end);
  const calmar = annualized != null && Number.isFinite(fullBacktest.metrics.max_drawdown) && fullBacktest.metrics.max_drawdown > 0
    ? annualized / fullBacktest.metrics.max_drawdown
    : null;
  const tradeDensity = timeSpanYears(dataRange.start, dataRange.end);
  const recoveryFactor = Number.isFinite(fullBacktest.metrics.max_drawdown) && fullBacktest.metrics.max_drawdown > 0
    ? fullBacktest.metrics.net_return / fullBacktest.metrics.max_drawdown
    : null;
  const qualitySummary = dataQualitySummary(quality);
  const strategyTaxonomy = inferStrategyTaxonomy({
    name: strategyMeta?.name || strategyConfig?.name || backtestOptions.strategy,
    kind: strategyMeta?.kind || strategyConfig?.kind || null,
    family: strategyMeta?.family || strategyConfig?.family || null,
    lane: strategyMeta?.lane || strategyConfig?.lane || null,
    role: strategyMeta?.role || strategyConfig?.role || null,
  });
  const strategySource = strategyMeta?.path || strategyConfig?.path || null;
  const report = {
    generated_at: new Date().toISOString(),
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_report: quality ? DEFAULT_QUALITY_REPORT : null,
    data_quality_summary: qualitySummary,
    strategy: backtestOptions.strategy,
    model,
    timeframe: timeframe || null,
    threshold,
    strategy_source: strategySource ? normalizeStrategyPath(strategySource) : null,
    strategy_family: strategyTaxonomy.family,
    strategy_lane: strategyTaxonomy.lane,
    strategy_role: strategyTaxonomy.role,
    strategy_universe: selectedSymbols,
    strategy_asset_mode: strategyAssetMode,
    prop_firm_profile: selectedPropFirm ? {
      id: selectedPropFirm.id || null,
      name: selectedPropFirm.name || null,
      firm: selectedPropFirm.firm || null,
      account_type: selectedPropFirm.account_type || null,
      step_count: selectedPropFirm.step_count ?? null,
    } : null,
    data_start: dataRange.start,
    data_end: dataRange.end,
    data_bars: dataRange.bars,
    oos_start_at: oosRange.start,
    oos_end_at: oosRange.end,
    oos_bars: oosRange.bars,
    run_started_at: new Date(backtestStartedAt).toISOString(),
    run_ended_at: new Date().toISOString(),
    runtime_ms: Date.now() - backtestStartedAt,
    train_ratio: trainRatio,
    annualized_return: annualized,
    oos_annualized_return: oosAnnualized,
    calmar_ratio: calmar,
    recovery_factor: recoveryFactor,
    trade_density_per_year: tradeDensity && tradeDensity > 0 ? fullBacktest.metrics.trades / tradeDensity : null,
    stress_test: fullBacktest.metrics.monte_carlo,
    in_sample: inSample.metrics,
    out_of_sample: outOfSample.metrics,
    walk_forward: wfResult || null,
    ...fullBacktest,
  };
  report.trust_assessment = buildTrustAssessment(report, outOfSample, { annualized, oosAnnualized, walkForward: wfResult });
  if (report.strategy_source && report.trust_assessment) {
    upsertStrategyGradeRecord({
      path: report.strategy_source,
      name: strategyMeta?.name || strategyConfig?.name || backtestOptions.strategy,
      family: strategyTaxonomy.family,
      lane: strategyTaxonomy.lane,
      role: strategyTaxonomy.role,
      grade: report.trust_assessment.grade,
      score: report.trust_assessment.score,
      verdict: report.trust_assessment.verdict,
      trust_state: report.trust_assessment.state || report.trust_assessment.verdict || null,
      last_backtest_at: report.generated_at,
      time_weighted_variance: report.metrics.time_weighted_variance,
      time_weighted_stddev: report.metrics.time_weighted_stddev,
      prop_firm_score: report.metrics.prop_firm?.score,
      prop_firm_grade: report.metrics.prop_firm?.grade,
      prop_firm_verdict: report.metrics.prop_firm?.verdict,
      prop_firm_passable: report.metrics.prop_firm?.passable,
      prop_firm_trading_days: report.metrics.prop_firm?.trading_days,
      prop_firm_best_day_share: report.metrics.prop_firm?.best_day_share_of_positive_profit,
    });
  }
  writeJson(output, report);
  if (!global.suppressLogs) {
    if (hasFlag(args, '--json')) {
      printPayload(backtestSummaryPayload(report, outOfSample, output, sampleWindowNote), args);
    } else {
      renderBacktestSummary(report, outOfSample, output, sampleWindowNote);
    }
  }
  return report;
}

async function commandOptimize(args) {
  const output = optionValue(args, '--output', path.join(REPO_ROOT, 'data', 'models', 'latest_indicator_optimization.json'));
  
  let strategyPath = resolveStrategyPathInput(optionValue(args, '--strategy', null));
  let strategyMeta = null;

  if (!strategyPath && isRichTerminal() && !hasFlag(args, '--json')) {
    const { readStrategyRegistry, inspectStrategyFile } = require('../strategy/strategy.js');
    const files = readStrategyRegistry();
    const strategies = files.map(inspectStrategyFile);
    if (strategies.length > 0) {
      console.log(`\n\x1b[1;36mOptimize Indicator Periods\x1b[0m`);
      strategyPath = await promptSelect('Select strategy to optimize:', strategies.map(s => ({
        label: `${s.name} (${s.kind})`,
        value: s.path
      })));
    }
  }

  if (strategyPath) {
    const { inspectStrategyFile } = require('../strategy/strategy.js');
    strategyMeta = inspectStrategyFile(strategyPath);
  }

  // Inject symbols from strategy universe if not explicitly provided
  if (strategyMeta?.universe && strategyMeta.universe.length > 0 && !optionValue(args, '--symbol', null)) {
      console.log(`\x1b[90m[INFO] Using universe from strategy: ${strategyMeta.universe.join(', ')}\x1b[0m`);
      args = [...args, '--symbol', strategyMeta.universe.join(',')];
  }

  const snapshotFamily = inferSnapshotFamily(args, strategyMeta);
  let { snapshot, quality } = loadUsableSources(args, { family: snapshotFamily });
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  const optimizationQualityError = backtestDataQualityError(quality, args);
  const optimizationQualityWarning = optimizationQualityError && (quality?.usable_records || 0) > 0
    ? optimizationQualityError.replace(/^Data-quality validation failed[:.]?\s*/, 'Optimization continues on the usable slice despite data-quality validation. ')
    : null;
  if (optimizationQualityError && (quality?.usable_records || 0) === 0) {
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: optimizationQualityError.replace(/^Data-quality validation failed[:.]?\s*/, 'Optimization input failed data-quality validation. ') }, null, 2));
    } else {
      console.error(optimizationQualityError.replace(/^Data-quality validation failed[:.]?\s*/, 'Optimization input failed data-quality validation. '));
    }
    return 1;
  }
  if (optimizationQualityWarning && !hasFlag(args, '--json')) {
    console.warn(`\x1b[1;33m[WARN]\x1b[0m ${optimizationQualityWarning}`);
  }
  const defaults = researchConfig.backtest_defaults || {};
  const timeframe = optionValue(args, '--timeframe', null);
  const from = optionValue(args, '--from', null);
  const to = optionValue(args, '--to', null);
  const horizon = numericOption(args, '--horizon', defaults.horizon || 5);
  const threshold = numericOption(args, '--threshold', strategyMeta?.risk?.signal_threshold || defaults.threshold || 0.55);
  const costBps = numericOption(args, '--cost-bps', defaults.cost_bps || 5);
  const feeBps = numericOption(args, '--fee-bps', defaults.fee_bps || costBps / 2);
  const slippageBps = numericOption(args, '--slippage-bps', defaults.slippage_bps || costBps / 2);
  const tailAlpha = numericOption(args, '--tail-alpha', defaults.tail_alpha || 0.05);
  const monteCarloRuns = numericOption(args, '--monte-carlo-runs', defaults.monte_carlo_runs || 200);
  const trainRatio = numericOption(args, '--train-ratio', defaults.train_ratio || 0.7);
  const { grid, basePeriods, indicatorFlags } = buildOptimizationGrid(strategyMeta, args);

  let runs = [];
  await withLoadingAnimation('Optimizing indicators', async () => {
    runs = grid.map((periods) => {
      const frame = calculateRollingFeatureFrame(snapshot.sources, 2, periods);
      const filtered = filterFeatureFrame(frame, { timeframe, from, to });
      const split = splitFeatureFrame(filtered, trainRatio);
      const backtestOptions = {
        strategy: 'cnn_momentum',
        model: defaults.model || 'cnn_window_v0',
        horizon,
        threshold,
        costBps,
        feeBps,
        slippageBps,
        tailAlpha,
        monteCarloRuns,
        propFirm: 'none',
        propFirmProfile: null,
        engine: 'js', // grid loop: stay on JS to avoid one C++ spawn per combination
      };
      const trainBacktest = runBacktest(split.train, backtestOptions);
      const testBacktest = runBacktest(split.test, backtestOptions);
      const overfit_warning = (testBacktest.metrics.sharpe_ratio < (trainBacktest.metrics.sharpe_ratio * 0.5)) || (testBacktest.metrics.expected_value < 0);

      return {
        periods,
        indicator_periods: periods,
        enabled_indicators: indicatorFlags,
        timeframe: timeframe || testBacktest.timeframe,
        period: { from, to },
        feature_count: filtered.feature_count,
        train: trainBacktest.metrics,
        test: testBacktest.metrics,
        trades: trainBacktest.metrics.trades,
        net_return: trainBacktest.metrics.net_return,
        max_drawdown: trainBacktest.metrics.max_drawdown,
        sharpe_ratio: trainBacktest.metrics.sharpe_ratio,
        sortino_ratio: trainBacktest.metrics.sortino_ratio,
        win_rate: trainBacktest.metrics.win_rate,
        expected_value: trainBacktest.metrics.expected_value,
        oos_trades: testBacktest.metrics.trades,
        oos_net_return: testBacktest.metrics.net_return,
        oos_expected_value: testBacktest.metrics.expected_value,
        overfit_warning,
        score: trainBacktest.metrics.net_return - trainBacktest.metrics.max_drawdown + (trainBacktest.metrics.expected_value * 10) - (overfit_warning ? 100 : 0), // Penalize overfitting
      };
      }).sort((a, b) => b.score - a.score || b.net_return - a.net_return);
  }, args);
  if (runs.length > 0 && runs[0].feature_count === 0) {
    const message = 'Optimization input has no usable features in the current slice. Refresh the cache with backfill or choose a different timeframe/strategy.';
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(message);
    }
    return 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_warning: optimizationQualityWarning,
    timeframe: timeframe || 'all',
    period: { from, to },
    train_ratio: trainRatio,
    indicator_periods: basePeriods,
    enabled_indicators: indicatorFlags,
    tested: runs.length,
    winner: runs[0] || null,
    top: runs.slice(0, 10),
  };
  writeJson(output, report);
  printPayload({
    tested: report.tested,
    winner: report.winner ? report.winner.periods : 'none',
    indicator_periods: report.indicator_periods,
    winner_net_return: report.winner ? report.winner.net_return : 0,
    winner_max_drawdown: report.winner ? report.winner.max_drawdown : 0,
    winner_sharpe: report.winner ? report.winner.sharpe_ratio : null,
    winner_sortino: report.winner ? report.winner.sortino_ratio : null,
    winner_win_rate: report.winner ? report.winner.win_rate : 0,
    winner_ev: report.winner ? report.winner.expected_value : 0,
    winner_tail_var_95: report.winner && report.winner.train && report.winner.train.tail_risk ? report.winner.train.tail_risk.value_at_risk : null,
    winner_mc_loss_prob: report.winner && report.winner.train && report.winner.train.monte_carlo ? report.winner.train.monte_carlo.probability_of_loss : null,
    oos_trades: report.winner ? report.winner.oos_trades : 0,
    oos_net_return: report.winner ? report.winner.oos_net_return : 0,
    oos_ev: report.winner ? report.winner.oos_expected_value : 0,
    oos_overfit_warning: report.winner ? report.winner.overfit_warning : false,
    output,
  }, args);
  return 0;
}

async function commandEdgeDecay(args) {
  let resolved;
  try {
    resolved = await resolveStrategyBacktestDefaults(args);
  } catch (error) {
    printPayload({ error: error.message }, args);
    return 1;
  }
  args = resolved.args;
  const strategyConfig = resolved.strategy;

  let strategyPath = resolveStrategyPathInput(optionValue(args, '--strategy', null));
  let strategyMeta = null;
  if (strategyPath) {
    const { inspectStrategyFile } = require('../strategy/strategy.js');
    strategyMeta = inspectStrategyFile(strategyPath);
  }

  const timeframe = optionValue(args, '--timeframe', null);
  const snapshotFamily = inferSnapshotFamily(args, strategyMeta);
  const { snapshot, quality } = loadUsableSources(args, { family: snapshotFamily });
  const defaults = researchConfig.backtest_defaults || {};
  const selectedSymbols = symbolsFromArgs(args);

  const periodOpts = periodOptionsFromStrategy(strategyMeta, args);
  const fullFrame = filterFeatureFrameBySymbols(
    calculateRollingFeatureFrame(snapshot.sources, 2, periodOpts),
    selectedSymbols
  );

  const backtestOptions = {
    strategy: strategyMeta?.name || strategyConfig?.name || 'cnn_momentum',
    model: optionValue(args, '--model', strategyMeta?.model || defaults.model || 'cnn_window_v0'),
    horizon: numericOption(args, '--horizon', defaults.horizon || 5),
    threshold: numericOption(args, '--threshold', strategyMeta?.risk?.signal_threshold || defaults.threshold || 0.55),
    costBps: numericOption(args, '--cost-bps', defaults.cost_bps || 5),
    feeBps: numericOption(args, '--fee-bps', defaults.fee_bps || 2),
    slippageBps: numericOption(args, '--slippage-bps', defaults.slippage_bps || 3),
    tailAlpha: numericOption(args, '--tail-alpha', defaults.tail_alpha || 0.05),
    monteCarloRuns: 50,
    propFirm: null,
    propFirmProfile: null,
    engine: 'js', // window loop: stay on JS to avoid one C++ spawn per rolling window
  };

  const WINDOWS = [30, 90, 180, 365];
  const nowTs = Date.now();

  const windows = [];
  await withLoadingAnimation('Running edge decay analysis', async () => {
    for (const days of WINDOWS) {
      const fromIso = new Date(nowTs - days * 86400_000).toISOString();
      const slice = filterFeatureFrame(fullFrame, { timeframe, from: fromIso });
      if (!slice || slice.feature_count === 0) continue;
      const bt = runBacktest(slice, backtestOptions);
      windows.push({ label: `${days}d`, days, ...bt.metrics });
    }
    const fullFiltered = filterFeatureFrame(fullFrame, { timeframe });
    if (fullFiltered && fullFiltered.feature_count > 0) {
      const bt = runBacktest(fullFiltered, backtestOptions);
      windows.push({ label: 'full', days: null, ...bt.metrics });
    }
  }, args);

  if (windows.length < 2) {
    printPayload({ error: 'Insufficient data for edge decay analysis. Run backfill first.' }, args);
    return 1;
  }

  const fullEntry = windows.find(w => w.label === 'full') || windows.at(-1);
  const recentEntry = windows.find(w => w.days === 90) || windows.find(w => w.days === 180) || windows[0];
  const fullSharpe = fullEntry?.sharpe_ratio ?? 0;
  const recentSharpe = recentEntry?.sharpe_ratio ?? 0;

  let decayScore;
  if (fullSharpe <= 0) {
    decayScore = recentSharpe > 0 ? 1.2 : 0;
  } else {
    decayScore = Math.max(0, recentSharpe / fullSharpe);
  }

  const verdict = decayScore >= 0.8 ? 'STABLE' : decayScore >= 0.5 ? 'DEGRADING' : 'DECAYED';

  const report = {
    generated_at: new Date().toISOString(),
    strategy: backtestOptions.strategy,
    timeframe: timeframe || 'all',
    decay_score: Math.round(decayScore * 100) / 100,
    verdict,
    reference_sharpe_full: Math.round((fullSharpe ?? 0) * 1000) / 1000,
    reference_sharpe_recent: Math.round((recentSharpe ?? 0) * 1000) / 1000,
    windows: windows.map(w => ({
      window: w.label,
      sharpe: Math.round((w.sharpe_ratio ?? 0) * 1000) / 1000,
      net_return: Math.round((w.net_return ?? 0) * 10000) / 10000,
      win_rate: Math.round((w.win_rate ?? 0) * 1000) / 1000,
      max_drawdown: Math.round((w.max_drawdown ?? 0) * 10000) / 10000,
      trades: w.trades ?? 0,
    })),
  };

  if (hasFlag(args, '--json')) {
    printPayload(report, args);
  } else {
    const col = (s, n) => String(s ?? '').padEnd(n);
    const num = (v, d = 4) => (v == null ? 'n/a' : Number(v).toFixed(d)).padStart(9);
    console.log(`\n\x1b[1;36mEdge Decay Analysis â€” ${report.strategy}\x1b[0m`);
    console.log(`\x1b[90m${'â”€'.repeat(62)}\x1b[0m`);
    console.log(`  ${col('Window', 8)} ${col('Sharpe', 9)} ${col('Return', 9)} ${col('Win%', 7)} ${col('MaxDD', 9)} ${col('Trades', 7)}`);
    console.log(`\x1b[90m${'â”€'.repeat(62)}\x1b[0m`);
    for (const w of report.windows) {
      const tag = w.window === recentEntry.label ? '\x1b[1;33m*\x1b[0m' : ' ';
      const sharp = w.sharpe < 0 ? `\x1b[31m${num(w.sharpe)}\x1b[0m` : num(w.sharpe);
      console.log(`${tag} ${col(w.window, 8)} ${sharp} ${num(w.net_return)} ${num(w.win_rate, 2)} ${num(w.max_drawdown)} ${String(w.trades).padStart(7)}`);
    }
    console.log(`\x1b[90m${'â”€'.repeat(62)}\x1b[0m`);
    const verdictColor = verdict === 'STABLE' ? '\x1b[32m' : verdict === 'DEGRADING' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  Decay Score: ${verdictColor}${report.decay_score}\x1b[0m   Verdict: ${verdictColor}${verdict}\x1b[0m`);
    console.log(`  (* = reference recent window for decay score)`);
    console.log('');
  }
  return 0;
}

async function commandDemo(args) {
  commandIndicators(args);
  commandModelCompare(args);
  await commandBacktest(args);
  await commandOptimize(args);
  return 0;
}

module.exports = {
  periodOptionsFromArgs, 
  historicalWindowFromArgs, 
  filterCandlesByWindow, 
  cryptoLimitForWindow, 
  loadUsableSources, 
  candlesToSources, 
  recordBackfillSummary, 
  loadHistoricalSources, 
  loadPredictionMarketHistory, 
  dateFilterOptionsFromArgs, 
  rejectDegradedResearchInput, 
  backtestDataQualityError, 
  symbolsFromArgs,
  filterFeatureFrameBySymbols,
  resolveStrategyBacktestDefaults,
  periodOptionsFromStrategy,
  normalizeIndicatorFlags,
  buildOptimizationGrid,
  backtestSummaryPayload,
  renderBacktestSummary,
  commandIndicators, 
  commandModelCompare,
  commandBacktest,
  commandOptimize,
  commandEdgeDecay,
  commandDemo
};



