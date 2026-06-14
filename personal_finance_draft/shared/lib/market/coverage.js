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
 * @returns {{ exists:boolean, count:number, lastBarMs:(number|null), ageMs:(number|null) }}
 *   exists    -- a valid (bin + meta) pair is present
 *   count     -- number of bars in the bin
 *   lastBarMs -- epoch ms of the newest bar (bins are stored ascending), or null
 *   ageMs     -- now - lastBarMs, or null when there is no bar to age
 */
function readCoverage(tsDir, symbol, timeframe, now = Date.now()) {
  const empty = { exists: false, count: 0, lastBarMs: null, ageMs: null };
  const { bin, meta } = binPaths(tsDir, symbol, timeframe);
  if (!fs.existsSync(bin) || !fs.existsSync(meta)) return empty;

  let fd;
  try {
    fd = fs.openSync(bin, 'r');
    const header = Buffer.allocUnsafe(TS_HEADER_BYTES);
    const headRead = fs.readSync(fd, header, 0, TS_HEADER_BYTES, 0);
    if (headRead < TS_HEADER_BYTES || header.toString('ascii', 0, 4) !== TS_MAGIC) return empty;

    const count = header.readUInt32LE(4);
    if (count === 0) return { exists: true, count: 0, lastBarMs: null, ageMs: null };

    // Last record's first 8 bytes hold its ts_ms; seek straight to it.
    const lastRecOff = TS_HEADER_BYTES + (count - 1) * TS_RECORD_BYTES;
    const tsBuf = Buffer.allocUnsafe(8);
    const tsRead = fs.readSync(fd, tsBuf, 0, 8, lastRecOff);
    if (tsRead < 8) return { exists: true, count, lastBarMs: null, ageMs: null };

    const lastBarMs = tsBuf.readDoubleLE(0);
    const ageMs = Number.isFinite(lastBarMs) ? now - lastBarMs : null;
    return { exists: true, count, lastBarMs, ageMs };
  } catch (_) {
    return empty;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
  }
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
  if (cov.count === 0 || cov.lastBarMs === null) {
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
  isFresh,
  summarizeUniverse,
};
