const fs = require('node:fs');
const path = require('node:path');
const {
  refreshFileLockSync,
  withFileLockSync,
} = require('../runtime/file_lock.js');
const PROVIDER_PRIORITY = require('./provider_priority.js');

const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'fx', 'prediction_market']);

// Binary format per file: magic(4) + count(uint32LE) + N×[ts_ms,open,high,low,close,volume](6×float64LE)
// Metadata sidecar: <symbol>_<timeframe>.meta.json — family, provider, coordinate_id, etc.
const TS_MAGIC = 'SOVT';
const TS_RECORD_BYTES = 6 * 8; // 6 float64 fields
const TS_HEADER_BYTES = 8;     // 4 magic + 4 count
const TS_LATEST_READ_RETRIES = 3;
const TS_META_MAX_BYTES = 1024 * 1024;

class TsIndexIntegrityError extends Error {
  constructor(reason) {
    super(`ts_index_integrity_error:${reason}`);
    this.name = 'TsIndexIntegrityError';
    this.reason = reason;
  }
}

class TsIndexRetryError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'TsIndexRetryError';
    this.reason = reason;
  }
}

function latestReadOpenFlags() {
  return fs.constants.O_RDONLY
    | (fs.constants.O_NOFOLLOW || 0)
    | (fs.constants.O_NONBLOCK || 0);
}

function openLatestReadFile(filePath, kind) {
  let fd;
  try {
    fd = fs.openSync(filePath, latestReadOpenFlags());
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    if (error && error.code === 'ELOOP') throw new TsIndexIntegrityError(`${kind}_symlink_rejected`);
    throw new TsIndexIntegrityError(`${kind}_open_failed`);
  }
  try {
    if (!fs.fstatSync(fd).isFile()) throw new TsIndexIntegrityError(`${kind}_not_regular_file`);
    return fd;
  } catch (error) {
    try { fs.closeSync(fd); } catch (_) { /* best effort */ }
    if (error instanceof TsIndexIntegrityError) throw error;
    throw new TsIndexIntegrityError(`${kind}_stat_failed`);
  }
}

function readExactLatest(fd, buffer, position, reason) {
  let offset = 0;
  while (offset < buffer.length) {
    const bytesRead = fs.readSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead <= 0) throw new TsIndexRetryError(reason);
    offset += bytesRead;
  }
}

function readLatestMeta(fd) {
  const stat = fs.fstatSync(fd);
  if (stat.size <= 0 || stat.size > TS_META_MAX_BYTES) {
    throw new TsIndexIntegrityError('invalid_metadata_size');
  }
  const buffer = Buffer.allocUnsafe(stat.size);
  readExactLatest(fd, buffer, 0, 'metadata_short_read');
  try {
    const meta = JSON.parse(buffer.toString('utf8'));
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      throw new Error('metadata must be an object');
    }
    return meta;
  } catch (_) {
    throw new TsIndexIntegrityError('invalid_metadata');
  }
}

function assertLatestReadRequest(tsDir, symbol, timeframe) {
  if (typeof tsDir !== 'string' || tsDir.length === 0
    || typeof symbol !== 'string' || symbol.length === 0 || symbol.length > 128
    || typeof timeframe !== 'string' || !/^[a-zA-Z0-9_]{1,32}$/.test(timeframe)) {
    throw new TsIndexIntegrityError('invalid_read_identity');
  }
}

function decodeLatestRecord(buffer, offset, meta) {
  const values = [];
  for (let index = 0; index < 6; index += 1) values.push(buffer.readDoubleLE(offset + index * 8));
  if (!values.every(Number.isFinite)) throw new TsIndexIntegrityError('invalid_record_values');
  const [ms, open, high, low, close, volume] = values;
  let timestamp;
  try {
    timestamp = new Date(ms).toISOString();
  } catch (_) {
    throw new TsIndexIntegrityError('invalid_record_timestamp');
  }
  return {
    family:                 meta.family,
    provider:               meta.provider,
    symbol:                 meta.symbol,
    timeframe:              meta.timeframe,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    coordinate_id:          meta.coordinate_id || undefined,
    config_market:          meta.config_market || undefined,
    config_sector:          meta.config_sector || undefined,
    derived_from_timeframe: meta.derived_from || undefined,
  };
}

