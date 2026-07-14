'use strict';

const { validateFactorResult, validateScorecardRow } = require('../../../contracts/analysis');

function composeFamilyShadow({ assetDescriptor, factors, policy, now }) {
  if (!policy || policy.research_only !== true || policy.decision_ready !== false) return { ok: false, error: { code: 'invalid_policy', message: 'family policy must be explicitly research-only and not decision-ready' } };
  if (assetDescriptor?.family !== policy.family || policy.subtypes && !policy.subtypes.includes(assetDescriptor?.subtype)) return { ok: false, error: { code: 'unsupported_asset', message: 'asset family/subtype does not match policy' } };
  if (!Array.isArray(factors)) return { ok: false, error: { code: 'invalid_factors', message: 'factors must be an array' } };
  const invalid = factors.map((factor) => validateFactorResult(factor)).find((result) => !result.ok);
  if (invalid) return { ok: false, error: { code: 'invalid_factor', message: 'factor failed v3 validation', validation_errors: invalid.errors } };
  const byDomain = new Map(factors.map((factor) => [factor.domain, factor]));
  const missing = policy.required_domains.filter((domain) => !byDomain.has(domain));
  const stale = factors.filter((factor) => Date.parse(factor.valid_until) < Date.parse(now)).map((factor) => factor.domain);
  const dataQuality = byDomain.get('data_quality');
  const reasons = [...missing.map((domain) => `missing required ${domain} factor`), ...stale.map((domain) => `stale ${domain} factor`)];
  if (dataQuality && dataQuality.quality !== 'verified') reasons.push(`data quality is ${dataQuality.quality}`);
  const usable = factors.filter((factor) => policy.weights[factor.domain] && !stale.includes(factor.domain));
  const score = Math.max(-1, Math.min(1, usable.reduce((sum, factor) => sum + factor.score * policy.weights[factor.domain], 0)));
  const coverage = Math.min(1, usable.reduce((sum, factor) => sum + policy.weights[factor.domain], 0));
  const criticalMissing = missing.some((domain) => policy.exclusion_domains.includes(domain)) || stale.some((domain) => policy.exclusion_domains.includes(domain));
  const row = {
    schema_version: 3, asset_descriptor: assetDescriptor, horizon: policy.horizon,
    direction: score > 0.10 ? 'long' : score < -0.10 ? 'short' : 'neutral', composite_strength: Math.abs(score),
    factor_results: factors, coverage, data_quality: dataQuality?.quality || 'unknown',
    data_as_of: usable.map((factor) => factor.data_as_of).sort().at(-1) || now,
    valid_until: usable.map((factor) => factor.valid_until).sort().at(0) || now,
    decision_state: criticalMissing ? 'excluded' : reasons.length ? 'degraded' : 'eligible',
    exclusion_reasons: reasons,
    scoring_policy: { id: policy.id, version: policy.version, family: policy.family, horizon: policy.horizon },
  };
  const validation = validateScorecardRow(row);
  return validation.ok ? { ok: true, scorecard_row: row, policy } : { ok: false, error: { code: 'invalid_scorecard_row', message: 'family row failed v3 validation', validation_errors: validation.errors } };
}

module.exports = { composeFamilyShadow };
