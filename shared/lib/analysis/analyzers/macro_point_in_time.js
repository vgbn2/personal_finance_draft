'use strict';

const { selectMacroObservationsAsOf } = require('../../data/macro_store');

function reject(code, message, details = {}) {
  return { ok: false, error: { code, message, ...details } };
}

function latestBySeries(records) {
  const latest = new Map();
  for (const record of records) {
    const current = latest.get(record.series);
    if (!current || Date.parse(record.period_end) > Date.parse(current.period_end)) {
      latest.set(record.series, record);
    }
  }
  return latest;
}

function buildPointInTimeMacroFactor({
  assetId,
  records,
  decisionAt,
  mapping,
}) {
  const decisionMs = Date.parse(decisionAt);
  if (!assetId || !Number.isFinite(decisionMs)) {
    return reject('invalid_macro_request', 'exact asset_id and decision_at are required');
  }
  if (!mapping || !Array.isArray(mapping.macro_series) || mapping.macro_series.length === 0) {
    return reject('macro_mapping_missing', 'no reviewed exact-asset macro mapping exists', { asset_id: assetId });
  }

  const selected = selectMacroObservationsAsOf(records || [], decisionAt);
  const bySeries = latestBySeries(selected);
  const required = [...new Set(mapping.macro_series.map(String))].sort();
  const missing = required.filter((series) => !bySeries.has(series));
  if (missing.length > 0) {
    return reject('macro_observation_missing', 'required point-in-time macro observations are missing', {
      asset_id: assetId,
      missing_series: missing,
    });
  }

  const observations = required.map((series) => bySeries.get(series));
  const synthetic = observations.filter((record) => /synthetic/i.test(record.source || ''));
  if (synthetic.length > 0) {
    return reject('synthetic_macro_observation', 'synthetic macro observations cannot enter the combined engine', {
      revision_ids: synthetic.map((record) => record.revision_id),
    });
  }

  const maxAgeMs = Math.max(1, Number(mapping.macro_max_age_days) || 120) * 86400000;
  const stale = observations.filter((record) => decisionMs - Date.parse(record.available_at) > maxAgeMs);
  if (stale.length > 0) {
    return reject('stale_macro_observation', 'required macro observations exceed the reviewed freshness window', {
      stale_series: stale.map((record) => record.series),
      max_age_ms: maxAgeMs,
    });
  }

  const observedAt = observations.map((record) => record.period_end).sort().at(-1);
  const availableAt = observations.map((record) => record.available_at).sort().at(-1);
  const validUntil = new Date(Math.min(
    ...observations.map((record) => Date.parse(record.available_at) + maxAgeMs),
  )).toISOString();
  const factorResult = {
    domain: 'macro',
    score: 0,
    strength: 0,
    coverage: observations.length / required.length,
    quality: 'verified',
    data_as_of: observedAt,
    valid_until: validUntil,
    evidence_ids: observations.map((record) => `macro:${record.revision_id}`),
    drivers: [
      `exact asset mapping=${assetId}`,
      `point-in-time series=${required.join(',')}`,
      'directional macro contribution remains neutral until calibration',
    ],
  };

  return {
    ok: true,
    factor_result: factorResult,
    component: {
      asset_id: assetId,
      domain: 'macro',
      source: 'canonical_macro_observations',
      observed_at: observedAt,
      available_at: availableAt,
      valid_until: validUntil,
      freshness: {
        age_ms: Math.max(0, decisionMs - Date.parse(availableAt)),
        max_age_ms: maxAgeMs,
        fresh: true,
      },
      quality: 'verified',
      coverage: factorResult.coverage,
      value: 0,
      exclusion_reasons: [],
      provenance: observations.map((record) => ({
        series: record.series,
        source: record.source,
        revision_id: record.revision_id,
        period_end: record.period_end,
        released_at: record.released_at,
        available_at: record.available_at,
        ingested_at: record.ingested_at,
        vintage: record.vintage,
      })),
    },
  };
}

module.exports = { buildPointInTimeMacroFactor, latestBySeries };
