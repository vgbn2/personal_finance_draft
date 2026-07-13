'use strict';

const {
  SCHEMA_VERSION, FAMILIES, SUBTYPES, DOMAINS, DIRECTIONS,
  DECISION_STATES, QUALITIES, HORIZONS,
} = require('./constants');
const { getFamilySections } = require('./family_sections');

function error(field, code, message) { return { field, code, message }; }
function result(errors) { return { ok: errors.length === 0, errors }; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}
function requiredString(value, field, errors) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(error(field, 'required_string', `${field} must be a non-empty string`));
}
function enumValue(value, field, values, errors) {
  if (!values.includes(value)) errors.push(error(field, 'invalid_enum', `${field} must be one of: ${values.join(', ')}`));
}
function range(value, field, min, max, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) errors.push(error(field, 'invalid_range', `${field} must be a finite number from ${min} to ${max}`));
}
function timestamp(value, field, errors) {
  if (!isTimestamp(value)) errors.push(error(field, 'invalid_timestamp', `${field} must be an ISO-8601 UTC timestamp`));
}
function stringArray(value, field, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(error(field, 'required_array', `${field} must be an array`));
    return;
  }
  if (!allowEmpty && value.length === 0) errors.push(error(field, 'empty_array', `${field} must not be empty`));
  value.forEach((item, index) => requiredString(item, `${field}[${index}]`, errors));
}
function validateAssetDescriptor(input) {
  const errors = [];
  if (!isObject(input)) return result([error('', 'invalid_type', 'asset descriptor must be an object')]);
  ['asset_id', 'symbol', 'family', 'subtype', 'market', 'quote_currency', 'region'].forEach((field) => requiredString(input[field], field, errors));
  enumValue(input.family, 'family', FAMILIES, errors);
  enumValue(input.subtype, 'subtype', SUBTYPES, errors);
  if (typeof input.asset_id === 'string' && typeof input.family === 'string' && !input.asset_id.startsWith(`${input.family}:`)) {
    errors.push(error('asset_id', 'identity_prefix', 'asset_id must be family-qualified and start with family:'));
  }
  if (!isObject(input.provider_ids)) errors.push(error('provider_ids', 'required_object', 'provider_ids must be an object'));
  else Object.entries(input.provider_ids).forEach(([key, value]) => {
    requiredString(key, 'provider_ids key', errors);
    requiredString(value, `provider_ids.${key}`, errors);
  });
  if (input.family && input.subtype && !getFamilySections(input.family, input.subtype)) errors.push(error('subtype', 'unsupported_pair', 'family/subtype has no registered section policy'));
  return result(errors);
}
function validateObservation(input) {
  const errors = [];
  if (!isObject(input)) return result([error('', 'invalid_type', 'observation must be an object')]);
  ['subject_id', 'metric_id', 'unit', 'available_at', 'provider', 'provider_ref'].forEach((field) => requiredString(input[field], field, errors));
  if (typeof input.value !== 'number' || !Number.isFinite(input.value)) errors.push(error('value', 'invalid_number', 'value must be a finite number'));
  enumValue(input.quality, 'quality', QUALITIES, errors);
  timestamp(input.available_at, 'available_at', errors);
  ['period_end', 'released_at', 'ingested_at'].forEach((field) => { if (input[field] !== undefined) timestamp(input[field], field, errors); });
  if (input.released_at && isTimestamp(input.released_at) && isTimestamp(input.available_at) && Date.parse(input.available_at) < Date.parse(input.released_at)) errors.push(error('available_at', 'before_release', 'available_at cannot precede released_at'));
  if (input.ingested_at && isTimestamp(input.ingested_at) && isTimestamp(input.available_at) && Date.parse(input.ingested_at) < Date.parse(input.available_at)) errors.push(error('ingested_at', 'before_available', 'ingested_at cannot precede available_at'));
  return result(errors);
}
function validateFactorResult(input) {
  const errors = [];
  if (!isObject(input)) return result([error('', 'invalid_type', 'factor result must be an object')]);
  enumValue(input.domain, 'domain', DOMAINS, errors);
  range(input.score, 'score', -1, 1, errors);
  range(input.strength, 'strength', 0, 1, errors);
  range(input.coverage, 'coverage', 0, 1, errors);
  enumValue(input.quality, 'quality', QUALITIES, errors);
  timestamp(input.data_as_of, 'data_as_of', errors);
  timestamp(input.valid_until, 'valid_until', errors);
  if (isTimestamp(input.data_as_of) && isTimestamp(input.valid_until) && Date.parse(input.valid_until) < Date.parse(input.data_as_of)) errors.push(error('valid_until', 'before_data_as_of', 'valid_until cannot precede data_as_of'));
  stringArray(input.evidence_ids, 'evidence_ids', errors);
  stringArray(input.drivers, 'drivers', errors);
  return result(errors);
}
function validateSyntheticFixture(input) {
  if (!isObject(input) || input.fixture_status !== 'synthetic') return result([error('fixture_status', 'unlabeled_synthetic', 'fixture must be explicitly labeled synthetic')]);
  if (typeof input.fixture_id !== 'string' || input.fixture_id.trim() === '') return result([error('fixture_id', 'required_string', 'synthetic fixtures require fixture_id')]);
  return result([]);
}
function validateScorecardRow(input) {
  const errors = [];
  if (!isObject(input)) return result([error('', 'invalid_type', 'scorecard row must be an object')]);
  if (input.schema_version !== SCHEMA_VERSION) errors.push(error('schema_version', 'invalid_version', `schema_version must be ${SCHEMA_VERSION}`));
  const assetResult = validateAssetDescriptor(input.asset_descriptor);
  errors.push(...assetResult.errors.map((item) => ({ ...item, field: `asset_descriptor.${item.field}` })));
  enumValue(input.horizon, 'horizon', HORIZONS, errors);
  enumValue(input.direction, 'direction', DIRECTIONS, errors);
  range(input.composite_strength, 'composite_strength', 0, 1, errors);
  range(input.coverage, 'coverage', 0, 1, errors);
  enumValue(input.data_quality, 'data_quality', QUALITIES, errors);
  enumValue(input.decision_state, 'decision_state', DECISION_STATES, errors);
  timestamp(input.data_as_of, 'data_as_of', errors);
  timestamp(input.valid_until, 'valid_until', errors);
  if (!Array.isArray(input.factor_results) || input.factor_results.length === 0) errors.push(error('factor_results', 'required_array', 'factor_results must be a non-empty array'));
  else {
    const domains = new Set();
    const applicableDomains = getFamilySections(input.asset_descriptor?.family, input.asset_descriptor?.subtype) || [];
    input.factor_results.forEach((factor, index) => {
      const factorResult = validateFactorResult(factor);
      errors.push(...factorResult.errors.map((item) => ({ ...item, field: `factor_results[${index}].${item.field}` })));
      if (factor && domains.has(factor.domain)) errors.push(error(`factor_results[${index}].domain`, 'duplicate_domain', 'factor domains must be unique within a row'));
      if (factor && !applicableDomains.includes(factor.domain)) errors.push(error(`factor_results[${index}].domain`, 'inapplicable_domain', 'factor domain is not applicable to the asset family/subtype'));
      domains.add(factor && factor.domain);
    });
    if (!domains.has('data_quality')) errors.push(error('factor_results', 'missing_data_quality', 'scorecard rows require a data_quality factor'));
  }
  if (!Array.isArray(input.exclusion_reasons)) errors.push(error('exclusion_reasons', 'required_array', 'exclusion_reasons must be an array'));
  if (['degraded', 'excluded'].includes(input.decision_state) && (!input.exclusion_reasons || input.exclusion_reasons.length === 0)) errors.push(error('exclusion_reasons', 'missing_exclusion_reason', 'degraded and excluded rows require at least one reason'));
  if (input.decision_state === 'eligible' && Array.isArray(input.exclusion_reasons) && input.exclusion_reasons.length > 0) errors.push(error('exclusion_reasons', 'unexpected_exclusion_reason', 'eligible rows may not have exclusion reasons'));
  if (Array.isArray(input.exclusion_reasons)) stringArray(input.exclusion_reasons, 'exclusion_reasons', errors, { allowEmpty: input.decision_state === 'eligible' });
  if (!isObject(input.scoring_policy)) errors.push(error('scoring_policy', 'required_object', 'scoring_policy must contain id and version'));
  else {
    requiredString(input.scoring_policy.id, 'scoring_policy.id', errors);
    requiredString(input.scoring_policy.version, 'scoring_policy.version', errors);
    enumValue(input.scoring_policy.family, 'scoring_policy.family', FAMILIES, errors);
    enumValue(input.scoring_policy.horizon, 'scoring_policy.horizon', HORIZONS, errors);
    if (input.asset_descriptor?.family && input.scoring_policy.family !== input.asset_descriptor.family) errors.push(error('scoring_policy.family', 'policy_family_mismatch', 'scoring policy family must match the asset family'));
    if (input.horizon && input.scoring_policy.horizon !== input.horizon) errors.push(error('scoring_policy.horizon', 'policy_horizon_mismatch', 'scoring policy horizon must match the row horizon'));
  }
  if (isTimestamp(input.data_as_of) && isTimestamp(input.valid_until) && Date.parse(input.valid_until) < Date.parse(input.data_as_of)) errors.push(error('valid_until', 'before_data_as_of', 'valid_until cannot precede data_as_of'));
  return result(errors);
}
function assertValid(validator, value, label) { const checked = validator(value); if (!checked.ok) { const details = checked.errors.map((item) => `${item.field}: ${item.code}`).join('; '); throw new TypeError(`${label || 'value'} is invalid: ${details}`); } return value; }

module.exports = { validateAssetDescriptor, validateObservation, validateFactorResult, validateScorecardRow, validateSyntheticFixture, assertValid, isTimestamp };