function tsIndexPath(tsDir, symbol, timeframe) {
  const safe = symbol.replace(/[^a-zA-Z0-9_]/g, '_');
  return {
    bin:  path.join(tsDir, `${safe}_${timeframe}.bin`),
    meta: path.join(tsDir, `${safe}_${timeframe}.meta.json`),
  };
}

function atomicTempPath(targetPath) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  return `${targetPath}.${suffix}.tmp`;
}

function renameWithRetry(src, dest, retries = 5, delayMs = 50) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      if (error.code === 'ENOENT') {
        try { fs.mkdirSync(path.dirname(dest), { recursive: true }); } catch (_) { /* retry below */ }
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

function tsWriteLockPath(tsDir, symbol, timeframe) {
  return `${tsIndexPath(tsDir, symbol, timeframe).bin}.write.lock`;
}

function tsWriteLockOptions() {
  return {
    timeoutMs: process.env.SOVEREIGN_TS_WRITE_LOCK_TIMEOUT_MS,
    staleMs: process.env.SOVEREIGN_TS_WRITE_LOCK_STALE_MS,
  };
}

function requireTsWriteLock(lockHandle) {
  if (refreshFileLockSync(lockHandle)) return;
  const error = new Error(`Lost ownership of time-series write lock: ${lockHandle?.path || 'unknown'}`);
  error.code = 'ELOCKLOST';
  throw error;
}

function encodeTsRecords(records) {
  const buffer = Buffer.allocUnsafe(records.length * TS_RECORD_BYTES);
  for (let index = 0; index < records.length; index += 1) {
    const { ms, r } = records[index];
    const offset = index * TS_RECORD_BYTES;
    buffer.writeDoubleLE(ms, offset);
    buffer.writeDoubleLE(Number(r.open) || 0, offset + 8);
    buffer.writeDoubleLE(Number(r.high) || 0, offset + 16);
    buffer.writeDoubleLE(Number(r.low) || 0, offset + 24);
    buffer.writeDoubleLE(Number(r.close) || 0, offset + 32);
    buffer.writeDoubleLE(Number(r.volume) || 0, offset + 40);
  }
  return buffer;
}

function tryAppendBin(bin, metaPath, meta, incoming) {
  if (incoming.length === 0 || !fs.existsSync(bin) || !fs.existsSync(metaPath)) return false;

  try {
    JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (_) {
    return false;
  }

  let fd;
  try {
    fd = fs.openSync(bin, 'r+');
    const header = Buffer.allocUnsafe(TS_HEADER_BYTES);
    if (fs.readSync(fd, header, 0, header.length, 0) !== header.length) return false;
    if (header.toString('ascii', 0, 4) !== TS_MAGIC) return false;

    const existingCount = header.readUInt32LE(4);
    const expectedBytes = TS_HEADER_BYTES + existingCount * TS_RECORD_BYTES;
    if (fs.fstatSync(fd).size < expectedBytes) return false;

    if (existingCount > 0) {
      const lastTimestamp = Buffer.allocUnsafe(8);
      const lastOffset = TS_HEADER_BYTES + (existingCount - 1) * TS_RECORD_BYTES;
      if (fs.readSync(fd, lastTimestamp, 0, 8, lastOffset) !== 8) return false;
      if (incoming[0].ms <= lastTimestamp.readDoubleLE(0)) return false;
    }

    const encoded = encodeTsRecords(incoming);
    fs.writeSync(fd, encoded, 0, encoded.length, expectedBytes);
    fs.ftruncateSync(fd, expectedBytes + encoded.length);
    fs.fsyncSync(fd);

    const countBuffer = Buffer.allocUnsafe(4);
    const count = existingCount + incoming.length;
    countBuffer.writeUInt32LE(count, 0);
    fs.writeSync(fd, countBuffer, 0, countBuffer.length, 4);
    fs.fsyncSync(fd);

    const tempMeta = atomicTempPath(metaPath);
    fs.writeFileSync(tempMeta, JSON.stringify({ ...meta, count }), 'utf8');
    renameWithRetry(tempMeta, metaPath);
    return true;
  } catch (_) {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) { /* Best effort after a failed append. */ }
    }
  }
}

