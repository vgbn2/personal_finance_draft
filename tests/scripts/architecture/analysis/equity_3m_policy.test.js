'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const artifact = require('../../../../shared/fixtures/analysis/sec_companyfacts_aapl_recorded.json');
const { validateScorecardRow } = require('../../../../shared/contracts/analysis');
const {
  availabilityAfterFiled,
  buildSecFundamentalFactor,
  normalizeSecCompanyFacts,
} = require('../../../../shared/lib/analysis/analyzers/sec_companyfacts');
const { POLICY, composeEquity3mShadow } = require('../../../../shared/lib/analysis/policies/equity_3m_v1');

const AS_OF = artifact.provenance.retrieved_at;
const VALID_UNTIL = '2026-08-30T00:00:00.000Z';
const assetDescriptor = {
  asset_id: 'equity:US:AAPL', symbol: 'AAPL', family: 'equity', subtype: 'common_stock',
  market: 'US', sector: 'technology', quote_currency: 'USD', region: 'US',
  provider_ids: { sec_cik: '0000320193' },
};

function factor(domain, score, quality = 'verified') {
  return {
    domain, score, strength: Math.abs(score) || 0.5, coverage: 1, quality,
    data_as_of: '2026-05-02T00:00:00.000Z', valid_until: VALID_UNTIL,
    evidence_ids: [`recorded:${domain}:AAPL`], drivers: [`recorded ${domain} fixture`],
  };
}

test('recorded SEC Company Facts artifact has provenance and normalizes real Apple facts', () => {
  assert.equal(artifact.provenance.source_url, 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json');
  assert.equal(artifact.provenance.cik, '0000320193');
  assert.equal(artifact.provenance.entity_name, 'Apple Inc.');
  assert.equal(artifact.payload.entityName, 'Apple Inc.');
  assert.ok(Object.keys(artifact.payload.facts['us-gaap']).length >= 500);
  assert.equal(availabilityAfterFiled('2026-05-01'), '2026-05-02T00:00:00.000Z');

  const normalized = normalizeSecCompanyFacts(artifact, { asOf: AS_OF });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.company.cik, '0000320193');
  assert.deepEqual(normalized.missing_metrics, []);
  assert.ok(normalized.observations.length > 1_000);
  assert.equal(new Set(normalized.observations.map((item) => item.metric_id)).size, 8);
  assert.ok(normalized.observations.every((item) => Date.parse(item.available_at) <= Date.parse(AS_OF)));
  assert.ok(normalized.observations.every((item) => item.provider_ref.includes(item.metadata.accession)));
  console.log(`SEC recorded fixture: entity=${normalized.company.entity_name} us-gaap=${Object.keys(artifact.payload.facts['us-gaap']).length} observations=${normalized.observations.length} metrics=${Object.keys(normalized.concepts).length}`);
});

test('SEC restatements are selected as-of and missing required facts fail closed', () => {
  const future = structuredClone(artifact);
  const concept = future.payload.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax;
  concept.units.USD.push({ ...concept.units.USD.at(-1), val: 999999999999, filed: '2099-01-01', accn: 'future-restatement' });
  const normalized = normalizeSecCompanyFacts(future, { asOf: AS_OF });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.observations.some((item) => item.provider_ref.includes('future-restatement')), false);

  const missing = structuredClone(artifact);
  for (const name of ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet']) delete missing.payload.facts['us-gaap'][name];
  const degraded = normalizeSecCompanyFacts(missing, { asOf: AS_OF });
  assert.ok(degraded.missing_metrics.includes('revenue'));
  const rejected = buildSecFundamentalFactor(degraded, { asOf: AS_OF });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'missing_required_fundamentals');
  assert.ok(rejected.error.missing_metrics.includes('revenue'));
  console.log(`SEC degradation: missing=${rejected.error.missing_metrics.join(',')} future_restatement=excluded`);
});

test('recorded observations produce a validated research-only fundamental factor', () => {
  const normalized = normalizeSecCompanyFacts(artifact, { asOf: AS_OF });
  const built = buildSecFundamentalFactor(normalized, { asOf: AS_OF });
  assert.equal(built.ok, true);
  assert.equal(built.factor_result.domain, 'fundamental');
  assert.equal(built.factor_result.quality, 'verified');
  assert.ok(built.factor_result.evidence_ids.length >= 6);
  assert.ok(built.diagnostics.revenue_growth > 0 && built.diagnostics.revenue_growth < 0.5);
  assert.ok(built.diagnostics.operating_margin > 0 && built.diagnostics.operating_margin < 1);
  assert.ok(built.factor_result.drivers.includes('research heuristic; not decision-ready'));
  assert.equal(buildSecFundamentalFactor(normalized, { asOf: '2027-01-01T00:00:00.000Z' }).error.code, 'stale_fundamentals');
  console.log(`SEC fundamental factor: score=${built.factor_result.score.toFixed(4)} coverage=${built.factor_result.coverage} revenue_growth=${built.diagnostics.revenue_growth.toFixed(4)}`);
});

test('equity 3m policy composes without renormalizing missing weight', () => {
  const normalized = normalizeSecCompanyFacts(artifact, { asOf: AS_OF });
  const fundamental = buildSecFundamentalFactor(normalized, { asOf: AS_OF }).factor_result;
  const factors = [factor('technical', 0.4), fundamental, factor('macro', 0.1, 'estimated'), factor('data_quality', 0.8)];
  const composed = composeEquity3mShadow({ assetDescriptor, factors, now: AS_OF });
  assert.equal(composed.ok, true);
  assert.equal(validateScorecardRow(composed.scorecard_row).ok, true);
  assert.equal(composed.policy.research_only, true);
  assert.equal(composed.policy.decision_ready, false);
  assert.equal(composed.scorecard_row.coverage, 0.95);
  assert.equal(composed.scorecard_row.decision_state, 'eligible');
  const expected = 0.4 * POLICY.weights.technical + fundamental.score * POLICY.weights.fundamental + 0.1 * POLICY.weights.macro + 0.8 * POLICY.weights.data_quality;
  assert.ok(Math.abs(composed.scorecard_row.composite_strength - expected) < 1e-12);

  const excluded = composeEquity3mShadow({ assetDescriptor, factors: factors.filter((item) => item.domain !== 'fundamental'), now: AS_OF });
  assert.equal(excluded.ok, true);
  assert.equal(excluded.scorecard_row.decision_state, 'excluded');
  assert.equal(excluded.scorecard_row.coverage, 0.6);
  assert.ok(excluded.scorecard_row.exclusion_reasons.includes('missing required fundamental factor'));
  console.log(`equity 3m shadow: domains=${factors.length} coverage=${composed.scorecard_row.coverage} state=${composed.scorecard_row.decision_state} missing_fundamental=${excluded.scorecard_row.decision_state}`);
});
