'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INTERNAL_SWEEP_EVALUATORS,
  SWEEP_SCHEMA_VERSION,
  buildResearchRunSpec,
  buildStrategyCapabilityRegistry,
  classifyConfiguredStrategy,
  selectInternalEvaluators,
  validateResearchRunSpec,
} = require('../../../shared/lib/strategy/sweep_contracts.js');

test('configured strategies are rejected instead of impersonated by native proxies', () => {
  const modelStrategy = classifyConfiguredStrategy({
    path: 'config/strategies/trend_following.yaml',
    name: 'trend_following',
    kind: 'ml',
    family: 'ml',
    lane: 'single_asset',
    role: 'strategy',
    enabled: true,
    ok: true,
    exists: true,
    model: 'cnn_v3',
    universe: ['SPY', 'QQQ'],
  });
  assert.equal(modelStrategy.capability, 'unsupported');
  assert.equal(modelStrategy.reason, 'model_runtime_required');

  const crossAsset = classifyConfiguredStrategy({
    name: 'global_equity_rotation',
    kind: 'ml',
    family: 'ml',
    lane: 'cross_asset',
    role: 'portfolio_optimization',
    enabled: true,
    ok: true,
    exists: true,
  });
  assert.equal(crossAsset.reason, 'cross_asset_requires_portfolio_engine');
});

test('capability registry accounts for every configured strategy', () => {
  const registry = buildStrategyCapabilityRegistry([
    { name: 'enabled_model', enabled: true, ok: true, exists: true, kind: 'ml', family: 'ml' },
    { name: 'disabled', enabled: false, ok: true, exists: true },
    { name: 'invalid', enabled: true, ok: false, exists: true },
  ]);
  assert.equal(registry.research_only, true);
  assert.equal(registry.promotion_eligible, false);
  assert.equal(registry.counts.internal_supported, 4);
  assert.equal(registry.counts.configured_total, 3);
  assert.equal(registry.counts.configured_supported, 0);
  assert.equal(registry.counts.configured_rejected, 3);
  assert.equal(registry.configured_strategies.length, 3);
});

test('internal evaluator selection is explicit and rejects unknown names', () => {
  const selection = selectInternalEvaluators('proxy_mean_reversion_v1,unknown,proxy_mean_reversion_v1');
  assert.deepEqual(
    selection.selected.map((row) => row.evaluator_id),
    ['proxy_mean_reversion_v1'],
  );
  assert.deepEqual(selection.rejected, [
    { evaluator_id: 'unknown', reason: 'unknown_or_unsupported_evaluator' },
  ]);
  assert.equal(INTERNAL_SWEEP_EVALUATORS.every((row) => row.evaluator_id.startsWith('proxy_')), true);
});

test('research run spec enforces datasets, evaluators, and non-promotion state', () => {
  const spec = buildResearchRunSpec({
    evaluators: [{ evaluator_id: 'proxy_momentum_trend_v1', native_archetype: 'MomentumTrend' }],
    datasets: [{
      dataset_id: 'crypto:BTCUSDT:1d',
      instrument_id: 'crypto:BTCUSDT',
      family: 'crypto',
      symbol: 'BTCUSDT',
      timeframe: '1d',
      fingerprint: 'a'.repeat(64),
    }],
    options: { max_bars: 500 },
    generatedAt: '2026-08-09T00:00:00.000Z',
  });
  assert.equal(spec.schema_version, SWEEP_SCHEMA_VERSION);
  assert.equal(spec.research_only, true);
  assert.equal(spec.promotion_eligible, false);
  assert.deepEqual(validateResearchRunSpec(spec), []);

  const invalid = { ...spec, promotion_eligible: true, datasets: [] };
  assert.deepEqual(validateResearchRunSpec(invalid), [
    'promotion_must_be_disabled',
    'datasets_required',
  ]);
});