function mergeWriteBinUnlocked(tsDir, meta, incoming, lockHandle) {
  const inc = [];
  for (const r of incoming) {
    const ms = Date.parse(r.timestamp);
    if (Number.isFinite(ms)) inc.push({ ms, r });
  }
  inc.sort((a, b) => a.ms - b.ms);
  const incDedup = [];
  let prevMs = null;
  for (const x of inc) {
    if (x.ms !== prevMs) { incDedup.push(x); prevMs = x.ms; }
  }

  const { bin, meta: metaPath } = tsIndexPath(tsDir, meta.symbol, meta.timeframe);

  requireTsWriteLock(lockHandle);
  if (tryAppendBin(bin, metaPath, meta, incDedup)) return;

  let existBuf = null;
  let existCount = 0;
  let existProvider = '';
  if (fs.existsSync(bin) && fs.existsSync(metaPath)) {
    const b = fs.readFileSync(bin);
    if (b.length >= TS_HEADER_BYTES && b.toString('ascii', 0, 4) === TS_MAGIC) {
      const c = b.readUInt32LE(4);
      if (b.length >= TS_HEADER_BYTES + c * TS_RECORD_BYTES) { existBuf = b; existCount = c; }
    }
    try { existProvider = (JSON.parse(fs.readFileSync(metaPath, 'utf8')).provider) || ''; } catch (_) { /* keep '' */ }
  }

  const existingPriority = PROVIDER_PRIORITY[existProvider] ?? 0;
  const incomingPriority = PROVIDER_PRIORITY[meta.provider] ?? 0;
  const existingWinsOnTie = existingPriority > incomingPriority;

  const maxCount = existCount + incDedup.length;
  const out = Buffer.allocUnsafe(TS_HEADER_BYTES + maxCount * TS_RECORD_BYTES);
  let w = 0;

  const copyExisting = (k) => {
    const src = TS_HEADER_BYTES + k * TS_RECORD_BYTES;
    existBuf.copy(out, TS_HEADER_BYTES + w * TS_RECORD_BYTES, src, src + TS_RECORD_BYTES);
    w += 1;
  };
  const writeIncoming = (x) => {
    const off = TS_HEADER_BYTES + w * TS_RECORD_BYTES;
    out.writeDoubleLE(x.ms, off);
    out.writeDoubleLE(Number(x.r.open)   || 0, off + 8);
    out.writeDoubleLE(Number(x.r.high)   || 0, off + 16);
    out.writeDoubleLE(Number(x.r.low)    || 0, off + 24);
    out.writeDoubleLE(Number(x.r.close)  || 0, off + 32);
    out.writeDoubleLE(Number(x.r.volume) || 0, off + 40);
    w += 1;
  };
  const existMs = (k) => existBuf.readDoubleLE(TS_HEADER_BYTES + k * TS_RECORD_BYTES);

  let i = 0;
  let j = 0;
  let recordsSinceLockRefresh = 0;
  const checkpointLock = (processed = 1) => {
    recordsSinceLockRefresh += processed;
    if (recordsSinceLockRefresh < 100_000) return;
    requireTsWriteLock(lockHandle);
    recordsSinceLockRefresh = 0;
  };
  while (i < existCount && j < incDedup.length) {
    const em = existMs(i);
    const im = incDedup[j].ms;
    if (em === im) {
      if (existingWinsOnTie) copyExisting(i); else writeIncoming(incDedup[j]);
      i += 1; j += 1; checkpointLock(2);
    } else if (em < im) {
      copyExisting(i); i += 1; checkpointLock();
    } else {
      writeIncoming(incDedup[j]); j += 1; checkpointLock();
    }
  }
  while (i < existCount) { copyExisting(i); i += 1; checkpointLock(); }
  while (j < incDedup.length) { writeIncoming(incDedup[j]); j += 1; checkpointLock(); }

  const count = w;
  out.write(TS_MAGIC, 0, 'ascii');
  out.writeUInt32LE(count, 4);
  const finalBuf = out.subarray(0, TS_HEADER_BYTES + count * TS_RECORD_BYTES);

  requireTsWriteLock(lockHandle);
  const tmpBin = atomicTempPath(bin);
  const tmpMeta = atomicTempPath(metaPath);
  fs.writeFileSync(tmpBin, finalBuf);
  renameWithRetry(tmpBin, bin);
  fs.writeFileSync(tmpMeta, JSON.stringify({ ...meta, count }), 'utf8');
  renameWithRetry(tmpMeta, metaPath);
}

