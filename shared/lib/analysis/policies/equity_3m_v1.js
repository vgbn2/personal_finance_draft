'use strict';

const { validateFactorResult, validateScorecardRow } = require('../../../contracts/analysis');

const POLICY = Object.freeze({
  id: 'equity', version: '3m-v1-shadow', family: 'equity', horizon: '3m',
  research_only: true, decision_ready: false,
  weights: Object.freeze({ technical: 0.35, fundamental: 0.35, macro: 0.15, catalyst: 0.05, data_quality: 0.10 }),
  required_domains: Object.freeze(['technical', 'fundamental', 'macro', 'data_quality']),
});

function reject(code, message, details = {}) { return { ok: false, error: { code, message, ...details } }; }

function composeEquity3mShadow({ assetDescriptor, factors, now = new Date().toISOString() }) {
  if (assetDescriptor?.family !== 'equity' || assetDescriptor?.subtype !== 'common_stock' || assetDescriptor?.market !== 'US') {
    return reject('unsupported_asset', 'equity 3m v1 supports US common stocks only');
  }
  if (!Array.isArray(factors)) return reject('invalid_factors', 'factors must be an array');
  const invalid = factors.map((factor, index) => ({ index, validation: validateFactorResult(factor) })).filter((item) => !item.validation.ok);
  if (invalid.length) return reject('invalid_factor', 'all factors must satisfy the v3 contract', { invalid });
  const byDomain = new Map(factors.map((factor) => [factor.domain, factor]));
  const missing = POLICY.required_domains.filter((domain) => !byDomain.has(domain));
  const stale = factors.filter((factor) => Date.parse(factor.valid_until) < Date.parse(now)).map((factor) => factor.domain);
  const dataQuality = byDomain.get('data_quality');
  const qualityReasons = dataQuality && dataQuality.quality !== 'verified' ? [`data quality is ${dataQuality.quality}`] : [];
  const exclusions = [...missing.map((domain) => `missing required ${domain} factor`), ...stale.map((domain) => `stale ${domain} factor`), ...qualityReasons];
  const usable = factors.filter((factor) => POLICY.weights[factor.domain] && !stale.includes(factor.domain));
  const weightedScore = usable.reduce((sum, factor) => sum + factor.score * POLICY.weights[factor.domain], 0);
  const declaredWeight = usable.reduce((sum, factor) => sum + POLICY.weights[factor.domain], 0);
  // Never renormalize around missing evidence: absent weight reduces coverage and strength.
  const composite = Math.max(-1, Math.min(1, weightedScore));
  const decisionState = exclusions.length ? (missing.includes('fundamental') || stale.includes('fundamental') ? 'excluded' : 'degraded') : 'eligible';
  const row = {
    schema_version: 3, asset_descriptor: assetDescriptor, horizon: '3m',
    direction: composite > 0.10 ? 'long' : composite < -0.10 ? 'short' : 'neutral',
    composite_strength: Math.abs(composite), factor_results: factors,
    coverage: Math.min(1, declaredWeight), data_quality: dataQuality?.quality || 'unknown',
    data_as_of: usable.map((factor) => factor.data_as_of).sort().at(-1) || now,
    valid_until: usable.map((factor) => factor.valid_until).sort().at(0) || now,
    decision_state: decisionState, exclusion_reasons: exclusions,
    scoring_policy: { id: POLICY.id, version: POLICY.version, family: POLICY.family, horizon: POLICY.horizon },
  };
  const validation = validateScorecardRow(row);
  return validation.ok ? { ok: true, scorecard_row: row, policy: POLICY } : reject('invalid_scorecard_row', 'composed row failed v3 validation', { validation_errors: validation.errors });
}

module.exports = { POLICY, composeEquity3mShadow };
