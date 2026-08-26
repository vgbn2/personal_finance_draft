const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const { withProviderLogFilter, candlesToSources, recordBackfillSummary, loadUsableSources, validatedSnapshot, loadSampleSources, loadHistoricalSources, loadPredictionMarketHistory } = require('./research_sources.js');
const { formatPercent, formatDecimal, formatBacktestLine, formatPanelLine, formatCompactPercent, ANSI_STRIP_RE, visibleLength, padVisibleRight, clipVisible, splitLines, shortTimestamp, shortDate, sampleSeries, drawBar, renderReturnTape, renderStressShape, renderSideBySide, renderVerdictBlock, renderFramedBlock, annualizedReturn, timeSpanYears, compactBenchmark, compactBenchmarks, buildTrustAssessment, backtestSummaryPayload, renderBacktestSummary } = require('./research_render.js');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../../scripts/data_ops/ingest_market_data.js');

const { DEFAULT_PROVIDER_PRIORITY } = require('../../../../shared/lib/market/quote_router.js');
const { guardEquitySessionBars } = require('../../../../shared/lib/market/equity_session.js');
const { upsertStrategyGradeRecord, inferStrategyTaxonomy, normalizeStrategyPath } = require('../../../../shared/lib/strategy/registry.js');

const { filterFeatureFrame, runBacktest, splitFeatureFrame, rollingWalkForward } = require('../../../../shared/lib/strategy/backtest.js');

const { calculateFeatureFrame, calculateRollingFeatureFrame,
        DEFAULT_PERIODS } = require('../../../../shared/lib/market/indicators.js');

const { compareModels } = require('../../../../shared/lib/ml/models.js');

const { mergeSnapshots, readSnapshot,
        validateSnapshot, writeJson } = require('../../../../shared/lib/market/validation.js');

const { runInteractiveMenu, handleIntersection, promptSelect,
        promptText, promptConfirm, isRichTerminal } = require('../../tui/index.js');
const { createProgress } = require('../../tui/progress.js');
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

const {
  buildOptimizationGrid: rawBuildOptimizationGrid,
  renderOptimize,
  commandOptimize: rawCommandOptimize,
  commandEdgeDecay: rawCommandEdgeDecay,
  commandSweep: rawCommandSweep,
} = require('./research_optimization.js');

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
  return rawBuildOptimizationGrid(strategyMeta, args, periodOptionsFromStrategy, normalizeIndicatorFlags);
}

function commandOptimize(args) {
  return rawCommandOptimize(args, {
    periodOptionsFromStrategy,
    normalizeIndicatorFlags,
    inferSnapshotFamily,
    backtestDataQualityError,
    resolveStrategyPathInput,
  });
}