function mergeWriteBin(tsDir, meta, incoming) {
  const lockPath = tsWriteLockPath(tsDir, meta.symbol, meta.timeframe);
  return withFileLockSync(
    lockPath,
    (lockHandle) => mergeWriteBinUnlocked(tsDir, meta, incoming, lockHandle),
    tsWriteLockOptions(),
  );
}

function writeTsIndex(tsDir, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.sources)) return;
  fs.mkdirSync(tsDir, { recursive: true });

  const groups = new Map();
  for (const s of snapshot.sources) {
    if (!OHLCV_FAMILIES.has(s.family)) continue;
    if (!s.symbol || !s.timeframe || !s.timestamp) continue;
    const key = `${s.symbol}\0${s.timeframe}`;
    if (!groups.has(key)) groups.set(key, { records: [], meta: null });
    const g = groups.get(key);
    g.records.push(s);
    if (!g.meta) {
      g.meta = {
        symbol: s.symbol,
        timeframe: s.timeframe,
        family: s.family,
        provider: s.provider || '',
        coordinate_id: s.coordinate_id || '',
        config_market: s.config_market || '',
        config_sector: s.config_sector || '',
        ...(s.derived_from_timeframe ? { derived_from: s.derived_from_timeframe } : {}),
      };
    }
  }

  if (process.env.SOVEREIGN_TS_STORAGE === 'segments') {
    const { appendSegment } = require('./append_only_segments.js');
    for (const [, { records, meta }] of groups) {
      if (!meta || records.length === 0) continue;
      appendSegment(tsDir, meta, records);
    }
    return;
  }

  for (const [, { records, meta }] of groups) {
    if (!meta || records.length === 0) continue;
    mergeWriteBin(tsDir, meta, records);
  }
}

function readCanonicalTsIndex(tsDir, symbol, timeframe) {
  const { bin, meta: metaPath } = tsIndexPath(tsDir, symbol, timeframe);
  if (!fs.existsSync(bin) || !fs.existsSync(metaPath)) return null;

  const buf = fs.readFileSync(bin);
  if (buf.length < TS_HEADER_BYTES) return null;
  if (buf.toString('ascii', 0, 4) !== TS_MAGIC) return null;

  const count = buf.readUInt32LE(4);
  if (buf.length < TS_HEADER_BYTES + count * TS_RECORD_BYTES) return null;

  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) { return null; }

  const records = [];
  for (let i = 0; i < count; i++) {
    const off = TS_HEADER_BYTES + i * TS_RECORD_BYTES;
    const ts = buf.readDoubleLE(off);
    records.push({
      family:                 meta.family,
      provider:               meta.provider,
      symbol:                 meta.symbol,
      timeframe:              meta.timeframe,
      timestamp:              new Date(ts).toISOString(),
      open:                   buf.readDoubleLE(off + 8),
      high:                   buf.readDoubleLE(off + 16),
      low:                    buf.readDoubleLE(off + 24),
      close:                  buf.readDoubleLE(off + 32),
      volume:                 buf.readDoubleLE(off + 40),
      coordinate_id:          meta.coordinate_id || undefined,
      config_market:          meta.config_market || undefined,
      config_sector:          meta.config_sector || undefined,
      derived_from_timeframe: meta.derived_from || undefined,
    });
  }
  return records;
}

function mergeCanonicalAndSegments(canonical, segments) {
  if (!canonical) return segments;
  if (!segments) return canonical;
  const { mergeRecords } = require('./append_only_segments.js');
  return mergeRecords([canonical, segments]);
}

