'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { compareModels, modelCandidates } = require('../../../shared/lib/ml/models');

test('handcrafted scoring candidates are explicitly research-only', () => {
  assert.ok(modelCandidates.length > 0);
  for (const candidate of modelCandidates) {
    assert.equal(candidate.status, 'handcrafted_heuristic');
    assert.equal(candidate.trained, false);
    assert.equal(candidate.decision_ready, false);
    assert.equal(candidate.decision_scope, 'research_baseline_only');
    assert.match(candidate.description, /not a trained model/i);
  }

  const report = compareModels({ features: [] });
  assert.equal(report.trained_candidate_count, 0);
  assert.equal(report.decision_ready, false);
  assert.match(report.decision_warning, /research-only/i);
});
