'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const { loadMarketConfig } = require('../runtime/config_loader.js');
const { REPO_ROOT, STORAGE_TS_DIR } = require('../runtime/paths.js');
const { resolveConfiguredMarketUniverse } = require('./configured_universe.js');
const { assessGrainIntegrity, isFresh, readCoverage } = require('./coverage.js');
const { readManifest } = require('./append_only_segments.js');
const { tsIndexPath } = require('./ts_index_storage.js');
const { DATASET_CATALOG_VERSION } = require('../strategy/sweep_contracts.js');

const DEFAULT_MARKET_CONFIG = `${REPO_ROOT}/config/markets/data_sources.yaml`;
const MAX_FINGERPRINT_BYTES = 256 * 1024 * 1024;

function parseCsvSet(value) {
  if (value == null || value === '' || value === 'all') return null;
  return new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean));
}

function closeFileBestEffort(fd) {
  if (fd === undefined) return;
  try { fs.closeSync(fd); } catch (_) { /* best effort */ }
}

function hashRegularFile(filePath, maxBytes = MAX_FINGERPRINT_BYTES) {
  let fd;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return { ok: false, reason: 'dataset_not_regular_file' };
    if (stat.size <= 0) return { ok: false, reason: 'dataset_empty_file' };
    if (stat.size > maxBytes) return { ok: false, reason: 'dataset_exceeds_fingerprint_limit' };
    const hash = crypto.createHash('sha256');
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, stat.size));
    let position = 0;
    while (position < stat.size) {
      const requested = Math.min(chunk.length, stat.size - position);
      const bytesRead = fs.readSync(fd, chunk, 0, requested, position);
      if (bytesRead <= 0) return { ok: false, reason: 'dataset_short_read' };
      hash.update(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = fs.fstatSync(fd);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
      return { ok: false, reason: 'dataset_changed_during_fingerprint' };
    }
    return { ok: true, sha256: hash.digest('hex'), bytes: stat.size };
  } catch (error) {
    return {
      ok: false,
      reason: error?.code === 'ELOOP' ? 'dataset_symlink_rejected' : 'dataset_open_failed',
    };
  } finally {
    closeFileBestEffort(fd);
  }
}

function requestedTimeframes(config, family, requested) {
  const configured = Array.isArray(config[family]?.timeframes) ? config[family].timeframes : [];
  return configured.filter((timeframe) => requested === null || requested.has(timeframe));
}

function rejection(instrument, timeframe, reason, details = {}) {
  return {
    dataset_id: `${instrument.instrument_id}:${timeframe}`,
    instrument_id: instrument.instrument_id,
    family: instrument.family,
    symbol: instrument.symbol,
    timeframe,
    eligible: false,
    reason,
    ...details,
  };
}

function baseDescriptor(instrument, timeframe, coverage) {
  return {
    dataset_id: `${instrument.instrument_id}:${timeframe}`,
    instrument_id: instrument.instrument_id,
    family: instrument.family,
    symbol: instrument.symbol,
    timeframe,
    provider: coverage.provider || instrument.configured_provider || null,
    schedule_basis: instrument.schedule_basis,
    currency_or_unit: instrument.currency_or_unit,
    records: coverage.count,
    first_bar_ms: coverage.firstBarMs,
    last_bar_ms: coverage.lastBarMs,
    derived_from_timeframe: coverage.derivedFrom || null,
  };
}

