const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../data_ops/ingest_market_data');
const { DEFAULT_PROVIDER_PRIORITY } = require('../../lib/quote_router');
const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../../lib/backtest');
const { calculateFeatureFrame, calculateRollingFeatureFrame, DEFAULT_PERIODS, generateSampleBars } = require('../../lib/indicators');
const { compareModels } = require('../../lib/models');
const { mergeSnapshots, readSnapshot, validateSnapshot, writeJson } = require('../../lib/market_validation');
const { runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, isRichTerminal } = require('../../tui_cli');

const utils = require('../lib/utils.js');
const { usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption } = utils;
const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;

const { backendAvailability, runBackendStatus } = require('./backend.js');



function summarizeModelCard(report) {
  const winner = report && report.winner ? report.winner : null;
  const top = winner || (report && Array.isArray(report.models) && report.models[0]) || null;
  return {
    source: DEFAULT_MODEL_REPORT,
    last_checked: report && report.generated_at ? report.generated_at : null,
    state: top ? labelState(true, Boolean((top.oos_expected_value != null && top.oos_expected_value < 0) || (top.expected_value != null && top.expected_value < 0))) : 'warn',
    title: top ? top.name || top.model || 'model_candidate' : 'no_model_report',
    subtitle: top ? top.description || `trades=${top.trades || 0}` : 'model comparison cache missing',
    metrics: top ? {
      expected_value: top.expected_value ?? top.oos_expected_value ?? null,
      net_return: top.net_return ?? null,
      oos_expected_value: top.oos_expected_value ?? null,
      sharpe_like: top.sharpe_like ?? null,
    } : {},
    payload: report,
  };
}

function summarizeBacktestCard(report) {
  return {
    source: DEFAULT_BACKTEST,
    last_checked: report && report.generated_at ? report.generated_at : null,
    state: report ? labelState(true, Boolean(report.metrics && report.metrics.expected_value < 0)) : 'warn',
    title: report ? `${report.model || 'model'} / ${report.timeframe || 'all'}` : 'no_backtest_report',
    subtitle: report ? `trades=${report.metrics ? report.metrics.trades : 0}` : 'backtest cache missing',
    metrics: report ? {
      net_return: report.metrics ? report.metrics.net_return : null,
      max_drawdown: report.metrics ? report.metrics.max_drawdown : null,
      win_rate: report.metrics ? report.metrics.win_rate : null,
      expected_value: report.metrics ? report.metrics.expected_value : null,
      oos_expected_value: report.oos_expected_value ?? null,
    } : {},
    payload: report,
  };
}

function summarizeStatusCard(snapshot, quality) {
  const report = quality || {};
  const ok = Boolean(report.ok);
  const state = ok ? 'ok' : 'warn';
  const freshness = report.freshness || {};
  return {
    source: DEFAULT_SNAPSHOT,
    last_checked: snapshot && snapshot.fetched_at ? snapshot.fetched_at : null,
    state,
    title: snapshot && snapshot.mode ? snapshot.mode : 'unknown',
    subtitle: ok ? 'data cache healthy' : 'data cache needs attention',
    metrics: {
      usable_records: report.usable_records ?? 0,
      rejected_records: report.rejected_records ?? 0,
      stale_records: freshness.stale_records ?? 0,
      provider_errors: (report.provider_errors || []).length || 0,
    },
    payload: { snapshot, report },
  };
}

function summarizeFeaturesCard(features) {
  const featureFrame = features || {};
  const count = featureFrame.feature_count ?? (Array.isArray(featureFrame.features) ? featureFrame.features.length : 0);
  return {
    source: DEFAULT_FEATURES,
    last_checked: featureFrame.generated_at || null,
    state: count > 0 ? 'ok' : 'warn',
    title: `${count} feature rows`,
    subtitle: featureFrame.timeframe ? `timeframe=${featureFrame.timeframe}` : 'feature cache',
    metrics: {
      feature_count: count,
      symbols: Array.isArray(featureFrame.symbols) ? featureFrame.symbols.length : null,
    },
    payload: featureFrame,
  };
}

function summarizePortfolioCard(portfolio) {
  const equity = portfolio && Number.isFinite(Number(portfolio.equity)) ? Number(portfolio.equity) : null;
  const exposure = portfolio && Number.isFinite(Number(portfolio.exposure)) ? Number(portfolio.exposure) : null;
  return {
    source: path.join(REPO_ROOT, 'data', 'portfolio.json'),
    last_checked: portfolio && portfolio.generated_at ? portfolio.generated_at : null,
    state: equity != null ? 'ok' : 'warn',
    title: equity != null ? `equity ${equity}` : 'portfolio unavailable',
    subtitle: exposure != null ? `exposure=${exposure}` : 'no portfolio metrics',
    metrics: {
      equity,
      exposure,
      drawdown: portfolio ? portfolio.drawdown ?? null : null,
      readiness: portfolio ? portfolio.readiness ?? null : null,
    },
    payload: portfolio,
  };
}

