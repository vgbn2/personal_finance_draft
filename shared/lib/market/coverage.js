'use strict';
/**
 * coverage.js -- read-only cache-availability probe for the binary ts-index.
 *
 * The background backfill daemon uses this to decide what to fetch BEFORE hitting
 * a provider: it inspects what's already stored (bar count + last-bar timestamp)
 * and only polls symbols whose finest bin is missing or stale. This avoids wasting
 * provider API budget re-downloading bars we already have.
 *
 * Reads are cheap: the bar count comes from the bin header (or meta sidecar) and
 * the last-bar timestamp is a single 8-byte tail read -- the full bin is never
 * loaded. The binary layout mirrors writeTsIndex/readTsIndex in validation.js:606.
 */

const fs = require('node:fs');
const path = require('node:path');
const { familyFreshnessThresholdMs } = require('./validation.js');

// How long to skip a symbol confirmed to have no data (delisted / never listed).
const DEAD_SYMBOL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Grain-corruption tripwire. A real defect class (seen 2026-06-15): coarse daily data leaked into
// intraday bins, so e.g. a `_15m.bin` spanned 2002->2026 with ~1 bar/day. The reliable, CHEAP signal
// (head/tail only) is "huge span + implausibly low density": honest-thin coarse bins are RECENT
// (span < ~2yr) and natively-deep 1h stays dense, so neither trips this. Floors sit well below the
// observed legit per-TF p05 density (5m≥24, 15m≥11, 30m≥4.6, 1h≥3.4, 4h≥1.35 bars/day).
const GRAIN_MIN_SPAN_MS = 730 * 24 * 60 * 60 * 1000; // only judge bins claiming > 2 years of history
const GRAIN_DENSITY_FLOOR = { '5m': 10, '15m': 5, '30m': 3, '1h': 2, '4h': 1.5 };
const GRAIN_SAMPLE_SIZE = 512;
const GRAIN_SESSION_FAMILIES = new Set(['equities', 'indices', 'commodities']);
const GRAIN_SESSION_ACTIVE_DAY_FLOOR = { '5m': 10, '15m': 5, '30m': 3, '1h': 2, '4h': 1.5 };
const GRAIN_TIMEFRAME_MINUTES = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };
const GRAIN_MAX_GAP_MULTIPLIER = 2;

/**
 * isGrainSuspect(timeframe, count, firstBarMs, lastBarMs) -- cheap mixed-grain detector.
 * Flags an intraday bin that claims a multi-year span yet holds far too few bars to be real
 * intraday (i.e. coarse data mislabeled as intraday). Uses only values already in readCoverage.
 * @returns {{ suspect:boolean, barsPerDay:(number|null), spanDays:(number|null), floor:(number|null) }}
 */