function commandEdgeDecay(args) {
  return rawCommandEdgeDecay(args, {
    resolveStrategyBacktestDefaults,
    resolveStrategyPathInput,
    inferSnapshotFamily,
    symbolsFromArgs,
    periodOptionsFromStrategy,
    filterFeatureFrameBySymbols,
  });
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
  const positionSizePct = numericOption(args, '--position-size-pct', strategyMeta?.risk?.position_size_pct || defaults.position_size_pct || 1.0);
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
  const bridge = require('../../../../shared/lib/runtime/backend_bridge');
  const isSubDailyTimeframe = timeframe && timeframe !== '1d';
  const useDirectCppNative = !sampleMode && bridge.backendAvailable() && selectedSymbols.length > 0 && !isSubDailyTimeframe;

  const signalOnly = hasFlag(args, '--signal-only') || hasFlag(args, '--fast-signal');

  let featureFrame;
  if (!useDirectCppNative) {
    await withLoadingAnimation('Computing indicators', async () => {
      let sources = snapshot.sources;
      if (signalOnly && Array.isArray(sources) && sources.length > 200) {
        // In signal-only mode, only recent bars (up to 200 per symbol) are needed to calculate indicators and derive the latest entry signal.
        const bySym = new Map();
        for (const s of sources) {
          const sym = s.symbol || s.key;
          if (!bySym.has(sym)) bySym.set(sym, []);
          bySym.get(sym).push(s);
        }
        sources = [];
        for (const list of bySym.values()) {
          list.sort((a, b) => (Date.parse(a.timestamp || 0) || 0) - (Date.parse(b.timestamp || 0) || 0));
          sources.push(...list.slice(-200));
        }
      }
      featureFrame = filterFeatureFrameBySymbols(calculateRollingFeatureFrame(sources, 2, periodOptionsFromArgs(args)), selectedSymbols);
    }, args);
  } else {
    featureFrame = { features: selectedSymbols.map(s => ({ symbol: s, timeframe: timeframe || '1d' })) };
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
  let dataRange = featureFrameDateRange(filteredFrame);
  let oosRange = featureFrameDateRange(split.test);

  if (useDirectCppNative && (!dataRange.start || !dataRange.end)) {
    const allDates = (snapshot.sources || []).map((s) => s.timestamp).filter(Boolean).sort();
    if (allDates.length > 0) {
      dataRange = { start: allDates[0], end: allDates[allDates.length - 1] };
      const splitIdx = Math.floor(allDates.length * trainRatio);
      oosRange = { start: allDates[splitIdx] || allDates[0], end: allDates[allDates.length - 1] };
    }
  }

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
    positionSizePct,
    propFirm: selectedPropFirmRef,
    propFirmProfile: selectedPropFirm,
    engine: sampleMode ? 'js' : (strategyMeta?.engine || 'auto'),
  };
  const sampleWindowNote = backtestModeNote(sampleMode, quality);
  let inSample;
  let outOfSample;
  let fullBacktest;
  let wfResult;

  // Precompute ONNX predictions if an ONNX model candidate or alias was selected
  const resolvedModelObj = resolveModel(model);
  const isOnnxCandidate = resolvedModelObj && (resolvedModelObj.family === 'onnx' || resolvedModelObj.status === 'onnx_model');
  if (isOnnxCandidate && featureFrame && Array.isArray(featureFrame.features)) {
    try {
      const { precomputeForFeatures } = require('../../../../shared/lib/ml/onnx_runner.js');
      await precomputeForFeatures(resolvedModelObj.name, featureFrame.features);
    } catch (e) {
      console.warn(`[research] ONNX precompute skipped: ${e.message}`);
    }
  }

  await withLoadingAnimation('Running backtest', async () => {
    if (signalOnly) {
      // In signal-only mode, only compute the single full backtest pass to find current entry signals.
      // Skip Walk-Forward validation (3 folds), Monte Carlo stress simulations (200 runs), and train/test splitting.
      fullBacktest = runBacktest(featureFrame, { ...backtestOptions, timeframe, from, to, walkForwardFolds: 0, monteCarloRuns: 0 });
      inSample = { metrics: fullBacktest.metrics };
      outOfSample = { metrics: fullBacktest.metrics };
      wfResult = null;
    } else {
      if (useDirectCppNative) {
        inSample = runBacktest(featureFrame, { ...backtestOptions, to: oosRange.start, monteCarloRuns: 0 });
        outOfSample = runBacktest(featureFrame, { ...backtestOptions, from: oosRange.start, monteCarloRuns: 0 });
      } else {
        inSample = runBacktest(split.train, { ...backtestOptions, monteCarloRuns: 0 });
        outOfSample = runBacktest(split.test, { ...backtestOptions, monteCarloRuns: 0 });
      }
      fullBacktest = runBacktest(featureFrame, { ...backtestOptions, timeframe, from, to, walkForwardFolds: sampleMode ? 0 : 3 });
      if (!sampleMode) {
        if (fullBacktest && fullBacktest.walk_forward && fullBacktest.walk_forward.ok) {
          wfResult = fullBacktest.walk_forward;
        } else {
          wfResult = rollingWalkForward(filteredFrame, runBacktest, {
            folds: 3,
            backtestOptions,
          });
        }
      }
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
  commandSweep: rawCommandSweep,
  commandDemo,
  commandMassBt: require('./research_mass_bt.js').commandMassBt,
  inferSnapshotFamily,
  filterFeatureFrameBySymbols,
  periodOptionsFromArgs,
};