function buildCockpitModel() {
  const snapshot = safeReadJson(DEFAULT_SNAPSHOT);
  const quality = safeReadJson(DEFAULT_QUALITY_REPORT);
  const features = safeReadJson(DEFAULT_FEATURES);
  const modelReport = safeReadJson(DEFAULT_MODEL_REPORT);
  const backtestReport = safeReadJson(DEFAULT_BACKTEST);
  const portfolio = safeReadJson(path.join(REPO_ROOT, 'data', 'portfolio.json'));
  const statusCard = summarizeStatusCard(snapshot, quality);
  const modelCard = summarizeModelCard(modelReport);
  const backtestCard = summarizeBacktestCard(backtestReport);
  const featuresCard = summarizeFeaturesCard(features);
  const portfolioCard = summarizePortfolioCard(portfolio);
  const cards = [
    statusCard,
    featuresCard,
    modelCard,
    backtestCard,
    portfolioCard,
  ];
  return {
    generated_at: new Date().toISOString(),
    time: new Date().toLocaleTimeString(),
    title: 'Sovereign CLI Cockpit',
    status: {
      backend: backendAvailability().available ? 'available' : 'unavailable',
      cache: statusCard.state,
      quote_provider: (quality && quality.provider_errors && quality.provider_errors.length > 0) ? 'warn' : 'ok',
    },
    cards,
  };
}

async function quoteProviderHeaderState() {
  try {
    const config = await loadConfig();
    const imported = await loadExternalQuoteInputs(config);
    const report = validateSnapshot({
      mode: 'live',
      fetched_at: new Date().toISOString(),
      sources: imported.records,
      errors: imported.errors,
    }, { rejectStale: true }).report;
    return imported.errors.length === 0 && report.ok ? 'ok' : 'warn';
  } catch {
    return 'warn';
  }
}

function renderCockpit(model) {
  const lines = [];
  const header = `\x1b[1;36m${model.title}\x1b[0m \x1b[90m| ${model.time}\x1b[0m`;
  lines.push(header);
  lines.push('\x1b[90m' + '═'.repeat(80) + '\x1b[0m');
  
  const statusColor = (s) => s === 'ok' || s === 'available' ? '\x1b[32m' : (s === 'warn' ? '\x1b[33m' : '\x1b[31m');
  const backendStatus = `${statusColor(model.status.backend)}${model.status.backend}\x1b[0m`;
  const cacheStatus = `${statusColor(model.status.cache)}${model.status.cache}\x1b[0m`;
  const quoteStatus = `${statusColor(model.status.quote_provider)}${model.status.quote_provider}\x1b[0m`;

  lines.push(`  \x1b[1mSystem:\x1b[0m backend=${backendStatus}  cache=${cacheStatus}  quotes=${quoteStatus}`);
  lines.push('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');

  for (const card of model.cards) {
    const cardColor = statusColor(card.state);
    lines.push(`  ${cardColor}■\x1b[0m \x1b[1m${card.title.toUpperCase()}\x1b[0m \x1b[90m(${card.subtitle})\x1b[0m`);
    
    const metrics = Object.entries(card.metrics || {}).filter(([, value]) => value != null);
    if (metrics.length) {
      const metricLine = metrics.map(([key, value]) => `\x1b[90m${key}=\x1b[0m\x1b[37m${String(renderHumanValue(value)).trim()}\x1b[0m`).join('  ');
      lines.push(`    ${metricLine}`);
    }
    lines.push('');
  }
  
  lines.push('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
  lines.push('  \x1b[1mCommands:\x1b[0m status | backend status | quotes status | models | bt | \x1b[36mtrade balance\x1b[0m');
  lines.push('  \x1b[90mTip: use --inspect <status|features|model|backtest|portfolio> for raw JSON.\x1b[0m');
  return lines.join('\n');
}

function cockpitInspectPayload(name) {
  const model = buildCockpitModel();
  const lookup = {
    status: model.cards[0],
    features: model.cards[1],
    model: model.cards[2],
    backtest: model.cards[3],
    portfolio: model.cards[4],
  };
  return lookup[name] || null;
}

function commandStatus(args) {
  const snapshot = readSnapshot(DEFAULT_SNAPSHOT);
  const { report } = validateSnapshot(snapshot);
  const backend = runBackendStatus(args);
  writeJson(DEFAULT_QUALITY_REPORT, report);
  printPayload({
    phase: currentPhaseLabel(),
    backend: backend.available ? 'available' : 'unavailable',
    backend_ok: Boolean(backend.ok),
    cache_mode: snapshot.mode || 'unknown',
    fetched_at: snapshot.fetched_at || 'unknown',
    records: report.total_records,
    usable_records: report.usable_records,
    rejected_records: report.rejected_records,
    stale_records: report.freshness.stale_records,
    provider_errors: report.provider_errors.length,
    quality: report.ok ? 'ok' : 'needs attention',
    next: 'run demo for sample indicators, model comparison, and backtest',
  }, args);
  return 0;
}

async function commandCockpit(args) {
  const snapshot = readSnapshot(DEFAULT_SNAPSHOT);
  const model = buildCockpitModel(snapshot, args);
  if (hasFlag(args, '--json')) {
    printPayload(model, args);
    return 0;
  }
  pageText(renderCockpit(model), args);
  return 0;
}

module.exports = {
  summarizeModelCard, summarizeBacktestCard, summarizeStatusCard, summarizeFeaturesCard, summarizePortfolioCard, buildCockpitModel, quoteProviderHeaderState, renderCockpit, cockpitInspectPayload, commandStatus, commandCockpit
};
