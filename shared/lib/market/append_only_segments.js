'use strict';

/**
 * Append-only binary segments for high-write backfills.
 *
 * Segments are immutable publications. A manifest is the sole active generation
 * pointer, and any malformed, missing, or checksum-mismatched active segment is
 * an integrity error rather than an empty read. Compaction retains old files but
 * advances the active generation under one writer lock.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withFileLockSync } = require('../runtime/file_lock.js');
const PROVIDER_PRIORITY = require('./provider_priority.js');

const TS_MAGIC = 'SOVT';
const HEADER_BYTES = 8;
const RECORD_BYTES = 48;
const SEGMENT_VERSION = 1;
const CHECKSUM_CHUNK_BYTES = 64 * 1024;
const MANIFEST_MAX_BYTES = 1024 * 1024;

class SegmentIntegrityError extends Error {
  constructor(reason) {
    super(`segment_integrity_error:${reason}`);
    this.name = 'SegmentIntegrityError';
    this.reason = reason;
  }
}

function safePart(value) { return String(value).replace(/[^a-zA-Z0-9_]/g, '_'); }

function readOpenFlags() {
  return fs.constants.O_RDONLY
    | (fs.constants.O_NOFOLLOW || 0)
    | (fs.constants.O_NONBLOCK || 0);
}

function openRegularFile(filePath, missingReason, allowMissing = false) {
  let fd;
  try {
    fd = fs.openSync(filePath, readOpenFlags());
  } catch (error) {
    if (error && error.code === 'ENOENT' && allowMissing) return null;
    if (error && error.code === 'ENOENT') throw new SegmentIntegrityError(missingReason);
    if (error && error.code === 'ELOOP') throw new SegmentIntegrityError('segment_symlink_rejected');
    throw new SegmentIntegrityError('segment_open_failed');
  }
  try {
    if (!fs.fstatSync(fd).isFile()) throw new SegmentIntegrityError('segment_not_regular_file');
    return fd;
  } catch (error) {
    try { fs.closeSync(fd); } catch (_) { /* best effort */ }
    if (error instanceof SegmentIntegrityError) throw error;
    throw new SegmentIntegrityError('segment_stat_failed');
  }
}

function readExact(fd, buffer, position, reason) {
  let offset = 0;
  while (offset < buffer.length) {
    const bytesRead = fs.readSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead <= 0) throw new SegmentIntegrityError(reason);
    offset += bytesRead;
  }
}

