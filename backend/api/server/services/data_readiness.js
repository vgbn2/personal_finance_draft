'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function checkSnapshotReadiness(snapshotPath, options = {}) {
  const maxAgeMs = options.maxAgeMs || DEFAULT_SNAPSHOT_MAX_AGE_MS;
  if (!snapshotPath || typeof snapshotPath !== 'string') {
    return { ok: false, error_code: 'invalid_snapshot_path', status: 400, message: 'Invalid snapshot path' };
  }

  const resolved = path.resolve(snapshotPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error_code: 'snapshot_not_found', status: 503, message: 'Snapshot file not found' };
  }

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    return { ok: false, error_code: 'snapshot_stat_error', status: 503, message: `Failed to stat snapshot file: ${err.message}` };
  }

  const age = Date.now() - stat.mtimeMs;
  if (options.checkFreshness && age > maxAgeMs) {
    return { ok: false, error_code: 'snapshot_stale', status: 503, age_ms: age, message: 'Snapshot file is stale' };
  }

  let data;
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error_code: 'snapshot_corrupt', status: 503, message: `Corrupt JSON snapshot file: ${err.message}` };
  }

  return { ok: true, path: resolved, mtime_ms: stat.mtimeMs, age_ms: age, data };
}

function checkDataSeriesSufficiency(records, minBars = 1) {
  if (!Array.isArray(records)) {
    return { ok: false, error_code: 'invalid_series_format', status: 400, message: 'Records must be an array' };
  }
  if (records.length < minBars) {
    return {
      ok: false,
      error_code: 'insufficient_bars',
      status: 422,
      bars_available: records.length,
      bars_required: minBars,
      message: `Available bar length (${records.length}) is less than required (${minBars})`,
    };
  }
  return { ok: true, bars_count: records.length };
}

module.exports = {
  DEFAULT_SNAPSHOT_MAX_AGE_MS,
  checkSnapshotReadiness,
  checkDataSeriesSufficiency,
};