function inspectDataset(config, instrument, timeframe, options) {
  const { tsDir, now, allowStale, allowDerived, minBars, maxFingerprintBytes } = options;
  let coverage;
  try {
    coverage = readCoverage(tsDir, instrument.symbol, timeframe, now);
  } catch (error) {
    return rejection(instrument, timeframe, 'coverage_read_failed', { detail: error.message });
  }
  const descriptor = baseDescriptor(instrument, timeframe, coverage);
  if (!coverage.exists) return { ...descriptor, eligible: false, reason: 'dataset_missing' };
  if (coverage.count < minBars) return { ...descriptor, eligible: false, reason: 'insufficient_records' };

  let activeManifest;
  try {
    activeManifest = readManifest(tsDir, instrument.symbol, timeframe);
  } catch (error) {
    return { ...descriptor, eligible: false, reason: 'segment_manifest_invalid', detail: error.message };
  }
  if (activeManifest) {
    return {
      ...descriptor,
      eligible: false,
      reason: 'active_segments_require_immutable_snapshot',
      active_segments: activeManifest.segments.length,
    };
  }

  const freshness = isFresh(tsDir, instrument.symbol, timeframe, instrument.family, now);
  if (!allowStale && !freshness.fresh) {
    return { ...descriptor, eligible: false, reason: `freshness_${freshness.reason}` };
  }

  const grain = assessGrainIntegrity(tsDir, instrument.symbol, timeframe, instrument.family, coverage);
  if (grain.blocking) {
    return { ...descriptor, eligible: false, reason: `grain_${grain.reason}`, grain };
  }
  if (!allowDerived && coverage.derivedFrom) {
    return { ...descriptor, eligible: false, reason: 'derived_dataset_not_allowed' };
  }

  const { bin } = tsIndexPath(tsDir, instrument.symbol, timeframe);
  const fingerprint = hashRegularFile(bin, maxFingerprintBytes);
  if (!fingerprint.ok) {
    return { ...descriptor, eligible: false, reason: fingerprint.reason };
  }

  return {
    ...descriptor,
    eligible: true,
    reason: null,
    physical_path: bin,
    fingerprint: fingerprint.sha256,
    bytes: fingerprint.bytes,
    freshness: {
      reason: freshness.reason,
      age_ms: freshness.ageMs,
      threshold_ms: freshness.thresholdMs,
    },
    grain: {
      status: grain.status,
      reason: grain.reason,
    },
    quality_policy: config.quality || {},
  };
}

async function buildResearchDatasetCatalog(options = {}) {
  const marketConfigPath = options.marketConfigPath || DEFAULT_MARKET_CONFIG;
  const config = options.config || await loadMarketConfig(marketConfigPath);
  const universe = resolveConfiguredMarketUniverse(config);
  const requestedSymbols = parseCsvSet(options.symbols);
  const requestedTfs = parseCsvSet(options.timeframes);
  const selectedInstruments = universe.instruments.filter((instrument) => (
    requestedSymbols === null || requestedSymbols.has(instrument.symbol)
  ));
  const inspectOptions = {
    tsDir: options.tsDir || STORAGE_TS_DIR,
    now: Number.isFinite(options.now) ? options.now : Date.now(),
    allowStale: options.allowStale === true,
    allowDerived: options.allowDerived === true,
    minBars: Number.isInteger(options.minBars) ? options.minBars : 100,
    maxFingerprintBytes: Number.isInteger(options.maxFingerprintBytes)
      ? options.maxFingerprintBytes
      : MAX_FINGERPRINT_BYTES,
  };
  const rows = [];
  for (const instrument of selectedInstruments) {
    for (const timeframe of requestedTimeframes(config, instrument.family, requestedTfs)) {
      rows.push(inspectDataset(config, instrument, timeframe, inspectOptions));
    }
  }
  rows.sort((left, right) => left.dataset_id.localeCompare(right.dataset_id));
  const eligible = rows.filter((row) => row.eligible);
  const rejected = rows.filter((row) => !row.eligible);
  return {
    catalog_version: DATASET_CATALOG_VERSION,
    research_only: true,
    promotion_eligible: false,
    market_config_path: marketConfigPath,
    generated_at: options.generatedAt || null,
    as_of_ms: inspectOptions.now,
    datasets: eligible,
    rejected,
    counts: {
      configured_instruments: universe.instruments.length,
      selected_instruments: selectedInstruments.length,
      discovered: rows.length,
      eligible: eligible.length,
      rejected: rejected.length,
    },
  };
}

module.exports = {
  DEFAULT_MARKET_CONFIG,
  MAX_FINGERPRINT_BYTES,
  baseDescriptor,
  buildResearchDatasetCatalog,
  closeFileBestEffort,
  hashRegularFile,
  inspectDataset,
  parseCsvSet,
  rejection,
  requestedTimeframes,
};
