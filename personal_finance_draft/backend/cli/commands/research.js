const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../scripts/data_ops/ingest_market_data');

const { DEFAULT_PROVIDER_PRIORITY } = require('../../../shared/lib/quote_router');

const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../../../shared/lib/backtest');

const { calculateFeatureFrame, calculateRollingFeatureFrame,
        DEFAULT_PERIODS, generateSampleBars } = require('../../../shared/lib/indicators');

const { compareModels } = require('../../../shared/lib/models');

const { mergeSnapshots, readSnapshot, 
        validateSnapshot, writeJson } = require('../../../shared/lib/market_validation');

const { runInteractiveMenu, handleIntersection, promptSelect, 
        promptText, promptConfirm, isRichTerminal } = require('../tui');

const { loadResearchConfig } = require('../lib/research_config');

const utils = require('../lib/utils.js');

const { usage,helpText, pageText, optionValue, 
        hasFlag, printPayload, currentPhaseLabel, 
        formatHumanNumber, formatHumanPayload, renderHumanValue, 
        safeReadJson, labelState, numericOption } = utils;

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

function loadUsableSources(args) {
  const timeframe = optionValue(args, '--timeframe', '1d');
  const defaults = researchConfig.historical_defaults || {};
  const sampleSize = Math.max(30, Math.floor(numericOption(args, '--sample-size', defaults.sample_size || 120)));
  if (hasFlag(args, '--sample')) {
    return {
      snapshot: {
        mode: 'sample',
        fetched_at: new Date().toISOString(),
        sources: generateSampleBars('SPY', sampleSize, timeframe).concat(generateSampleBars('BTCUSDT', sampleSize, timeframe)),
        errors: [],
      },
      quality: null,
    };
  }

  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const snapshot = readSnapshot(input);
  const { report, usableSources } = validateSnapshot(snapshot);
  return { snapshot: { ...snapshot, sources: usableSources }, quality: report };
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
  const timeframe = optionValue(args, '--timeframe', '1d');
  const targetSymbol = optionValue(args, '--symbol', null); // [gemini-work] Detect --symbol flag
  const window = historicalWindowFromArgs(args);
  const config = await loadConfig();
  const sources = [];
  const backfillWindows = [];
  const chosenTimeframe = ['5m', '15m', '30m', '1h', '4h', '1d'].includes(timeframe) ? timeframe : '1d';
  
  // [gemini-work] Filter symbols based on targetSymbol if provided
  const filterSymbols = (symbols) => {
    if (!targetSymbol) return (symbols || []).slice(0, 2);
    return (symbols || []).filter(s => s === targetSymbol);
  };

  const symbolsByFamily = {
    equities: filterSymbols(config.equities.symbols),
    indices: filterSymbols(config.indices.symbols),
    commodities: filterSymbols(config.commodities.symbols),
    crypto: filterSymbols(config.crypto.symbols),
  };
  //dev review alot of if elses
  for (const symbol of symbolsByFamily.equities) {
    const providers = (config.equities.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 2) {
      const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'equities', providers);
      recordBackfillSummary(backfillWindows, candles, 'equities', providers[0], symbol, chosenTimeframe);
      sources.push(...candlesToSources(candles, 'equities', providers[0], symbol, chosenTimeframe));
    } else {
      let resolved = false;
      for (const provider of providers) {
        try {
          if (provider === 'stooq') {
            if (chosenTimeframe !== '1d') continue;
            const mapped = resolveStooqSymbol('equities', symbol);
            if (!mapped) continue;
            const candles = filterCandlesByWindow(await fetchStooqDailyHistory(mapped), window);
            sources.push(...candlesToSources(candles, 'equities', provider, symbol, '1d'));
            resolved = true;
            break;
          }
          if (provider === 'yahoo') {
            const mapped = resolveEquityOrIndexSymbol('equities', symbol, provider) || symbol;
            let candles;
            if (chosenTimeframe !== '1d' && window.days > 5) {
              candles = await fetchPaginated(mapped, chosenTimeframe, window.days, 'equities', fetchYahooBaseCandles);
            } else {
              candles = await fetchYahooBaseCandles(mapped, chosenTimeframe, window.days);
            }
            recordBackfillSummary(backfillWindows, candles, 'equities', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'equities', provider, symbol, chosenTimeframe));
            resolved = true;
            break;
          }
        } catch { continue; }
      }
    }
  }

  for (const symbol of symbolsByFamily.indices) {
    const providers = (config.indices.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 2) {
       const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'equities', providers);
       recordBackfillSummary(backfillWindows, candles, 'indices', providers[0], symbol, chosenTimeframe);
       sources.push(...candlesToSources(candles, 'indices', providers[0], symbol, chosenTimeframe));
    } else {
      let resolved = false;
      for (const provider of providers) {
        try {
          if (provider === 'stooq') {
            if (chosenTimeframe !== '1d') continue;
            const mapped = resolveStooqSymbol('indices', symbol);
            if (!mapped) continue;
            const candles = filterCandlesByWindow(await fetchStooqDailyHistory(mapped), window);
            sources.push(...candlesToSources(candles, 'indices', provider, symbol, '1d'));
            resolved = true;
            break;
          }
          if (provider === 'yahoo') {
            const mapped = resolveEquityOrIndexSymbol('indices', symbol, provider) || symbol;
            let candles;
            if (chosenTimeframe !== '1d' && window.days > 5) {
              candles = await fetchPaginated(mapped, chosenTimeframe, window.days, 'equities', fetchYahooBaseCandles);
            } else {
              candles = await fetchYahooBaseCandles(mapped, chosenTimeframe, window.days);
            }
            recordBackfillSummary(backfillWindows, candles, 'indices', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'indices', provider, symbol, chosenTimeframe));
            resolved = true;
            break;
          }
          if (provider === 'fred') {
            const seriesId = resolveFredSeries('indices', symbol);
            if (!seriesId) continue;
            sources.push({
              ...(await fetchFredLatest(seriesId)),
              family: 'indices',
              symbol,
            });
            resolved = true;
            break;
          }
        } catch { continue; }
      }
    }
  }

  for (const symbol of symbolsByFamily.commodities) {
    const providers = (config.commodities.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 2) {
       const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'equities', providers);
       recordBackfillSummary(backfillWindows, candles, 'commodities', providers[0], symbol, chosenTimeframe);
       sources.push(...candlesToSources(candles, 'commodities', providers[0], symbol, chosenTimeframe));
    } else {
      let resolved = false;
      for (const provider of providers) {
        try {
          if (provider === 'stooq') {
            if (chosenTimeframe !== '1d') continue;
            const mapped = resolveStooqSymbol('commodities', symbol);
            if (!mapped) continue;
            const candles = filterCandlesByWindow(await fetchStooqDailyHistory(mapped), window);
            sources.push(...candlesToSources(candles, 'commodities', provider, symbol, '1d'));
            resolved = true;
            break;
          }
          if (provider === 'yahoo') {
            const mapped = resolveCommoditySymbol(provider, symbol) || symbol;
            let candles;
            if (chosenTimeframe !== '1d' && window.days > 5) {
              candles = await fetchPaginated(mapped, chosenTimeframe, window.days, 'equities', fetchYahooBaseCandles);
            } else {
              candles = await fetchYahooBaseCandles(mapped, chosenTimeframe, window.days);
            }
            recordBackfillSummary(backfillWindows, candles, 'commodities', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'commodities', provider, symbol, chosenTimeframe));
            resolved = true;
            break;
          }
        } catch { continue; }
      }
    }
  }

  for (const symbol of symbolsByFamily.crypto) {
    const providers = (config.crypto.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 1) {
      const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'crypto', providers);
      recordBackfillSummary(backfillWindows, candles, 'crypto', providers[0], symbol, chosenTimeframe);
      sources.push(...candlesToSources(candles, 'crypto', providers[0], symbol, chosenTimeframe));
    } else {
      for (const provider of providers.slice(0, 2)) {
        let candles = null;
        try {
          if (provider === 'binance') {
            if (window.days > 3 || (chosenTimeframe !== '1d' && window.days > 1)) {
               candles = await fetchPaginated(symbol, chosenTimeframe, window.days, 'crypto', fetchBinanceBaseCandles);
            } else {
               candles = await fetchBinanceBaseCandles(symbol, cryptoLimitForWindow(chosenTimeframe, window.days, provider), chosenTimeframe);
            }
          } else if (provider === 'coinbase') {
            candles = await fetchCoinbaseBaseCandles(symbol, cryptoLimitForWindow(chosenTimeframe, window.days, provider), chosenTimeframe);
          }
          if (candles && candles.length > 0) {
            recordBackfillSummary(backfillWindows, candles, 'crypto', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'crypto', provider, symbol, chosenTimeframe));
          }
        } catch { continue; }
      }
    }
  }

  return {
    snapshot: {
      mode: 'provider_history',
      fetched_at: new Date().toISOString(),
      sources,
      errors: [],
      backfill_windows: backfillWindows,
    },
    quality: null,
  };
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
  const error = `${label} input failed data-quality validation. ${message.replace(/^Backtest input failed data-quality validation\.\s*/, '')}`;
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ error }, null, 2));
  } else {
    console.error(error);
  }
  return true;
}