function hashFileDescriptor(fd, size) {
  const hash = crypto.createHash('sha256');
  const chunk = Buffer.allocUnsafe(Math.min(CHECKSUM_CHUNK_BYTES, Math.max(1, size)));
  let position = 0;
  while (position < size) {
    const requested = Math.min(chunk.length, size - position);
    const bytesRead = fs.readSync(fd, chunk, 0, requested, position);
    if (bytesRead <= 0) throw new SegmentIntegrityError('segment_short_read');
    hash.update(chunk.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest('hex');
}

function decodeRecord(buffer, offset, meta) {
  const values = [];
  for (let index = 0; index < 6; index += 1) values.push(buffer.readDoubleLE(offset + index * 8));
  if (!values.every(Number.isFinite)) throw new SegmentIntegrityError('invalid_segment_values');
  const [ms, open, high, low, close, volume] = values;
  let timestamp;
  try {
    timestamp = new Date(ms).toISOString();
  } catch (_) {
    throw new SegmentIntegrityError('invalid_segment_timestamps');
  }
  return {
    family: meta.family,
    provider: meta.provider,
    symbol: meta.symbol,
    timeframe: meta.timeframe,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    coordinate_id: meta.coordinate_id || undefined,
    config_market: meta.config_market || undefined,
    config_sector: meta.config_sector || undefined,
    derived_from_timeframe: meta.derived_from || undefined,
  };
}

function segmentPaths(tsDir, symbol, timeframe) {
  const key = `${safePart(symbol)}_${safePart(timeframe)}`;
  const dir = path.join(tsDir, '.segments', key);
  return { dir, manifest: path.join(dir, 'manifest.json'), lock: path.join(dir, '.write.lock') };
}

function atomicPath(target) {
  return `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
}

function hashBuffer(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function fsyncDirectory(directory) {
  let fd;
  try {
    fd = fs.openSync(directory, 'r');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function publishTempFile(temp, target) {
  fs.renameSync(temp, target);
  fsyncDirectory(path.dirname(target));
}

function normalizedRecords(records) {
  const sorted = [];
  for (const record of records || []) {
    const ms = Date.parse(record.timestamp);
    if (Number.isFinite(ms)) sorted.push({ ms, record });
  }
  sorted.sort((a, b) => a.ms - b.ms);
  const unique = [];
  for (const item of sorted) {
    if (!unique.length || unique[unique.length - 1].ms !== item.ms) unique.push(item);
  }
  return unique;
}

function encodeRecords(items) {
  const buffer = Buffer.allocUnsafe(HEADER_BYTES + items.length * RECORD_BYTES);
  buffer.write(TS_MAGIC, 0, 'ascii');
  buffer.writeUInt32LE(items.length, 4);
  items.forEach(({ ms, record }, index) => {
    const offset = HEADER_BYTES + index * RECORD_BYTES;
    buffer.writeDoubleLE(ms, offset);
    buffer.writeDoubleLE(Number(record.open) || 0, offset + 8);
    buffer.writeDoubleLE(Number(record.high) || 0, offset + 16);
    buffer.writeDoubleLE(Number(record.low) || 0, offset + 24);
    buffer.writeDoubleLE(Number(record.close) || 0, offset + 32);
    buffer.writeDoubleLE(Number(record.volume) || 0, offset + 40);
  });
  return buffer;
}

function assertManifest(manifest, symbol, timeframe) {
  if (!manifest || manifest.version !== SEGMENT_VERSION || !Array.isArray(manifest.segments)) {
    throw new SegmentIntegrityError('invalid_manifest');
  }
  if (manifest.symbol !== symbol || manifest.timeframe !== timeframe) {
    throw new SegmentIntegrityError('manifest_identity_mismatch');
  }
  for (const entry of manifest.segments) {
    if (!entry || !/^[a-zA-Z0-9._-]+\.bin$/.test(String(entry.file || ''))
      || !Number.isInteger(entry.count) || entry.count <= 0
      || !Number.isFinite(entry.first_ms) || !Number.isFinite(entry.last_ms)
      || entry.first_ms > entry.last_ms
      || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))
      || !entry.meta || entry.meta.symbol !== symbol || entry.meta.timeframe !== timeframe) {
      throw new SegmentIntegrityError('invalid_manifest_entry');
    }
  }
  return manifest;
}

function readManifest(tsDir, symbol, timeframe) {
  const { manifest } = segmentPaths(tsDir, symbol, timeframe);
  const fd = openRegularFile(manifest, 'missing_manifest', true);
  if (fd === null) return null;
  try {
    const before = fs.fstatSync(fd);
    if (before.size <= 0 || before.size > MANIFEST_MAX_BYTES) {
      throw new SegmentIntegrityError('invalid_manifest_size');
    }
    const buffer = Buffer.allocUnsafe(before.size);
    readExact(fd, buffer, 0, 'manifest_short_read');
    const after = fs.fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new SegmentIntegrityError('manifest_changed_during_read');
    }
    return assertManifest(JSON.parse(buffer.toString('utf8')), symbol, timeframe);
  } catch (error) {
    if (error instanceof SegmentIntegrityError) throw error;
    throw new SegmentIntegrityError('invalid_manifest');
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* best effort */ }
  }
}

function writeManifest(manifestPath, manifest) {
  const temp = atomicPath(manifestPath);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  publishTempFile(temp, manifestPath);
}

function publishSegment(paths, meta, items) {
  const buffer = encodeRecords(items);
  const digest = hashBuffer(buffer);
  const filename = `segment-${Date.now()}-${process.pid}-${digest.slice(0, 12)}.bin`;
  const target = path.join(paths.dir, filename);
  const temp = atomicPath(target);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  publishTempFile(temp, target);
  return {
    file: filename,
    count: items.length,
    first_ms: items[0].ms,
    last_ms: items[items.length - 1].ms,
    sha256: digest,
    meta: { ...meta },
    created_at: new Date().toISOString(),
  };
}

function appendSegment(tsDir, meta, records) {
  const items = normalizedRecords(records);
  if (!items.length) return { ok: true, appended: false, count: 0 };
  const paths = segmentPaths(tsDir, meta.symbol, meta.timeframe);
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  fsyncDirectory(paths.dir);
  return withFileLockSync(paths.lock, () => {
    const existing = readManifest(tsDir, meta.symbol, meta.timeframe) || {
      version: SEGMENT_VERSION,
      symbol: meta.symbol,
      timeframe: meta.timeframe,
      segments: [],
    };
    const entry = publishSegment(paths, meta, items);
    writeManifest(paths.manifest, { ...existing, segments: [...existing.segments, entry] });
    return { ok: true, appended: true, count: entry.count, file: entry.file, sha256: entry.sha256 };
  }, { timeoutMs: 10000 });
}

function readSegment(filePath, entry) {
  const fd = openRegularFile(filePath, 'missing_segment_file');
  let buffer;
  try {
    const before = fs.fstatSync(fd);
    buffer = Buffer.allocUnsafe(before.size);
    readExact(fd, buffer, 0, 'segment_short_read');
    const after = fs.fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new SegmentIntegrityError('segment_changed_during_read');
    }
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* best effort */ }
  }
  if (hashBuffer(buffer) !== entry.sha256) throw new SegmentIntegrityError('segment_checksum_mismatch');
  if (buffer.length < HEADER_BYTES || buffer.toString('ascii', 0, 4) !== TS_MAGIC) {
    throw new SegmentIntegrityError('invalid_segment_header');
  }
  const count = buffer.readUInt32LE(4);
  if (count !== entry.count || buffer.length !== HEADER_BYTES + count * RECORD_BYTES) {
    throw new SegmentIntegrityError('segment_length_mismatch');
  }
  const meta = entry.meta || {};
  const records = [];
  let priorMs = null;
  for (let index = 0; index < count; index += 1) {
    const offset = HEADER_BYTES + index * RECORD_BYTES;
    const record = decodeRecord(buffer, offset, meta);
    const ms = Date.parse(record.timestamp);
    if (!Number.isFinite(ms) || (priorMs !== null && ms <= priorMs)) {
      throw new SegmentIntegrityError('invalid_segment_timestamps');
    }
    priorMs = ms;
    records.push(record);
  }
  if (!records.length || Date.parse(records[0].timestamp) !== entry.first_ms
    || Date.parse(records[records.length - 1].timestamp) !== entry.last_ms) {
    throw new SegmentIntegrityError('segment_range_mismatch');
  }
  return records;
}

function readLatestSegment(filePath, entry) {
  const fd = openRegularFile(filePath, 'missing_segment_file');
  try {
    const before = fs.fstatSync(fd);
    const expectedBytes = HEADER_BYTES + entry.count * RECORD_BYTES;
    if (before.size !== expectedBytes) throw new SegmentIntegrityError('segment_length_mismatch');
    if (hashFileDescriptor(fd, before.size) !== entry.sha256) {
      throw new SegmentIntegrityError('segment_checksum_mismatch');
    }

    const header = Buffer.allocUnsafe(HEADER_BYTES);
    readExact(fd, header, 0, 'invalid_segment_header');
    if (header.toString('ascii', 0, 4) !== TS_MAGIC || header.readUInt32LE(4) !== entry.count) {
      throw new SegmentIntegrityError('invalid_segment_header');
    }

    const firstTimestamp = Buffer.allocUnsafe(8);
    readExact(fd, firstTimestamp, HEADER_BYTES, 'segment_short_read');
    if (firstTimestamp.readDoubleLE(0) !== entry.first_ms) {
      throw new SegmentIntegrityError('segment_range_mismatch');
    }

    const tailCount = Math.min(2, entry.count);
    const tail = Buffer.allocUnsafe(tailCount * RECORD_BYTES);
    const tailPosition = HEADER_BYTES + (entry.count - tailCount) * RECORD_BYTES;
    readExact(fd, tail, tailPosition, 'segment_short_read');
    const latestOffset = (tailCount - 1) * RECORD_BYTES;
    const record = decodeRecord(tail, latestOffset, entry.meta);
    const latestMs = Date.parse(record.timestamp);
    if (latestMs !== entry.last_ms) throw new SegmentIntegrityError('segment_range_mismatch');
    if (tailCount === 2 && tail.readDoubleLE(0) >= latestMs) {
      throw new SegmentIntegrityError('invalid_segment_timestamps');
    }

    const after = fs.fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new SegmentIntegrityError('segment_changed_during_read');
    }
    return record;
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* best effort */ }
  }
}

function mergeRecords(recordSets) {
  const byTimestamp = new Map();
  for (const records of recordSets) {
    for (const record of records || []) {
      const ms = Date.parse(record.timestamp);
      if (!Number.isFinite(ms)) continue;
      const prior = byTimestamp.get(ms);
      const currentPriority = PROVIDER_PRIORITY[String(record.provider || '').toLowerCase()] || 0;
      const priorPriority = prior
        ? (PROVIDER_PRIORITY[String(prior.provider || '').toLowerCase()] || 0)
        : -1;
      if (!prior || currentPriority >= priorPriority) byTimestamp.set(ms, record);
    }
  }
  return [...byTimestamp.entries()].sort((a, b) => a[0] - b[0]).map(([, record]) => record);
}

function readSegmentsFromManifest(paths, manifest, sinceMs = null) {
  const records = [];
  for (const entry of manifest.segments) {
    const filePath = path.join(paths.dir, entry.file);
    for (const record of readSegment(filePath, entry)) {
      const ms = Date.parse(record.timestamp);
      if (!Number.isFinite(sinceMs) || ms >= sinceMs) records.push(record);
    }
  }
  return mergeRecords([records]);
}

function readSegments(tsDir, symbol, timeframe, sinceMs = null) {
  const manifest = readManifest(tsDir, symbol, timeframe);
  if (!manifest) return null;
  return readSegmentsFromManifest(segmentPaths(tsDir, symbol, timeframe), manifest, sinceMs);
}

function readLatestSegmentsWithMetadata(tsDir, symbol, timeframe) {
  const manifest = readManifest(tsDir, symbol, timeframe);
  if (!manifest) return null;
  if (manifest.segments.length === 0) throw new SegmentIntegrityError('empty_active_generation');
  const paths = segmentPaths(tsDir, symbol, timeframe);
  let latest = null;
  for (const entry of manifest.segments) {
    const record = readLatestSegment(path.join(paths.dir, entry.file), entry);
    if (!latest) {
      latest = record;
      continue;
    }
    const recordMs = Date.parse(record.timestamp);
    const latestMs = Date.parse(latest.timestamp);
    const recordPriority = PROVIDER_PRIORITY[String(record.provider || '').toLowerCase()] || 0;
    const latestPriority = PROVIDER_PRIORITY[String(latest.provider || '').toLowerCase()] || 0;
    if (recordMs > latestMs || (recordMs === latestMs && recordPriority >= latestPriority)) latest = record;
  }
  // Segment ranges may overlap, so summing manifest counts would overstate the
  // unique merged row count. Keep it explicitly unknown on this bounded path.
  return { record: latest, recordCount: null };
}

function readLatestSegments(tsDir, symbol, timeframe) {
  const latest = readLatestSegmentsWithMetadata(tsDir, symbol, timeframe);
  return latest ? latest.record : null;
}

function compactSegments(tsDir, symbol, timeframe) {
  const paths = segmentPaths(tsDir, symbol, timeframe);
  return withFileLockSync(paths.lock, () => {
    const manifest = readManifest(tsDir, symbol, timeframe);
    if (!manifest || manifest.segments.length <= 1) {
      return { ok: true, compacted: false, segments: manifest ? manifest.segments.length : 0 };
    }
    const records = readSegmentsFromManifest(paths, manifest);
    if (!records.length) return { ok: false, error: 'No verified records available for compaction.' };
    const entry = publishSegment(paths, manifest.segments[0].meta || { symbol, timeframe }, normalizedRecords(records));
    writeManifest(paths.manifest, {
      version: SEGMENT_VERSION,
      symbol,
      timeframe,
      segments: [entry],
      compacted_at: new Date().toISOString(),
    });
    return {
      ok: true,
      compacted: true,
      old_segments: manifest.segments.length,
      active_segments: 1,
      retained_files: manifest.segments.map((item) => item.file),
    };
  }, { timeoutMs: 10000 });
}

function segmentCoverage(tsDir, symbol, timeframe) {
  const manifest = readManifest(tsDir, symbol, timeframe);
  if (!manifest) return null;
  const records = readSegmentsFromManifest(segmentPaths(tsDir, symbol, timeframe), manifest);
  if (!records.length) return { exists: true, count: 0, firstBarMs: null, lastBarMs: null };
  const firstBarMs = Date.parse(records[0].timestamp);
  const last = records[records.length - 1];
  return {
    exists: true,
    count: records.length,
    firstBarMs,
    lastBarMs: Date.parse(last.timestamp),
    provider: last.provider || 'unknown',
    derivedFrom: last.derived_from_timeframe || null,
  };
}

module.exports = {
  SegmentIntegrityError,
  appendSegment,
  compactSegments,
  mergeRecords,
  readLatestSegments,
  readLatestSegmentsWithMetadata,
  readManifest,
  readSegments,
  segmentCoverage,
  segmentPaths,
};
