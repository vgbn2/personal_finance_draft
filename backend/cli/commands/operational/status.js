const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../../scripts/data_ops/ingest_market_data');
const { DEFAULT_PROVIDER_PRIORITY } = require('../../../../shared/lib/market/quote_router');
const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../../../../shared/lib/strategy/backtest');
const { calculateFeatureFrame, calculateRollingFeatureFrame, DEFAULT_PERIODS, generateSampleBars } = require('../../../../shared/lib/market/indicators');
const { compareModels } = require('../../../../shared/lib/ml/models');
const { mergeSnapshots, readSnapshot, validateSnapshot, writeJson } = require('../../../../shared/lib/market/validation');
const { runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, isRichTerminal } = require('../../tui');
const A = require('../../../../shared/lib/ui/ansi');

const utils = require('../../lib/utils.js');
const { usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption } = utils;
const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;

const { backendAvailability, runBackendStatus } = require('../tools/backend.js');



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
  let backtestState = 'warn';
  if (report) {
    const negativeEv = Boolean(report.metrics && report.metrics.expected_value < 0);
    const isTrusted = report.trust_assessment?.grade <= 'C' && report.trust_assessment?.verdict !== 'do-not-trust-yet';
    const isSample = report.sample_mode === true;
    backtestState = (!isTrusted || isSample) ? 'warn' : labelState(true, negativeEv);
  }
  return {
    source: DEFAULT_BACKTEST,
    last_checked: report && report.generated_at ? report.generated_at : null,
    state: backtestState,
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

function latestSeriesKey(record = {}) {
  return [
    record.family || 'unknown',
    record.symbol || record.underlying || record.series || record.location || record.region || record.country || record.chain || record.metric || 'unknown',
    record.timeframe || record.component || record.metric || record.option_type || 'point',
  ].join(':');
}

function buildRecoveredSnapshotFromHistory(historySnapshot) {
  const sourceSnapshot = historySnapshot && Array.isArray(historySnapshot.sources) ? historySnapshot : { sources: [], errors: [] };
  const latestBySeries = new Map();

  for (const record of sourceSnapshot.sources) {
    if (!record || !record.timestamp) continue;
    const key = latestSeriesKey(record);
    const current = latestBySeries.get(key);
    if (!current || String(record.timestamp) > String(current.timestamp)) {
      latestBySeries.set(key, record);
    }
  }

  return {
    mode: 'recovered_live',
    fetched_at: new Date().toISOString(),
    recovered_from: 'partitioned_history',
    sources: Array.from(latestBySeries.values()),
    errors: [],
    provider_checks: [],
    snapshot_scope: {
      kind: 'global',
      representative_of_global_live_health: true,
      target_family: null,
      target_symbol: null,
      requested_days: null,
      recovery_source: 'partitioned_history',
    },
  };
}

function detectScopedSnapshot(snapshot, report) {
  const sourceSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const scope = sourceSnapshot.snapshot_scope && typeof sourceSnapshot.snapshot_scope === 'object'
    ? sourceSnapshot.snapshot_scope
    : null;
  if (scope && scope.kind === 'scoped') {
    return {
      active: true,
      kind: 'scoped',
      target_family: scope.target_family || null,
      target_symbol: scope.target_symbol || null,
      requested_days: scope.requested_days || null,
      representative_of_global_live_health: false,
      reason: 'snapshot_scope_metadata',
    };
  }

  const macroStoreTargetFamily = sourceSnapshot.macro_store && sourceSnapshot.macro_store.target_family
    ? String(sourceSnapshot.macro_store.target_family)
    : null;
  const providerChecks = Array.isArray(sourceSnapshot.provider_checks) ? sourceSnapshot.provider_checks : [];
  const targetFamilyFilter = providerChecks.find((check) => check && check.reason === 'target_family_filter' && check.target_family);
  const families = new Set((Array.isArray(sourceSnapshot.sources) ? sourceSnapshot.sources : []).map((row) => row && row.family).filter(Boolean));
  const historicalPolicy = String(sourceSnapshot.quality_filter && sourceSnapshot.quality_filter.policy || '').includes('preserve_historical_records');

  if (macroStoreTargetFamily || targetFamilyFilter || (historicalPolicy && families.size === 1 && report && report.total_records > 0)) {
    return {
      active: true,
      kind: 'scoped',
      target_family: macroStoreTargetFamily || (targetFamilyFilter ? targetFamilyFilter.target_family : (families.size === 1 ? [...families][0] : null)),
      target_symbol: null,
      requested_days: null,
      representative_of_global_live_health: false,
      reason: macroStoreTargetFamily || targetFamilyFilter ? 'target_family_filter' : 'single_family_historical_snapshot',
    };
  }

  return {
    active: false,
    kind: 'global',
    target_family: null,
    target_symbol: null,
    requested_days: null,
    representative_of_global_live_health: true,
    reason: null,
  };
}

function loadStatusSnapshot() {
  const snapshot = readSnapshot(DEFAULT_SNAPSHOT);
  const validation = validateSnapshot(snapshot);
  const scoped = detectScopedSnapshot(snapshot, validation.report);
  const missing = !snapshot;

  // A present, global (non-scoped) snapshot is authoritative -- use it as-is.
  // A MISSING snapshot (fresh checkout / no fetch yet) or a SCOPED/targeted snapshot
  // both fall through to history recovery so status and the cockpit present a
  // representative global view instead of crashing on null or showing 'unknown'.
  if (!missing && !scoped.active) {
    return {
      snapshot,
      report: validation.report,
      recovered: false,
      previous_scope: scoped,
    };
  }

  // When the primary snapshot is absent, carry a non-null empty snapshot through the
  // fallback returns so downstream consumers never dereference null.
  const baseSnapshot = snapshot || { mode: 'no_snapshot', fetched_at: null, sources: [], errors: [] };

  const historySnapshot = readSnapshot(DEFAULT_HISTORY);
  if (!historySnapshot || !Array.isArray(historySnapshot.sources) || historySnapshot.sources.length === 0) {
    return {
      snapshot: baseSnapshot,
      report: validation.report,
      recovered: false,
      previous_scope: scoped,
    };
  }

  const recoveredSnapshot = buildRecoveredSnapshotFromHistory(historySnapshot);
  const recoveredValidation = validateSnapshot(recoveredSnapshot);
  if (recoveredValidation.report.usable_records <= validation.report.usable_records) {
    return {
      snapshot: baseSnapshot,
      report: validation.report,
      recovered: false,
      previous_scope: scoped,
    };
  }

  const persistedSnapshot = {
    ...recoveredSnapshot,
    sources: recoveredValidation.usableSources,
    recovery: {
      source: 'partitioned_history',
      previous_scope: scoped,
      previous_records: validation.report.total_records,
      previous_usable_records: validation.report.usable_records,
      recovered_records: recoveredValidation.report.total_records,
      recovered_usable_records: recoveredValidation.report.usable_records,
    },
  };
  writeJson(DEFAULT_SNAPSHOT, persistedSnapshot);

  return {
    snapshot: persistedSnapshot,
    report: {
      ...recoveredValidation.report,
      total_records: persistedSnapshot.sources.length,
      usable_records: persistedSnapshot.sources.length,
      rejected_records: 0,
    },
    recovered: true,
    previous_scope: scoped,
  };
}

function buildStatusPayload(snapshot, report, backend) {
  const scoped = detectScopedSnapshot(snapshot, report);
  const freshnessScope = scoped.active ? 'last_fetch_snapshot_scoped' : 'last_fetch_snapshot';
  const quality = scoped.active ? 'scoped snapshot only' : (report.ok ? 'ok' : 'needs attention');
  const qualityBasis = scoped.active
    ? 'latest snapshot is scoped to a targeted or historical ingest and is not representative of global live health; run `backend integrity --json` for configured cache coverage'
    : 'most recent fetch snapshot; run `backend integrity --json` for configured symbol/timeframe cache coverage';

  return {
    phase: currentPhaseLabel(),
    backend: backend.available ? 'available' : 'unavailable',
    backend_ok: Boolean(backend.ok),
    cache_mode: (snapshot && snapshot.mode) || 'unknown',
    fetched_at: (snapshot && snapshot.fetched_at) || 'unknown',
    records: report.total_records,
    usable_records: report.usable_records,
    rejected_records: report.rejected_records,
    stale_records: report.freshness.stale_records,
    freshness_scope: freshnessScope,
    integrity_scope: 'configured_ts_cache',
    freshness: {
      scope: freshnessScope,
      reject_stale: report.reject_stale,
      stale_records: report.freshness.stale_records,
      issues: report.freshness.issues,
    },
    snapshot_scope: scoped,
    provider_errors: report.provider_errors.length,
    quality,
    quality_basis: qualityBasis,
    recovery: snapshot && snapshot.recovery ? snapshot.recovery : null,
    next: 'run demo for sample indicators, model comparison, and backtest',
  };
}

function buildCockpitModel(opts = {}) {
  // Use the recovering loader (not a raw file read) so a fresh checkout with no
  // last_fetch.json still presents a representative recovered_live snapshot.
  const snapshot = loadStatusSnapshot().snapshot;
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
      quote_provider: opts.quoteState !== undefined
        ? opts.quoteState
        : ((quality && (!quality.ok || (quality.provider_errors && quality.provider_errors.length > 0) || (quality.freshness && quality.freshness.stale_records > 0))) ? 'warn' : 'ok'),
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
  // Rich-gated rule character: ═ when Unicode is available, = otherwise.
  const dline = A.richGlyph('dline', isRichTerminal);
  // Rich-gated status indicator: ■ when Unicode is available, * otherwise.
  const indicator = A.richGlyph('indicator', isRichTerminal);

  const lines = [];
  lines.push(`${A.c(A.SEMANTIC.HEADER, model.title)} ${A.muted('| ' + model.time)}`);
  lines.push(A.muted(dline.repeat(80)));

  const backendStatus = A.c(A.statusColor(model.status.backend), model.status.backend);
  const cacheStatus   = A.c(A.statusColor(model.status.cache),   model.status.cache);
  const quoteStatus   = A.c(A.statusColor(model.status.quote_provider), model.status.quote_provider);

  lines.push(`  ${A.c(A.BOLD, 'System:')} backend=${backendStatus}  cache=${cacheStatus}  quotes=${quoteStatus}`);
  lines.push(A.muted(A.GLYPH.hline.repeat(80)));

  for (const card of model.cards) {
    const dot = A.c(A.statusColor(card.state), indicator);
    lines.push(`  ${dot} ${A.c(A.BOLD, card.title.toUpperCase())} ${A.muted('(' + card.subtitle + ')')}`);

    const metrics = Object.entries(card.metrics || {}).filter(([, value]) => value != null);
    if (metrics.length) {
      const metricLine = metrics
        .map(([key, value]) => `${A.muted(key + '=')}${A.c(A.WHITE, String(renderHumanValue(value)).trim())}`)
        .join('  ');
      lines.push(`    ${metricLine}`);
    }
    lines.push('');
  }

  lines.push(A.muted(A.GLYPH.hline.repeat(80)));
  lines.push(`  ${A.c(A.BOLD, 'Commands:')} status | backend status | quotes status | models | bt | ${A.c(A.CYAN, 'trade balance')}`);
  lines.push(A.muted('  Tip: use --inspect <status|features|model|backtest|portfolio> for raw JSON.'));
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
  const loaded = loadStatusSnapshot();
  const snapshot = loaded.snapshot;
  const report = loaded.report;
  const backend = runBackendStatus(args);
  writeJson(DEFAULT_QUALITY_REPORT, report);
  printPayload(buildStatusPayload(snapshot, report, backend), args);
  return 0;
}

async function commandCockpit(args) {
  const quoteState = await quoteProviderHeaderState();
  const model = buildCockpitModel({ quoteState });
  if (hasFlag(args, '--json')) {
    printPayload(model, args);
    return 0;
  }
  pageText(renderCockpit(model), args);
  return 0;
}

module.exports = {
  summarizeModelCard,
  summarizeBacktestCard,
  summarizeStatusCard,
  summarizeFeaturesCard,
  summarizePortfolioCard,
  buildCockpitModel,
  quoteProviderHeaderState,
  renderCockpit,
  cockpitInspectPayload,
  detectScopedSnapshot,
  buildRecoveredSnapshotFromHistory,
  loadStatusSnapshot,
  buildStatusPayload,
  commandStatus,
  commandCockpit,
};