function backtestDataQualityError(quality, args) {
  if (!quality || quality.ok || hasFlag(args, '--allow-degraded')) return null;
  return [
    'Backtest input failed data-quality validation.',
    `errors=${quality.counts.error}`,
    `provider_errors=${quality.provider_errors.length}`,
    `stale_records=${quality.freshness.stale_records}`,
    'Run `check --strict`, refresh with `ingest`/`backfill`, or pass `--sample` for deterministic validation.',
  ].join(' ');
}

function commandIndicators(args) {
  const output = optionValue(args, '--output', DEFAULT_FEATURES);
  const { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (rejectDegradedResearchInput(quality, args, 'Feature generation')) return 1;
  const periods = periodOptionsFromArgs(args);
  const features = hasFlag(args, '--sample')
    ? calculateRollingFeatureFrame(snapshot.sources, 2, periods)
    : calculateFeatureFrame(snapshot.sources, periods);
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

async function commandBacktest(args) {
  const defaults = researchConfig.backtest_defaults || {};
  const output = optionValue(args, '--output', DEFAULT_BACKTEST);
  const model = optionValue(args, '--model', defaults.model || 'cnn_window_v0');
  const timeframe = optionValue(args, '--timeframe', null);
  const from = optionValue(args, '--from', null);
  const to = optionValue(args, '--to', null);
  const horizon = numericOption(args, '--horizon', defaults.horizon || 5);
  const threshold = numericOption(args, '--threshold', defaults.threshold || 0.55);
  const costBps = numericOption(args, '--cost-bps', defaults.cost_bps || 5);
  const feeBps = numericOption(args, '--fee-bps', defaults.fee_bps || costBps / 2);
  const slippageBps = numericOption(args, '--slippage-bps', defaults.slippage_bps || costBps / 2);
  const trainRatio = numericOption(args, '--train-ratio', defaults.train_ratio || 0.7);
  const tailAlpha = numericOption(args, '--tail-alpha', defaults.tail_alpha || 0.05);
  const monteCarloRuns = numericOption(args, '--monte-carlo-runs', defaults.monte_carlo_runs || 1000);
  let { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  const initialQualityError = backtestDataQualityError(quality, args);
  if (initialQualityError) {
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: initialQualityError }, null, 2));
    } else {
      console.error(initialQualityError);
    }
    return 1;
  }
  let featureFrame = calculateRollingFeatureFrame(snapshot.sources, 2, periodOptionsFromArgs(args));
  if (!hasFlag(args, '--sample') && featureFrame.feature_count === 0) {
    try {
      const historical = await loadHistoricalSources(args);
      snapshot = historical.snapshot;
      quality = historical.quality;
      featureFrame = calculateRollingFeatureFrame(snapshot.sources, 2, periodOptionsFromArgs(args));
    } catch (error) {
      const message = `Unable to fetch provider history: ${error.message}. Use --sample for deterministic validation or refresh the live cache with network access.`;
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(message);
      }
      return 1;
    }
  }
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
  const backtestOptions = {
    strategy: 'cnn_momentum',
    model,
    horizon,
    threshold,
    costBps,
    feeBps,
    slippageBps,
    tailAlpha,
    monteCarloRuns,
  };
  const inSample = runBacktest(split.train, backtestOptions);
  const outOfSample = runBacktest(split.test, backtestOptions);
  const report = {
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_report: quality ? DEFAULT_QUALITY_REPORT : null,
    train_ratio: trainRatio,
    in_sample: inSample.metrics,
    out_of_sample: outOfSample.metrics,
    ...runBacktest(featureFrame, { ...backtestOptions, timeframe, from, to }),
  };
  writeJson(output, report);
  const tailRisk = report.metrics.tail_risk || {};
  const monteCarlo = report.metrics.monte_carlo || {};
  if (!global.suppressLogs) {
    printPayload({
      strategy: report.strategy,
      model: report.model,
      timeframe: report.timeframe,
      period: report.period,
      trade_logs: report.trades.length,
      trades: report.metrics.trades,
      fee_bps: report.fee_bps,
      slippage_bps: report.slippage_bps,
      net_return: report.metrics.net_return,
      max_drawdown: report.metrics.max_drawdown,
      sharpe_ratio: report.metrics.sharpe_ratio,
      sortino_ratio: report.metrics.sortino_ratio,
      win_rate: report.metrics.win_rate,
      expected_value: report.metrics.expected_value,
      tail_var_95: tailRisk.value_at_risk,
      tail_es_95: tailRisk.expected_shortfall,
      mc_p05_return: monteCarlo.p05_final_return,
      mc_loss_prob: monteCarlo.probability_of_loss,
      oos_trades: outOfSample.metrics.trades,
      oos_expected_value: outOfSample.metrics.expected_value,
      oos_net_return: outOfSample.metrics.net_return,
      output,
    }, args);
  }
  return report;
}