function isGrainSuspect(timeframe, count, firstBarMs, lastBarMs) {
  const floor = GRAIN_DENSITY_FLOOR[timeframe];
  if (floor === undefined || !count || firstBarMs == null || lastBarMs == null) {
    return { suspect: false, barsPerDay: null, spanDays: null, floor: floor ?? null };
  }
  const spanMs = lastBarMs - firstBarMs;
  const spanDays = spanMs / 86400000;
  const barsPerDay = spanDays > 0 ? count / spanDays : count;
  const suspect = spanMs > GRAIN_MIN_SPAN_MS && barsPerDay < floor;
  return { suspect, barsPerDay: +barsPerDay.toFixed(2), spanDays: Math.round(spanDays), floor };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function classifyRecentGrainCadence(timeframe, family, timestamps) {
  const floor = GRAIN_SESSION_ACTIVE_DAY_FLOOR[timeframe] ?? null;
  const timeframeMinutes = GRAIN_TIMEFRAME_MINUTES[timeframe] ?? null;
  const policy = {
    sample_size: GRAIN_SAMPLE_SIZE,
    min_bars_per_active_day: floor,
    max_median_within_day_gap_minutes: timeframeMinutes === null
      ? null
      : timeframeMinutes * GRAIN_MAX_GAP_MULTIPLIER,
  };

  if (!GRAIN_SESSION_FAMILIES.has(family)) {
    return {
      status: 'unexplained',
      blocking: true,
      reason: 'continuous_market_density_below_floor',
      policy,
    };
  }

  const finite = [...new Set((timestamps || []).filter(Number.isFinite))].sort((a, b) => a - b);
  const byDay = new Map();
  for (const timestamp of finite) {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(timestamp);
  }

  const daySamples = [...byDay.values()];
  const completeDays = daySamples.length > 2 ? daySamples.slice(1, -1) : daySamples;
  const dailyCounts = completeDays.map((day) => day.length);
  const withinDayGaps = [];
  for (const day of completeDays) {
    for (let index = 1; index < day.length; index += 1) {
      withinDayGaps.push((day[index] - day[index - 1]) / 60000);
    }
  }

  const sampledBars = dailyCounts.reduce((sum, count) => sum + count, 0);
  const barsPerActiveDay = completeDays.length > 0 ? sampledBars / completeDays.length : null;
  const medianWithinDayGapMinutes = median(withinDayGaps);
  const sample = {
    bars: finite.length,
    active_days: daySamples.length,
    complete_active_days: completeDays.length,
    bars_per_active_day: barsPerActiveDay === null ? null : +barsPerActiveDay.toFixed(2),
    median_bars_per_active_day: median(dailyCounts),
    median_within_day_gap_minutes: medianWithinDayGapMinutes,
  };

  if (completeDays.length < 5 || medianWithinDayGapMinutes === null || floor === null) {
    return {
      status: 'unexplained',
      blocking: true,
      reason: 'insufficient_recent_cadence_sample',
      policy,
      sample,
    };
  }

  const densityMatches = barsPerActiveDay >= floor;
  const gapMatches = medianWithinDayGapMinutes <= policy.max_median_within_day_gap_minutes;
  const status = densityMatches && gapMatches ? 'cadence_plausible' : 'unexplained';
  const reason = status === 'cadence_plausible'
    ? 'recent_session_cadence_matches_timeframe'
    : !densityMatches && !gapMatches
      ? 'recent_density_and_gap_mismatch'
      : !densityMatches
        ? 'recent_active_day_density_below_floor'
        : 'recent_within_day_gap_exceeds_timeframe';

  return {
    status,
    blocking: status === 'unexplained',
    reason,
    policy,
    sample,
  };
}

// Must match the binary format in validation.js (TS_MAGIC / header / record size).
const TS_MAGIC = 'SOVT';
const TS_HEADER_BYTES = 8;      // 4 magic + 4 count (uint32LE)
const TS_RECORD_BYTES = 6 * 8;  // 6 float64: ts_ms, open, high, low, close, volume

// Same path derivation as tsIndexPath() in validation.js.
function binPaths(tsDir, symbol, timeframe) {
  const safe = String(symbol).replace(/[^a-zA-Z0-9_]/g, '_');
  return {
    bin: path.join(tsDir, `${safe}_${timeframe}.bin`),
    meta: path.join(tsDir, `${safe}_${timeframe}.meta.json`),
  };
}

/**
 * readCoverage(tsDir, symbol, timeframe[, now]) -- cheap coverage probe.
 *
 * @returns {{ exists:boolean, count:number, lastBarMs:(number|null), firstBarMs:(number|null), ageMs:(number|null), notFoundCheckedMs:(number|null) }}
 *   exists     -- a valid (bin + meta) pair is present
 *   count      -- number of bars in the bin
 *   lastBarMs  -- epoch ms of the newest bar (bins are stored ascending), or null
 *   firstBarMs -- epoch ms of the oldest bar, or null (one 8-byte head read)
 *   ageMs      -- now - lastBarMs, or null when there is no bar to age
 *
 * Both the first- and last-bar timestamps come from single 8-byte reads at the head
 * and tail of the record section; the full bin is never loaded. This makes the probe
 * a cheap drop-in for any caller that only needs count + coverage span (e.g. the
 * `backend integrity` report), instead of a full readTsIndex materialization.
 */
function readCoverage(tsDir, symbol, timeframe, now = Date.now()) {
  const empty = { exists: false, count: 0, lastBarMs: null, firstBarMs: null, ageMs: null, notFoundCheckedMs: null };
  const { bin, meta } = binPaths(tsDir, symbol, timeframe);
  // An active manifest makes the segment generation part of the canonical view,
  // even when an older .bin exists. Materialize only this opt-in path so coverage
  // cannot claim old canonical rows while newer segment publications are hidden.
  try {
    const { readManifest } = require('./append_only_segments.js');
    if (readManifest(tsDir, symbol, timeframe)) {
      const { readTsIndex } = require('./validation.js');
      const records = readTsIndex(tsDir, symbol, timeframe);
      if (!records || records.length === 0) return { ...empty, exists: true };
      const firstBarMs = Date.parse(records[0].timestamp);
      const last = records[records.length - 1];
      const lastBarMs = Date.parse(last.timestamp);
      return {
        exists: true,
        count: records.length,
        firstBarMs,
        lastBarMs,
        ageMs: Number.isFinite(lastBarMs) ? now - lastBarMs : null,
        notFoundCheckedMs: null,
        provider: last.provider || 'unknown',
        derivedFrom: last.derived_from_timeframe || null,
      };
    }
  } catch (_) {
    // A corrupt active manifest is unavailable coverage, never partial health.
    return empty;
  }
  if (!fs.existsSync(bin)) {
    // The opt-in append-only store has no canonical .bin until compaction. Its
    // manifest already contains the same cheap count/head/tail coverage facts.
    try {
      const { segmentCoverage } = require('./append_only_segments.js');
      const segment = segmentCoverage(tsDir, symbol, timeframe);
      if (segment) {
        return {
          ...segment,
          ageMs: segment.lastBarMs === null ? null : now - segment.lastBarMs,
          notFoundCheckedMs: null,
        };
      }
    } catch (_) { /* retain the canonical empty result if segment metadata is invalid */ }
    // No bin — check for a meta-only "not found" marker written after a 0-bar deep backfill.
    if (fs.existsSync(meta)) {
      try {
        const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
        if (m.last_checked) {
          return { exists: true, count: 0, lastBarMs: null, firstBarMs: null, ageMs: null, notFoundCheckedMs: m.last_checked };
        }
      } catch (_) { /* ignore */ }
    }
    return empty;
  }
  if (!fs.existsSync(meta)) return empty;

  let fd;
  try {
    fd = fs.openSync(bin, 'r');
    const header = Buffer.allocUnsafe(TS_HEADER_BYTES);
    const headRead = fs.readSync(fd, header, 0, TS_HEADER_BYTES, 0);
    if (headRead < TS_HEADER_BYTES || header.toString('ascii', 0, 4) !== TS_MAGIC) return empty;

    const count = header.readUInt32LE(4);
    if (count === 0) return { exists: true, count: 0, lastBarMs: null, firstBarMs: null, ageMs: null, notFoundCheckedMs: null };

    // First record's ts (oldest bar) — 8-byte head read at the start of the record section.
    const firstBuf = Buffer.allocUnsafe(8);
    const firstRead = fs.readSync(fd, firstBuf, 0, 8, TS_HEADER_BYTES);
    const firstBarMs = firstRead >= 8 ? firstBuf.readDoubleLE(0) : null;

    // Last record's first 8 bytes hold its ts_ms; seek straight to it.
    const lastRecOff = TS_HEADER_BYTES + (count - 1) * TS_RECORD_BYTES;
    const tsBuf = Buffer.allocUnsafe(8);
    const tsRead = fs.readSync(fd, tsBuf, 0, 8, lastRecOff);
    if (tsRead < 8) return { exists: true, count, lastBarMs: null, firstBarMs, ageMs: null, notFoundCheckedMs: null };

    const lastBarMs = tsBuf.readDoubleLE(0);
    const ageMs = Number.isFinite(lastBarMs) ? now - lastBarMs : null;
    
    // Parse the sidecar meta file for origin details
    let provider = 'unknown';
    let derivedFrom = null;
    try {
      const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
      if (m.provider) provider = m.provider;
      if (m.derived_from) derivedFrom = m.derived_from;
    } catch (_) { /* ignore */ }

    return { exists: true, count, lastBarMs, firstBarMs, ageMs, notFoundCheckedMs: null, provider, derivedFrom };
  } catch (_) {
    return empty;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
  }
}

function readRecentTimestamps(tsDir, symbol, timeframe, limit = GRAIN_SAMPLE_SIZE) {
  const { bin } = binPaths(tsDir, symbol, timeframe);
  try {
    const { readManifest } = require('./append_only_segments.js');
    if (readManifest(tsDir, symbol, timeframe)) {
      const { readTsIndex } = require('./validation.js');
      const records = readTsIndex(tsDir, symbol, timeframe) || [];
      return records.slice(-Math.max(1, Math.min(4096, Math.floor(limit))))
        .map((record) => Date.parse(record.timestamp))
        .filter(Number.isFinite);
    }
  } catch (_) {
    return [];
  }
  let fd;
  try {
    fd = fs.openSync(bin, 'r');
    const header = Buffer.allocUnsafe(TS_HEADER_BYTES);
    if (fs.readSync(fd, header, 0, TS_HEADER_BYTES, 0) < TS_HEADER_BYTES) return [];
    if (header.toString('ascii', 0, 4) !== TS_MAGIC) return [];

    const count = header.readUInt32LE(4);
    const sampleCount = Math.min(count, Math.max(1, Math.min(4096, Math.floor(limit))));
    if (sampleCount === 0) return [];

    const startRecord = count - sampleCount;
    const buffer = Buffer.allocUnsafe(sampleCount * TS_RECORD_BYTES);
    const bytesRead = fs.readSync(
      fd,
      buffer,
      0,
      buffer.length,
      TS_HEADER_BYTES + startRecord * TS_RECORD_BYTES,
    );
    const timestamps = [];
    for (let offset = 0; offset + 8 <= bytesRead; offset += TS_RECORD_BYTES) {
      const timestamp = buffer.readDoubleLE(offset);
      if (Number.isFinite(timestamp)) timestamps.push(timestamp);
    }
    return timestamps;
  } catch (_) {
    return [];
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
  }
}

function assessGrainIntegrity(tsDir, symbol, timeframe, family, coverage = null) {
  const cov = coverage || readCoverage(tsDir, symbol, timeframe);
  const raw = isGrainSuspect(timeframe, cov.count, cov.firstBarMs, cov.lastBarMs);
  const coverageDetails = {
    count: cov.count,
    first_bar_at: Number.isFinite(cov.firstBarMs) ? new Date(cov.firstBarMs).toISOString() : null,
    last_bar_at: Number.isFinite(cov.lastBarMs) ? new Date(cov.lastBarMs).toISOString() : null,
    provider: cov.provider || null,
    derived_from: cov.derivedFrom || null,
  };
  if (!raw.suspect) {
    return { ...raw, ...coverageDetails, status: 'clear', blocking: false, reason: null };
  }

  const cadence = classifyRecentGrainCadence(
    timeframe,
    family,
    readRecentTimestamps(tsDir, symbol, timeframe),
  );
  return { ...raw, ...coverageDetails, ...cadence };
}

function grainCadencePolicy() {
  return {
    initial_span_days: GRAIN_MIN_SPAN_MS / 86400000,
    initial_calendar_density_floor: { ...GRAIN_DENSITY_FLOOR },
    recent_sample_size: GRAIN_SAMPLE_SIZE,
    session_active_day_floor: { ...GRAIN_SESSION_ACTIVE_DAY_FLOOR },
    max_within_day_gap_multiplier: GRAIN_MAX_GAP_MULTIPLIER,
  };
}

/**
 * isFresh(tsDir, symbol, timeframe, family[, now]) -- staleness gate.
 *
 * Fresh means: the bin exists, has bars, and the newest bar is within the family's
 * freshness threshold for this timeframe (reuses validation.familyFreshnessThresholdMs).
 *
 * @returns {{ fresh:boolean, reason:string, ageMs:(number|null), thresholdMs:(number|null), count:number, lastBarMs:(number|null) }}
 *   reason is one of: 'missing' | 'empty' | 'no-threshold' | 'stale' | 'fresh'.
 *   A null threshold yields fresh=false (reason 'no-threshold') so the daemon errs
 *   toward polling rather than silently skipping a family it can't judge.
 */
function isFresh(tsDir, symbol, timeframe, family, now = Date.now()) {
  const cov = readCoverage(tsDir, symbol, timeframe, now);
  const thresholdMs = familyFreshnessThresholdMs({ family, timeframe });
  if (!cov.exists) return { fresh: false, reason: 'missing', ageMs: null, thresholdMs, count: 0, lastBarMs: null };
  if (cov.count === 0) {
    // Meta-only "not found" marker: symbol was probed, returned 0 bars, retry after 7 days.
    if (cov.notFoundCheckedMs && (now - cov.notFoundCheckedMs) < DEAD_SYMBOL_TTL_MS) {
      const ageMs = now - cov.notFoundCheckedMs;
      return { fresh: true, reason: 'not_found', ageMs, thresholdMs: DEAD_SYMBOL_TTL_MS, count: 0, lastBarMs: null };
    }
    return { fresh: false, reason: 'empty', ageMs: cov.ageMs, thresholdMs, count: cov.count, lastBarMs: cov.lastBarMs };
  }
  if (cov.lastBarMs === null) {
    return { fresh: false, reason: 'empty', ageMs: cov.ageMs, thresholdMs, count: cov.count, lastBarMs: cov.lastBarMs };
  }
  if (thresholdMs === null) {
    return { fresh: false, reason: 'no-threshold', ageMs: cov.ageMs, thresholdMs, count: cov.count, lastBarMs: cov.lastBarMs };
  }
  const fresh = cov.ageMs !== null && cov.ageMs <= thresholdMs;
  return {
    fresh,
    reason: fresh ? 'fresh' : 'stale',
    ageMs: cov.ageMs,
    thresholdMs,
    count: cov.count,
    lastBarMs: cov.lastBarMs,
  };
}

/**
 * summarizeUniverse(tsDir, jobs[, now]) -- coverage rows for a boot/cycle report.
 *
 * @param {Array<{symbol:string, family:string, timeframe:string}>} jobs
 * @returns {Array<{symbol, family, timeframe, exists, count, lastBarMs, ageMs, fresh, reason}>}
 */
function summarizeUniverse(tsDir, jobs, now = Date.now()) {
  if (!Array.isArray(jobs)) return [];
  return jobs.map((j) => {
    const f = isFresh(tsDir, j.symbol, j.timeframe, j.family, now);
    return {
      symbol: j.symbol,
      family: j.family,
      timeframe: j.timeframe,
      exists: f.reason !== 'missing',
      count: f.count,
      lastBarMs: f.lastBarMs,
      ageMs: f.ageMs,
      fresh: f.fresh,
      reason: f.reason,
    };
  });
}

module.exports = {
  readCoverage,
  readRecentTimestamps,
  isFresh,
  summarizeUniverse,
  isGrainSuspect,
  classifyRecentGrainCadence,
  assessGrainIntegrity,
  grainCadencePolicy,
};
