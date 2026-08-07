const {
  DEFAULT_MODEL_REPORT,
  DEFAULT_BACKTEST,
} = require('../../../../shared/lib/runtime/paths');
const { calculateRollingFeatureFrame } = require('../../../../shared/lib/market/indicators');
const { compareModels } = require('../../../../shared/lib/ml/models');
const { parseScorecardOptions } = require('../../../cli/commands/research/scorecard');
const { buildCachedCombinedResearch } = require('../../../cli/commands/research/combined');
const { buildRecordedAppleShadow, RECORDED_AAPL_FIXTURE_ID } = require('../../../../shared/lib/analysis/services/equity_3m_shadow');
const { buildAllRecordedShadowCatalog, ALL_RECORDED_FIXTURE_ID, filterShadowCatalog } = require('../../../../shared/lib/analysis/services/shadow_catalog');

const {
  withCache,
  withScorecardCache,
  runScorecardWorker,
} = require('./cli_executor_cache');
const {
  stringOrFallback,
  readJsonFile,
  parseLimit,
  finiteNumber,
  clamp,
  loadHistoryRecords,
} = require('./cli_executor_market');

const DEFAULT_BACKTEST_REPORT = DEFAULT_BACKTEST;

const SIGNAL_REPORT_MAX_AGE_MS = (() => {
  const configured = Number.parseInt(process.env.SOVEREIGN_SIGNAL_REPORT_MAX_AGE_MS || '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 24 * 60 * 60 * 1000;
})();

function directionFromReturn(value) {
  const number = finiteNumber(value, 0);
  if (number > 0) {
    return 'long';
  }
  if (number < 0) {
    return 'short';
  }
  return 'neutral';
}

function confidenceFromCandidate(candidate = {}) {
  const hitRate = finiteNumber(candidate.hit_rate, 0.5);
  const expectancy = Math.abs(finiteNumber(candidate.expectancy, 0));
  const sharpeLike = Math.abs(finiteNumber(candidate.sharpe_like, 0));
  const returnStrength = Math.abs(finiteNumber(candidate.total_return, 0));
  const raw = (hitRate * 0.6) + (Math.min(expectancy * 12, 0.18)) + (Math.min(sharpeLike, 0.18)) + (Math.min(returnStrength, 0.14));
  return Number(clamp(raw, 0, 0.99).toFixed(4));
}

function selectedCandidate(entry = {}) {
  const candidates = Array.isArray(entry.candidates) ? entry.candidates : [];
  if (!candidates.length) {
    return null;
  }
  return candidates.find((candidate) => candidate.model === entry.winner) || candidates[0];
}

function backtestSummary(backtest = null) {
  if (!backtest) {
    return {
      available: false,
      reason: 'latest_backtest_report_missing',
    };
  }
  const metrics = backtest.metrics || backtest.out_of_sample || {};
  return {
    available: true,
    source_mode: backtest.source_mode || null,
    generated_at: backtest.generated_at || null,
    strategy: backtest.strategy || null,
    model: backtest.model || null,
    timeframe: backtest.timeframe || null,
    threshold: finiteNumber(backtest.threshold),
    horizon: finiteNumber(backtest.horizon),
    period: backtest.period || null,
    metrics: {
      trades: finiteNumber(metrics.trades, 0),
      net_return: finiteNumber(metrics.net_return, 0),
      max_drawdown: finiteNumber(metrics.max_drawdown, 0),
      sharpe_ratio: finiteNumber(metrics.sharpe_ratio),
      hit_rate: finiteNumber(metrics.hit_rate, 0),
      expectancy: finiteNumber(metrics.expectancy, 0),
      expected_value: finiteNumber(metrics.expected_value, 0),
    },
  };
}

function resolveSignalRequest(query, runtime) {
  const now = runtime.now ?? Date.now();
  const reportMaxAgeMs = runtime.reportMaxAgeMs || SIGNAL_REPORT_MAX_AGE_MS;
  const modelPath = stringOrFallback(query.model_report, DEFAULT_MODEL_REPORT);
  const backtestPath = stringOrFallback(query.backtest_report, DEFAULT_BACKTEST_REPORT);
  const thresholdReport = readJsonFile(modelPath);
  const threshold = finiteNumber(query.threshold, null)
    ?? finiteNumber(thresholdReport?.threshold, 0.55);
  const runtimeCacheSuffix = runtime.now === undefined ? '' : `:${now}:${reportMaxAgeMs}`;
  const cacheKey = `signal:${modelPath}:${backtestPath}:${threshold}:${query.input || 'latest'}${runtimeCacheSuffix}`;
  return { now, reportMaxAgeMs, modelPath, backtestPath, threshold, cacheKey };
}

function regenerateSignalModelReport(query, request, modelReport) {
  if (!query.input || !modelReport
      || (Array.isArray(modelReport.per_symbol_winners) && modelReport.per_symbol_winners.length > 0)) {
    return modelReport;
  }

  const records = loadHistoryRecords(stringOrFallback(query.input, ''));
  if (records.length === 0) return modelReport;
  const featureFrame = calculateRollingFeatureFrame(records, 2);
  const featureCounts = new Map();
  for (const feature of featureFrame.features || []) {
    featureCounts.set(feature.key, (featureCounts.get(feature.key) || 0) + 1);
  }
  const maxFeatureRows = Math.max(0, ...featureCounts.values());
  const requestHorizon = Math.max(
    1,
    Math.min(finiteNumber(modelReport.horizon, 5), maxFeatureRows - 1),
  );
  return {
    ...modelReport,
    source_mode: 'request_input',
    input: query.input,
    data_quality_ok: true,
    generated_at: new Date(request.now).toISOString(),
    ...compareModels(featureFrame, {
      horizon: requestHorizon,
      threshold: request.threshold,
    }),
  };
}

function signalReportFreshness(modelReport, request) {
  const generatedMs = Date.parse(modelReport?.generated_at || '');
  const ageMs = Number.isFinite(generatedMs) ? Math.max(0, request.now - generatedMs) : null;
  return {
    fresh: Number.isFinite(ageMs) && ageMs <= request.reportMaxAgeMs,
    ageMs,
    validUntil: Number.isFinite(generatedMs)
      ? new Date(generatedMs + request.reportMaxAgeMs).toISOString()
      : null,
  };
}

function signalReason(fresh, decisionReady, qualityApproved, active) {
  if (!fresh) return 'source_report_expired';
  if (!decisionReady) return 'model_not_decision_ready';
  if (!qualityApproved) return 'data_quality_not_approved';
  return active ? 'candidate_above_threshold_not_promoted' : 'candidate_for_review_not_promoted';
}

function projectSignalCandidate(entry, index, reports, request, freshness) {
  const candidate = selectedCandidate(entry);
  if (!candidate) return null;
  const expectedValue = finiteNumber(candidate.expectancy, 0);
  const totalReturn = finiteNumber(candidate.total_return, 0);
  const confidence = confidenceFromCandidate(candidate);
  const decisionReady = candidate.trained === true && candidate.decision_ready === true;
  const qualityApproved = reports.model?.data_quality_ok === true
    && reports.backtest?.data_quality_ok === true;
  const active = freshness.fresh && decisionReady && qualityApproved
    && confidence >= request.threshold && expectedValue > 0;

  return {
    signal_id: `${String(candidate.symbol || entry.symbol || 'asset').toLowerCase()}-${String(candidate.model || 'model').toLowerCase()}-${index}`,
    symbol: String(candidate.symbol || entry.symbol || '').toUpperCase(),
    model: candidate.model || entry.winner || null,
    family: candidate.family || null,
    implementation_status: candidate.status || null,
    trained: candidate.trained === true,
    decision_ready: decisionReady,
    direction: directionFromReturn(expectedValue || totalReturn),
    confidence,
    threshold: request.threshold,
    active,
    expired: !freshness.fresh,
    promoted: false,
    expected_value: expectedValue,
    hit_rate: finiteNumber(candidate.hit_rate, 0),
    trades: finiteNumber(candidate.trades, 0),
    total_return: totalReturn,
    sharpe_like: finiteNumber(candidate.sharpe_like, 0),
    source: 'model_comparison',
    as_of: reports.model?.generated_at || reports.backtest?.generated_at || null,
    valid_until: freshness.validUntil,
    reason: signalReason(freshness.fresh, decisionReady, qualityApproved, active),
  };
}

function projectSignalCandidates(perSymbol, reports, request, freshness) {
  return perSymbol
    .map((entry, index) => projectSignalCandidate(entry, index, reports, request, freshness))
    .filter(Boolean)
    .sort((left, right) => (
      right.confidence - left.confidence || left.symbol.localeCompare(right.symbol)
    ));
}

function buildSignalStatusResponse(reports, perSymbol, signals, request, freshness) {
  return {
    ok: Boolean(reports.model && perSymbol.length),
    type: 'signal_status',
    schema_version: 2,
    source: 'model_comparison',
    generated_at: reports.model?.generated_at || null,
    source_mode: reports.model?.source_mode || null,
    threshold: request.threshold,
    active_signals: signals.filter((signal) => signal.active).length,
    candidate_signals: signals.length,
    promoted_signals: signals.filter((signal) => signal.promoted).length,
    source_report: {
      fresh: freshness.fresh,
      age_ms: freshness.ageMs,
      max_age_ms: request.reportMaxAgeMs,
      valid_until: freshness.validUntil,
    },
    signals,
    model: {
      available: Boolean(reports.model),
      winner: reports.model?.winner || null,
      candidate_count: Math.max(finiteNumber(reports.model?.candidate_count, 0), signals.length),
      feature_count: finiteNumber(reports.model?.feature_count, 0),
      families: Array.isArray(reports.model?.families) ? reports.model.families : [],
      data_quality_ok: reports.model?.data_quality_ok === true,
      trained_candidate_count: finiteNumber(reports.model?.trained_candidate_count, 0),
      decision_ready: reports.model?.decision_ready === true,
      decision_warning: reports.model?.decision_warning || null,
    },
    backtest: backtestSummary(reports.backtest),
    quality: {
      data_quality_ok: reports.model?.data_quality_ok === true
        && reports.backtest?.data_quality_ok === true,
      model_report_available: Boolean(reports.model),
      backtest_report_available: Boolean(reports.backtest),
      report_fresh: freshness.fresh,
      decision_ready_candidates: signals.filter((signal) => signal.decision_ready).length,
      promotion_required: true,
    },
  };
}

function signalStatus(query = {}, runtime = {}) {
  const request = resolveSignalRequest(query, runtime);
  return withCache(request.cacheKey, () => {
    const reports = {
      model: regenerateSignalModelReport(query, request, readJsonFile(request.modelPath)),
      backtest: readJsonFile(request.backtestPath),
    };
    const freshness = signalReportFreshness(reports.model, request);
    const perSymbol = Array.isArray(reports.model?.per_symbol_winners)
      ? reports.model.per_symbol_winners
      : [];
    const signals = projectSignalCandidates(perSymbol, reports, request, freshness);
    return buildSignalStatusResponse(reports, perSymbol, signals, request, freshness);
  });
}

async function backendScorecard(query = {}) {
  if (String(query.schema || '') === '3') {
    if (String(query.fixture || '') === RECORDED_AAPL_FIXTURE_ID) return buildRecordedAppleShadow();
    if (String(query.fixture || '') === ALL_RECORDED_FIXTURE_ID) return filterShadowCatalog(buildAllRecordedShadowCatalog(), { family: String(query.family || ''), symbol: String(query.symbol || ''), state: String(query.state || '') });
    return { ok: false, type: 'analysis_shadow', schema_version: 3, error_code: 'invalid_fixture', error: `schema 3 shadow requires fixture=${RECORDED_AAPL_FIXTURE_ID} or ${ALL_RECORDED_FIXTURE_ID}` };
  }
  const family = stringOrFallback(query.family, '').toLowerCase();
  const direction = stringOrFallback(query.direction, '').toLowerCase();
  const timeframes = stringOrFallback(query.tf, '1h,4h,1d').toLowerCase();
  if (direction && !['long', 'short', 'neutral'].includes(direction)) {
    return { ok: false, type: 'scorecard', error_code: 'invalid_direction', error: 'direction must be long, short, or neutral' };
  }
  const timeframeOptions = parseScorecardOptions(['--tf', timeframes]);
  const requestedTimeframes = timeframes.split(',').map((value) => value.trim()).filter(Boolean);
  if (!timeframeOptions.ok || timeframeOptions.tfConfigs.length !== requestedTimeframes.length) {
    return { ok: false, type: 'scorecard', error_code: 'invalid_timeframe', error: `invalid scorecard timeframe list: ${timeframes}` };
  }
  const minConfidence = clamp(finiteNumber(query.min_conf, 0.3), 0, 1);
  const top = clamp(parseLimit(query.top) || 50, 1, 100);
  const args = [
    ...(family ? ['--family', family] : []),
    ...(direction ? ['--direction', direction] : []),
    '--tf', timeframes,
    '--min-conf', String(minConfidence),
    '--top', String(top),
  ];
  const cacheKey = JSON.stringify({ family, direction, timeframes, minConfidence, top });
  return withScorecardCache(cacheKey, () => runScorecardWorker(args));
}

async function backendCombinedResearch(query = {}) {
  return buildCachedCombinedResearch({
    assetId: stringOrFallback(query.asset_id, ''),
    decisionAt: stringOrFallback(query.decision_at, new Date().toISOString()),
    timeframes: stringOrFallback(query.tf, '1h,4h,1d'),
  });
}

module.exports = {
  DEFAULT_BACKTEST_REPORT,
  SIGNAL_REPORT_MAX_AGE_MS,
  directionFromReturn,
  confidenceFromCandidate,
  selectedCandidate,
  backtestSummary,
  resolveSignalRequest,
  regenerateSignalModelReport,
  signalReportFreshness,
  signalReason,
  projectSignalCandidate,
  projectSignalCandidates,
  buildSignalStatusResponse,
  signalStatus,
  backendScorecard,
  backendCombinedResearch,
};