function readTsIndex(tsDir, symbol, timeframe) {
  const canonical = readCanonicalTsIndex(tsDir, symbol, timeframe);
  const { readSegments } = require('./append_only_segments.js');
  const segments = readSegments(tsDir, symbol, timeframe);
  return mergeCanonicalAndSegments(canonical, segments);
}

function readLatestCanonicalOnce(tsDir, symbol, timeframe) {
  const { bin, meta: metaPath } = tsIndexPath(tsDir, symbol, timeframe);
  let binFd;
  let metaFd;
  try {
    binFd = openLatestReadFile(bin, 'canonical_bin');
    metaFd = openLatestReadFile(metaPath, 'canonical_meta');
    if (binFd === null && metaFd === null) return null;
    if (metaFd === null) throw new TsIndexIntegrityError('missing_canonical_metadata');

    const meta = readLatestMeta(metaFd);
    if (meta.symbol !== symbol || meta.timeframe !== timeframe) {
      throw new TsIndexIntegrityError('canonical_identity_mismatch');
    }
    if (binFd === null) {
      if (meta.count === 0 && Number.isFinite(meta.last_checked)) return null;
      throw new TsIndexIntegrityError('missing_canonical_bin');
    }

    const before = fs.fstatSync(binFd);
    const header = Buffer.allocUnsafe(TS_HEADER_BYTES);
    readExactLatest(binFd, header, 0, 'canonical_header_short_read');
    if (header.toString('ascii', 0, 4) !== TS_MAGIC) {
      throw new TsIndexIntegrityError('invalid_canonical_header');
    }
    const count = header.readUInt32LE(4);
    if (!Number.isInteger(meta.count) || meta.count !== count) {
      throw new TsIndexRetryError('canonical_metadata_count_mismatch');
    }
    const expectedBytes = TS_HEADER_BYTES + count * TS_RECORD_BYTES;
    if (before.size !== expectedBytes) throw new TsIndexRetryError('canonical_length_mismatch');
    if (count === 0) {
      const after = fs.fstatSync(binFd);
      const stableHeader = Buffer.allocUnsafe(TS_HEADER_BYTES);
      readExactLatest(binFd, stableHeader, 0, 'canonical_header_short_read');
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs
        || !stableHeader.equals(header)) {
        throw new TsIndexRetryError('canonical_changed_during_read');
      }
      return null;
    }

    const tailCount = Math.min(2, count);
    const tail = Buffer.allocUnsafe(tailCount * TS_RECORD_BYTES);
    const tailPosition = TS_HEADER_BYTES + (count - tailCount) * TS_RECORD_BYTES;
    readExactLatest(binFd, tail, tailPosition, 'canonical_tail_short_read');
    const latestOffset = (tailCount - 1) * TS_RECORD_BYTES;
    const record = decodeLatestRecord(tail, latestOffset, meta);
    const latestMs = Date.parse(record.timestamp);
    if (tailCount === 2 && tail.readDoubleLE(0) >= latestMs) {
      throw new TsIndexIntegrityError('non_monotonic_canonical_tail');
    }

    const after = fs.fstatSync(binFd);
    const stableHeader = Buffer.allocUnsafe(TS_HEADER_BYTES);
    readExactLatest(binFd, stableHeader, 0, 'canonical_header_short_read');
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || !stableHeader.equals(header)) {
      throw new TsIndexRetryError('canonical_changed_during_read');
    }
    return { record, recordCount: count };
  } catch (error) {
    if (error instanceof TsIndexIntegrityError || error instanceof TsIndexRetryError) throw error;
    throw new TsIndexIntegrityError('canonical_read_failed');
  } finally {
    if (binFd !== null && binFd !== undefined) {
      try { fs.closeSync(binFd); } catch (_) { /* best effort */ }
    }
    if (metaFd !== null && metaFd !== undefined) {
      try { fs.closeSync(metaFd); } catch (_) { /* best effort */ }
    }
  }
}

function readLatestCanonical(tsDir, symbol, timeframe) {
  let retryReason = null;
  for (let attempt = 0; attempt < TS_LATEST_READ_RETRIES; attempt += 1) {
    try {
      return readLatestCanonicalOnce(tsDir, symbol, timeframe);
    } catch (error) {
      if (!(error instanceof TsIndexRetryError)) throw error;
      retryReason = error.reason;
    }
  }
  throw new TsIndexIntegrityError(retryReason || 'canonical_unstable');
}

