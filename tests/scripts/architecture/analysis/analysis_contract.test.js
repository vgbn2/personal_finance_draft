'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../../../../shared/contracts/analysis');
const fixtures = require('../../../fixtures/analysis/synthetic_fixtures');

function codes(value) { return value.errors.map((item) => item.code); }

test('synthetic fixtures validate across all supported families', () => {
  assert.equal(fixtures.syntheticFixture.fixture_status, 'synthetic');
  const accepted = fixtures.assetDescriptors.filter((item) => contract.validateAssetDescriptor(item).ok);
  assert.equal(accepted.length, fixtures.assetDescriptors.length);
  assert.equal(contract.validateObservation(fixtures.observation).ok, true);
  assert.equal(contract.validateScorecardRow(fixtures.equityScorecardRow).ok, true);
  assert.deepEqual(contract.getFamilySections('equity', 'common_stock'), ['technical', 'fundamental', 'macro', 'catalyst', 'data_quality']);
  assert.ok(contract.getFamilySections('commodity', 'energy').includes('supply_demand'));
  assert.ok(contract.getFamilySections('index', 'index').includes('breadth'));
  console.log(`analysis fixtures: input=${fixtures.assetDescriptors.length} accepted=${accepted.length} rejected=${fixtures.assetDescriptors.length - accepted.length}`);
  console.log(`analysis component domains: ${contract.DOMAINS.join(',')}`);
});

test('scorecard invariants reject duplicate domains and missing exclusion reasons', () => {
  const duplicate = { ...fixtures.equityScorecardRow, factor_results: [...fixtures.factorResults, fixtures.factorResults[0]] };
  const duplicateResult = contract.validateScorecardRow(duplicate);
  assert.equal(duplicateResult.ok, false);
  assert.ok(codes(duplicateResult).includes('duplicate_domain'));

  const excluded = { ...fixtures.equityScorecardRow, decision_state: 'excluded', exclusion_reasons: [] };
  const excludedResult = contract.validateScorecardRow(excluded);
  assert.equal(excludedResult.ok, false);
  assert.ok(codes(excludedResult).includes('missing_exclusion_reason'));

  const mismatchedPolicy = {
    ...fixtures.equityScorecardRow,
    scoring_policy: { ...fixtures.equityScorecardRow.scoring_policy, family: 'cryptoasset', horizon: '1m' },
  };
  const mismatchResult = contract.validateScorecardRow(mismatchedPolicy);
  assert.ok(codes(mismatchResult).includes('policy_family_mismatch'));
  assert.ok(codes(mismatchResult).includes('policy_horizon_mismatch'));

  const inapplicable = {
    ...fixtures.equityScorecardRow,
    factor_results: [
      ...fixtures.factorResults,
      { ...fixtures.factorResults[0], domain: 'onchain' },
    ],
  };
  assert.ok(codes(contract.validateScorecardRow(inapplicable)).includes('inapplicable_domain'));
  console.log('analysis invariants: duplicate_domain=reject missing_reason=reject policy_mismatch=reject inapplicable_domain=reject');
});

test('timestamps and numeric ranges are validated structurally', () => {
  const badObservation = { ...fixtures.observation, available_at: '2026-07-30', released_at: '2026-08-01T00:00:00Z' };
  const observationResult = contract.validateObservation(badObservation);
  assert.equal(observationResult.ok, false);
  assert.ok(codes(observationResult).includes('invalid_timestamp'));
  const releaseOrderResult = contract.validateObservation({ ...fixtures.observation, available_at: '2026-07-30T00:00:00Z', released_at: '2026-08-01T00:00:00Z' });
  assert.ok(codes(releaseOrderResult).includes('before_release'));

  const missingProvenance = { ...fixtures.observation, provider: '', quality: 'claimed' };
  const provenanceResult = contract.validateObservation(missingProvenance);
  assert.ok(codes(provenanceResult).includes('required_string'));
  assert.ok(codes(provenanceResult).includes('invalid_enum'));

  const badFactor = { ...fixtures.factorResults[0], score: 2, coverage: -0.1, valid_until: '2026-01-01T00:00:00Z' };
  const factorResult = contract.validateFactorResult(badFactor);
  assert.equal(factorResult.ok, false);
  assert.ok(codes(factorResult).includes('invalid_range'));
  assert.ok(codes(factorResult).includes('before_data_as_of'));
  const negativeComposite = contract.validateScorecardRow({ ...fixtures.equityScorecardRow, composite_strength: -0.1 });
  assert.ok(codes(negativeComposite).includes('invalid_range'));
  console.log('analysis invariants: invalid_timestamp=reject invalid_range=reject provenance=required');
});

test('unlabeled synthetic fixtures are rejected by the fixture gate', () => {
  assert.equal(contract.validateSyntheticFixture(fixtures.syntheticFixture).ok, true);
  const unlabeled = { ...fixtures.syntheticFixture, fixture_status: undefined };
  const rejected = contract.validateSyntheticFixture(unlabeled);
  assert.equal(rejected.ok, false);
  assert.ok(codes(rejected).includes('unlabeled_synthetic'));
  console.log('analysis invariants: unlabeled_synthetic_fixture=reject');
});

test('registry is weight-free and policy identity is versioned', () => {
  const serialized = JSON.stringify(contract.FAMILY_SECTION_REGISTRY);
  assert.equal(serialized.includes('weight'), false);
  assert.equal(fixtures.equityScorecardRow.scoring_policy.version, '3m-v1-shadow');
  assert.equal(fixtures.equityScorecardRow.scoring_policy.family, 'equity');
  assert.equal(fixtures.equityScorecardRow.scoring_policy.horizon, '3m');
  assert.equal(fixtures.equityScorecardRow.asset_descriptor.asset_id, 'equity:US:ACME');
  assert.equal(fixtures.equityScorecardRow.asset_descriptor.symbol, 'ACME');
  console.log('analysis invariants: no_weights=true asset_identity=asset_id policy_version=true');
});
