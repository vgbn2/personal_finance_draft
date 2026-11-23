'use strict';

// Observation-only CT104 wrapper; host timer pipes this into the pinned image.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readTsIndex } = require('/app/shared/lib/market/validation.js');
const discovery = require('/app/shared/lib/strategy/interval_discovery.js');

console.log = (...values) => console.error(...values);

async function main() {
  assert.equal(process.env.LIVE_TRADING, 'false');
  assert.equal(process.env.SOVEREIGN_EXECUTION_AUTHORIZED, 'false');
  const bars = readTsIndex('/app/storage/data/ts', 'SPY', '1d');
  assert.ok(bars.length >= 30);
  assert.ok(bars.every(bar => bar.provider === 'yahoo'));

  const spec = await discovery.generateAiCandidateSpec({
    universe: ['SPY'],
    timeframe: '1d',
  });
  assert.ok(spec?.rules, 'AI rule generation failed; fallback forbidden');
  assert.deepEqual(spec.universe, ['SPY']);
  assert.equal(spec.timeframe, '1d');
  assert.equal(spec.checksum, discovery.computeSpecChecksum(spec));
  const validation = discovery.validateRiskBounds(spec);
  const gates = { min_sharpe: 1.5, max_drawdown: 0.2, min_trades: 200 };
  let evaluation = null;
  let reason = 'risk_bounds_rejected';
  let checks = [];
  if (validation.valid) {
    evaluation = await discovery.evaluateStrategy(spec, { fixtureBars: bars });
    assert.equal(evaluation.engine, 'sovereign_js_rules_v1');
    assert.equal(evaluation.research_only, true);
    checks = [
      { reason: 'sharpe_below_threshold', value: evaluation.sharpe_ratio, threshold: gates.min_sharpe, minimum: true },
      { reason: 'drawdown_above_threshold', value: evaluation.max_drawdown, threshold: gates.max_drawdown, minimum: false },
      { reason: 'trades_below_threshold', value: evaluation.trades, threshold: gates.min_trades, minimum: true },
    ].map(check => ({
      ...check,
      passed: Number.isFinite(check.value) && (check.minimum ? check.value >= check.threshold : check.value <= check.threshold),
    }));
    reason = checks.find(check => !check.passed)?.reason || 'quality_gates_passed';
  }
  process.stdout.write(JSON.stringify({
    timestamp: new Date().toISOString(),
    run_id: crypto.randomUUID(),
    mode: 'scheduled_research_only',
    spec,
    validation,
    input: { provider: 'yahoo', symbol: 'SPY', timeframe: '1d', bars: bars.length },
    gates,
    checks,
    gate_contract: 'mirrored published CLI predicates; stager not invoked',
    evaluation,
    decision: { passed: reason === 'quality_gates_passed', reason },
    dataset_sha256: crypto.createHash('sha256').update(JSON.stringify(bars)).digest('hex'),
    staging_invoked: false,
    promotion: false,
    broker_orders: false,
  }) + '\n');
}

main().catch(error => {
  console.error(error.name + ': ' + error.message);
  process.exitCode = 1;
});