function readLatestTsRecord(tsDir, symbol, timeframe) {
  assertLatestReadRequest(tsDir, symbol, timeframe);
  const canonical = readLatestCanonical(tsDir, symbol, timeframe);
  const { readLatestSegmentsWithMetadata } = require('./append_only_segments.js');
  const segments = readLatestSegmentsWithMetadata(tsDir, symbol, timeframe);
  if (!canonical && !segments) return null;
  if (!segments) return { ...canonical, sourceMode: 'canonical' };
  if (!canonical) return { ...segments, sourceMode: 'segments' };

  const canonicalMs = Date.parse(canonical.record.timestamp);
  const segmentMs = Date.parse(segments.record.timestamp);
  let record = canonical.record;
  if (segmentMs > canonicalMs) {
    record = segments.record;
  } else if (segmentMs === canonicalMs) {
    const canonicalPriority = PROVIDER_PRIORITY[String(canonical.record.provider || '').toLowerCase()] || 0;
    const segmentPriority = PROVIDER_PRIORITY[String(segments.record.provider || '').toLowerCase()] || 0;
    if (segmentPriority >= canonicalPriority) record = segments.record;
  }
  return { record, recordCount: null, sourceMode: 'merged' };
}

function readCanonicalTsIndexSince(tsDir, symbol, timeframe, sinceMs) {
  if (!Number.isFinite(sinceMs)) return readTsIndex(tsDir, symbol, timeframe);
  const { bin, meta: metaPath } = tsIndexPath(tsDir, symbol, timeframe);
  if (!fs.existsSync(bin) || !fs.existsSync(metaPath)) return null;

  const buf = fs.readFileSync(bin);
  if (buf.length < TS_HEADER_BYTES) return null;
  if (buf.toString('ascii', 0, 4) !== TS_MAGIC) return null;

  const count = buf.readUInt32LE(4);
  if (buf.length < TS_HEADER_BYTES + count * TS_RECORD_BYTES) return null;

  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) { return null; }

  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const ms = buf.readDoubleLE(TS_HEADER_BYTES + mid * TS_RECORD_BYTES);
    if (ms < sinceMs) lo = mid + 1; else hi = mid;
  }

  const records = [];
  for (let i = lo; i < count; i++) {
    const off = TS_HEADER_BYTES + i * TS_RECORD_BYTES;
    const ts = buf.readDoubleLE(off);
    records.push({
      family:                 meta.family,
      provider:               meta.provider,
      symbol:                 meta.symbol,
      timeframe:              meta.timeframe,
      timestamp:              new Date(ts).toISOString(),
      open:                   buf.readDoubleLE(off + 8),
      high:                   buf.readDoubleLE(off + 16),
      low:                    buf.readDoubleLE(off + 24),
      close:                  buf.readDoubleLE(off + 32),
      volume:                 buf.readDoubleLE(off + 40),
      coordinate_id:          meta.coordinate_id || undefined,
      config_market:          meta.config_market || undefined,
      config_sector:          meta.config_sector || undefined,
      derived_from_timeframe: meta.derived_from || undefined,
    });
  }
  return records;
}

function readTsIndexSince(tsDir, symbol, timeframe, sinceMs) {
  if (!Number.isFinite(sinceMs)) return readTsIndex(tsDir, symbol, timeframe);
  const canonical = readCanonicalTsIndexSince(tsDir, symbol, timeframe, sinceMs);
  const { readSegments } = require('./append_only_segments.js');
  const segments = readSegments(tsDir, symbol, timeframe, sinceMs);
  return mergeCanonicalAndSegments(canonical, segments);
}

module.exports = {
  OHLCV_FAMILIES,
  TsIndexIntegrityError,
  TsIndexRetryError,
  tsWriteLockPath,
  mergeWriteBin,
  writeTsIndex,
  readTsIndex,
  readLatestTsRecord,
  readTsIndexSince,
  tsIndexPath,
  atomicTempPath,
  renameWithRetry,
};