async function commandOptimize(args) {
  const output = optionValue(args, '--output', path.join(REPO_ROOT, 'data', 'models', 'latest_indicator_optimization.json'));
  let { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (rejectDegradedResearchInput(quality, args, 'Optimization')) return 1;
  const defaults = researchConfig.backtest_defaults || {};
  const gridConfig = researchConfig.optimization_grid || {};
  const timeframe = optionValue(args, '--timeframe', null);
  const from = optionValue(args, '--from', null);
  const to = optionValue(args, '--to', null);
  const horizon = numericOption(args, '--horizon', defaults.horizon || 5);
  const threshold = numericOption(args, '--threshold', defaults.threshold || 0.55);
  const costBps = numericOption(args, '--cost-bps', defaults.cost_bps || 5);
  const feeBps = numericOption(args, '--fee-bps', defaults.fee_bps || costBps / 2);
  const slippageBps = numericOption(args, '--slippage-bps', defaults.slippage_bps || costBps / 2);
  const tailAlpha = numericOption(args, '--tail-alpha', defaults.tail_alpha || 0.05);
  const monteCarloRuns = numericOption(args, '--monte-carlo-runs', defaults.monte_carlo_runs || 1000);
  const trainRatio = numericOption(args, '--train-ratio', defaults.train_ratio || 0.7);
  
  const rsiGrid = gridConfig.rsi || [7, 14, 21];
  const atrGrid = gridConfig.atr || [7, 14, 21];
  const bollingerGrid = gridConfig.bollinger || [10, 20, 30];
  const volatilityGrid = gridConfig.volatility || [10, 20, 60];
  
  const grid = [];
  for (const rsi of rsiGrid) {
    for (const atr of atrGrid) {
      for (const bollinger of bollingerGrid) {
        for (const volatility of volatilityGrid) {
          grid.push({ rsi, atr, bollinger, volatility, returnFast: 1, returnSlow: 5 });
        }
      }
    }
  }

  let runs = grid.map((periods) => {
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
    };
    const trainBacktest = runBacktest(split.train, backtestOptions);
    const testBacktest = runBacktest(split.test, backtestOptions);
    const overfit_warning = (testBacktest.metrics.sharpe_ratio < (trainBacktest.metrics.sharpe_ratio * 0.5)) || (testBacktest.metrics.expected_value < 0); // [gemini-work] Detect OOS overfitting

    return {
      periods,
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
  if (!hasFlag(args, '--sample') && runs.length > 0 && runs[0].feature_count === 0) {
    try {
      const historical = await loadHistoricalSources(args);
      snapshot = historical.snapshot;
      quality = historical.quality;
      runs = grid.map((periods) => {
        const frame = calculateRollingFeatureFrame(snapshot.sources, 2, periods);
        const filtered = filterFeatureFrame(frame, { timeframe, from, to });
        const split = splitFeatureFrame(filtered, trainRatio);
        const backtestOptions = {
          strategy: 'cnn_momentum',
          model: 'cnn_window_v0',
          horizon,
          threshold,
          costBps,
          feeBps,
          slippageBps,
          tailAlpha,
          monteCarloRuns,
        };
        const trainBacktest = runBacktest(split.train, backtestOptions);
        const testBacktest = runBacktest(split.test, backtestOptions);
        const overfit_warning = (testBacktest.metrics.sharpe_ratio < (trainBacktest.metrics.sharpe_ratio * 0.5)) || (testBacktest.metrics.expected_value < 0);

        return {
          periods,
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
          score: trainBacktest.metrics.net_return - trainBacktest.metrics.max_drawdown + (trainBacktest.metrics.expected_value * 10) - (overfit_warning ? 100 : 0),
        };
      }).sort((a, b) => b.score - a.score || b.net_return - a.net_return);
    } catch (error) {
      const message = `Unable to fetch provider history: ${error.message}. Use --sample for deterministic validation or refresh the live cache with network access.`;
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(message);
      }
      return 1;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    timeframe: timeframe || 'all',
    period: { from, to },
    train_ratio: trainRatio,
    tested: runs.length,
    winner: runs[0] || null,
    top: runs.slice(0, 10),
  };
  writeJson(output, report);
  printPayload({
    tested: report.tested,
    winner: report.winner ? report.winner.periods : 'none',
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

async function commandDemo(args) {
  const demoArgs = ['--sample', ...args.filter((arg) => arg !== '--sample')];
  commandIndicators(demoArgs);
  commandModelCompare(demoArgs);
  await commandBacktest(demoArgs);
  await commandOptimize(demoArgs);
  return 0;
}

module.exports = {
  periodOptionsFromArgs, historicalWindowFromArgs, filterCandlesByWindow, cryptoLimitForWindow, loadUsableSources, candlesToSources, recordBackfillSummary, loadHistoricalSources, loadPredictionMarketHistory, dateFilterOptionsFromArgs, rejectDegradedResearchInput, backtestDataQualityError, commandIndicators, commandModelCompare, commandBacktest, commandOptimize, commandDemo
};
