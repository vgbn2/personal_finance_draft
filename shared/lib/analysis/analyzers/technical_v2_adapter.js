'use strict';

const { validateFactorResult, isTimestamp } = require('../../../contracts/analysis');

function rejection(code, message, details = {}) {
  return { ok: false, error: { code, message, ...details } };
}

function adaptTechnicalV2Row(row, { now = Date.now() } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return rejection('invalid_v2_row', 'schema-v2 technical row must be an object');
  }
  if (row.complete !== true) {
    return rejection('incomplete_v2_row', 'schema-v2 technical row is not marked complete');
  }
  if (!['long', 'short', 'neutral'].includes(row.bias)) {
    return rejection('invalid_direction', 'schema-v2 bias must be long, short, or neutral');
  }
  if (!Number.isFinite(row.score) || row.score < -1 || row.score > 1) {
    return rejection('invalid_score', 'schema-v2 score must be a finite number from -1 to 1');
  }
  if (!Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) {
    return rejection('invalid_strength', 'schema-v2 confidence must be a finite number from 0 to 1');
  }
  if (!isTimestamp(row.data_as_of) || !isTimestamp(row.valid_until)) {
    return rejection('invalid_timing', 'schema-v2 row requires valid data_as_of and valid_until timestamps');
  }
  if (Date.parse(row.valid_until) < now) {
    return rejection('stale_v2_row', 'schema-v2 technical row has expired', { valid_until: row.valid_until });
  }

  const details = row.timeframe_details;
  const timeframes = row.tfs && typeof row.tfs === 'object' && !Array.isArray(row.tfs)
    ? Object.keys(row.tfs)
    : [];
  if (!details || typeof details !== 'object' || Array.isArray(details) || timeframes.length === 0) {
    return rejection('incomplete_timeframes', 'schema-v2 row requires timeframe direction and timing details');
  }

  const evidenceIds = [];
  for (const timeframe of timeframes) {
    const direction = row.tfs[timeframe];
    const detail = details[timeframe];
    if (!['long', 'short', 'neutral'].includes(direction)
      || !detail || detail.bias !== direction
      || !Number.isInteger(detail.bars) || detail.bars < 20
      || !isTimestamp(detail.last_bar_at) || !isTimestamp(detail.valid_until)
      || Date.parse(detail.valid_until) < now) {
      return rejection('incomplete_timeframe', `schema-v2 timeframe ${timeframe} is incomplete or stale`, { timeframe });
    }
    evidenceIds.push(`technical-v2:${row.symbol || 'unknown'}:${timeframe}:${detail.last_bar_at}`);
  }

  const factorResult = {
    domain: 'technical',
    score: row.score,
    strength: row.confidence,
    coverage: evidenceIds.length / timeframes.length,
    quality: 'verified',
    data_as_of: row.data_as_of,
    valid_until: row.valid_until,
    evidence_ids: evidenceIds,
    drivers: [
      `schema-v2 direction=${row.bias}`,
      `schema-v2 aligned=${row.aligned === true}`,
      `schema-v2 timeframes=${timeframes.join(',')}`,
    ],
  };
  const validation = validateFactorResult(factorResult);
  if (!validation.ok) {
    return rejection('invalid_factor_result', 'adapted technical factor failed schema-v3 validation', {
      validation_errors: validation.errors,
    });
  }

  return {
    ok: true,
    direction: row.bias,
    factor_result: factorResult,
    source: {
      schema_version: 2,
      symbol: row.symbol || null,
      confidence_kind: row.confidence_kind || null,
    },
  };
}

module.exports = { adaptTechnicalV2Row };
