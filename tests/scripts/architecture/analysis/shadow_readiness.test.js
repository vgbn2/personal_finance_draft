'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAllRecordedShadowCatalog } = require('../../../../shared/lib/analysis/services/shadow_catalog');
const { evaluateShadowReadiness } = require('../../../../shared/lib/analysis/validation/shadow_readiness');

test('shadow readiness reports distributions and refuses unsupported promotion', () => {
  const report = evaluateShadowReadiness(buildAllRecordedShadowCatalog());
  assert.equal(report.ok, true);
  assert.equal(report.promotion_approved, false);
  assert.deepEqual(report.sample, { rows: 7, eligible: 0, degraded: 4, excluded: 3 });
  assert.equal(report.coverage.count, 7);
  assert.ok(report.factor_distributions.technical.count >= 6);
  assert.ok(report.evidence.synthetic_parity > 0);
  assert.equal(report.missing_data_sensitivity.silent_weight_renormalization, false);
  for (const blocker of ['zero_eligible_rows', 'no_point_in_time_target_returns', 'no_out_of_sample_baseline_comparison', 'no_turnover_or_cost_model', 'no_calibration_sample']) assert.ok(report.blockers.includes(blocker));
  assert.deepEqual(report.validation, { baseline_comparison: 'unavailable', out_of_sample: 'unavailable', turnover: 'unavailable', calibration: 'unavailable' });
  console.log(`shadow readiness: rows=${report.sample.rows} eligible=${report.sample.eligible} synthetic=${report.evidence.synthetic_parity} promotion=${report.promotion_approved}`);
});
