'use strict';

const SWEEP_SCHEMA_VERSION = 2;
const CAPABILITY_POLICY_VERSION = 'native-research-capabilities-v1';
const DATASET_CATALOG_VERSION = 'research-dataset-catalog-v1';

const INTERNAL_SWEEP_EVALUATORS = Object.freeze([
  Object.freeze({
    evaluator_id: 'proxy_momentum_trend_v1',
    native_archetype: 'MomentumTrend',
    label: 'Momentum trend proxy',
    capability: 'native_single_asset_proxy',
  }),
  Object.freeze({
    evaluator_id: 'proxy_mean_reversion_v1',
    native_archetype: 'MeanReversion',
    label: 'Mean reversion proxy',
    capability: 'native_single_asset_proxy',
  }),
  Object.freeze({
    evaluator_id: 'proxy_breakout_volatility_v1',
    native_archetype: 'BreakoutVolatility',
    label: 'Breakout volatility proxy',
    capability: 'native_single_asset_proxy',
  }),
  Object.freeze({
    evaluator_id: 'proxy_hybrid_regime_v1',
    native_archetype: 'HybridRegime',
    label: 'Hybrid regime proxy',
    capability: 'native_single_asset_proxy',
  }),
]);

function configuredStrategyRejection(strategy = {}) {
  if (strategy.exists === false || strategy.ok === false) {
    return 'invalid_strategy_contract';
  }
  if (strategy.enabled !== true) return 'disabled_strategy';
  if (strategy.lane === 'cross_asset' || strategy.role === 'portfolio_optimization') {
    return 'cross_asset_requires_portfolio_engine';
  }
  if (strategy.kind === 'ml' || strategy.family === 'ml') {
    return 'model_runtime_required';
  }
  if (strategy.model) return 'configured_model_not_executed_by_native_proxy';
  return 'no_faithful_native_evaluator';
}

function classifyConfiguredStrategy(strategy = {}) {
  const reason = configuredStrategyRejection(strategy);
  return {
    strategy_id: strategy.name || strategy.path || 'unknown_strategy',
    path: strategy.path || null,
    enabled: strategy.enabled === true,
    capability: 'unsupported',
    reason,
    requested_model: strategy.model || null,
    lane: strategy.lane || null,
    role: strategy.role || null,
    kind: strategy.kind || null,
    universe: Array.isArray(strategy.universe) ? [...strategy.universe] : [],
  };
}

function buildStrategyCapabilityRegistry(strategies = []) {
  const configured = strategies
    .map(classifyConfiguredStrategy)
    .sort((left, right) => left.strategy_id.localeCompare(right.strategy_id));
  return {
    policy_version: CAPABILITY_POLICY_VERSION,
    research_only: true,
    promotion_eligible: false,
    internal_evaluators: INTERNAL_SWEEP_EVALUATORS.map((row) => ({ ...row })),
    configured_strategies: configured,
    counts: {
      internal_supported: INTERNAL_SWEEP_EVALUATORS.length,
      configured_total: configured.length,
      configured_supported: 0,
      configured_rejected: configured.length,
    },
  };
}

function normalizeRequestedEvaluators(value) {
  if (value == null || value === '' || value === 'proxy') {
    return INTERNAL_SWEEP_EVALUATORS.map((row) => row.evaluator_id);
  }
  const requested = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(requested)].sort();
}

function selectInternalEvaluators(requested) {
  const ids = normalizeRequestedEvaluators(requested);
  const byId = new Map(INTERNAL_SWEEP_EVALUATORS.map((row) => [row.evaluator_id, row]));
  const selected = [];
  const rejected = [];
  for (const evaluatorId of ids) {
    const evaluator = byId.get(evaluatorId);
    if (evaluator) selected.push({ ...evaluator });
    else rejected.push({ evaluator_id: evaluatorId, reason: 'unknown_or_unsupported_evaluator' });
  }
  return { selected, rejected };
}

function buildResearchRunSpec({ datasets, evaluators, options = {}, generatedAt = null }) {
  const spec = {
    schema_version: SWEEP_SCHEMA_VERSION,
    type: 'research_sweep_run_spec',
    research_only: true,
    promotion_eligible: false,
    capability_policy_version: CAPABILITY_POLICY_VERSION,
    dataset_catalog_version: DATASET_CATALOG_VERSION,
    generated_at: generatedAt,
    evaluators: (evaluators || []).map((row) => ({
      evaluator_id: row.evaluator_id,
      native_archetype: row.native_archetype,
    })),
    datasets: (datasets || []).map((row) => ({
      dataset_id: row.dataset_id,
      instrument_id: row.instrument_id,
      family: row.family,
      symbol: row.symbol,
      timeframe: row.timeframe,
      fingerprint: row.fingerprint,
    })),
    options: { ...options },
  };
  const errors = validateResearchRunSpec(spec);
  if (errors.length > 0) {
    const error = new Error(`invalid_research_run_spec:${errors.join(',')}`);
    error.code = 'invalid_research_run_spec';
    error.details = errors;
    throw error;
  }
  return spec;
}

function validateResearchRunSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['spec_must_be_object'];
  if (spec.schema_version !== SWEEP_SCHEMA_VERSION) errors.push('unsupported_schema_version');
  if (spec.research_only !== true) errors.push('research_only_required');
  if (spec.promotion_eligible !== false) errors.push('promotion_must_be_disabled');
  if (!Array.isArray(spec.evaluators) || spec.evaluators.length === 0) errors.push('evaluators_required');
  if (!Array.isArray(spec.datasets) || spec.datasets.length === 0) errors.push('datasets_required');
  if (Array.isArray(spec.evaluators)) {
    const evaluatorIds = spec.evaluators.map((row) => row?.evaluator_id);
    if (evaluatorIds.some((value) => typeof value !== 'string' || value.length === 0)) {
      errors.push('invalid_evaluator_id');
    }
    if (new Set(evaluatorIds).size !== evaluatorIds.length) errors.push('duplicate_evaluator_id');
  }
  if (Array.isArray(spec.datasets)) {
    const datasetIds = spec.datasets.map((row) => row?.dataset_id);
    if (datasetIds.some((value) => typeof value !== 'string' || value.length === 0)) {
      errors.push('invalid_dataset_id');
    }
    if (new Set(datasetIds).size !== datasetIds.length) errors.push('duplicate_dataset_id');
  }
  return errors;
}

module.exports = {
  CAPABILITY_POLICY_VERSION,
  DATASET_CATALOG_VERSION,
  INTERNAL_SWEEP_EVALUATORS,
  SWEEP_SCHEMA_VERSION,
  buildResearchRunSpec,
  buildStrategyCapabilityRegistry,
  classifyConfiguredStrategy,
  configuredStrategyRejection,
  normalizeRequestedEvaluators,
  selectInternalEvaluators,
  validateResearchRunSpec,
};
