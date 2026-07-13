'use strict';

const artifact = require('../../../fixtures/analysis/sec_companyfacts_aapl_recorded.json');
const { validateFactorResult } = require('../../../contracts/analysis');
const { normalizeSecCompanyFacts, buildSecFundamentalFactor } = require('../analyzers/sec_companyfacts');
const { composeEquity3mShadow } = require('../policies/equity_3m_v1');

const RECORDED_AAPL_FIXTURE_ID = 'aapl-recorded';

function fixtureFactor(domain, score, quality, evidenceId) {
  return {
    domain, score, strength: Math.max(0.2, Math.abs(score)), coverage: 1, quality,
    data_as_of: '2026-05-02T00:00:00.000Z', valid_until: '2026-08-30T00:00:00.000Z',
    evidence_ids: [evidenceId], drivers: [`${domain} fixture input for cross-adapter parity only`],
  };
}

const AAPL_ASSET = Object.freeze({
  asset_id: 'equity:US:AAPL', symbol: 'AAPL', family: 'equity', subtype: 'common_stock',
  market: 'US', sector: 'technology', quote_currency: 'USD', region: 'US',
  provider_ids: { sec_cik: '0000320193' },
});

function rejection(code, message, details = {}) { return { ok: false, type: 'analysis_shadow', schema_version: 3, error_code: code, error: message, ...details }; }

function buildEquity3mShadow({ assetDescriptor, secArtifact, technicalFactor, macroFactor, dataQualityFactor, catalystFactor, asOf }) {
  const inputs = [technicalFactor, macroFactor, dataQualityFactor, catalystFactor].filter(Boolean);
  const invalid = inputs.map((factor) => validateFactorResult(factor)).find((result) => !result.ok);
  if (invalid) return rejection('invalid_shadow_factor', 'shadow service received an invalid factor', { validation_errors: invalid.errors });
  const normalized = normalizeSecCompanyFacts(secArtifact, { asOf });
  if (!normalized.ok) return rejection(normalized.error.code, normalized.error.message);
  const fundamental = buildSecFundamentalFactor(normalized, { asOf });
  if (!fundamental.ok) return rejection(fundamental.error.code, fundamental.error.message, { missing_metrics: fundamental.error.missing_metrics || [] });
  const composed = composeEquity3mShadow({ assetDescriptor, factors: [technicalFactor, fundamental.factor_result, macroFactor, ...(catalystFactor ? [catalystFactor] : []), dataQualityFactor], now: asOf });
  if (!composed.ok) return rejection(composed.error.code, composed.error.message, composed.error);
  return {
    ok: true, type: 'analysis_shadow', schema_version: 3, generated_at: asOf,
    research_only: true, decision_ready: false,
    fixture_status: 'recorded_sec_with_synthetic_parity_factors',
    fixture_id: RECORDED_AAPL_FIXTURE_ID,
    provenance: { sec: secArtifact.provenance, technical: 'synthetic parity factor', macro: 'synthetic parity factor' },
    counts: { sec_observations: normalized.observations.length, sec_metrics: Object.keys(normalized.concepts).length, rows: 1 },
    rows: [composed.scorecard_row],
  };
}

function buildRecordedAppleShadow() {
  return buildEquity3mShadow({
    assetDescriptor: AAPL_ASSET, secArtifact: artifact, asOf: artifact.provenance.retrieved_at,
    technicalFactor: fixtureFactor('technical', 0.4, 'estimated', 'synthetic-parity:technical:AAPL'),
    macroFactor: fixtureFactor('macro', 0.1, 'estimated', 'synthetic-parity:macro:AAPL'),
    dataQualityFactor: fixtureFactor('data_quality', 0.8, 'degraded', 'recorded-sec:quality:AAPL'),
  });
}

module.exports = { AAPL_ASSET, RECORDED_AAPL_FIXTURE_ID, buildEquity3mShadow, buildRecordedAppleShadow };
