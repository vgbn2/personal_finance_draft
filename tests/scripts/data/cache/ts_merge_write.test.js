'use strict';

// ts-index streaming merge-write: equivalence + the actual OOM regression.
//
// writeTsIndex used to read the WHOLE existing bin into JS objects (millions for a deep
// 1m crypto bin) just to merge-protect it before writing — at backfill concurrency that
// exhausted the V8 heap (OOM). It now merges on the binary Buffer directly (mergeWriteBin),
// keeping heap flat regardless of bin depth.
//
// Two guarantees are pinned here:
//   1. EQUIVALENCE — the new merge is byte-for-byte identical (bin AND meta) to a FROZEN
//      reference transcription of the original object-based merge (`referenceWriteTsIndex`
//      below), across every precedence / overlap / dedup scenario, on synthetic AND real
//      bins. The frozen reference is durable: it never changes, needs no git, and is small
//      enough to review. A separate skip-safe test cross-checks it against the genuine
//      git-HEAD original *while this change is still uncommitted*, proving the transcription
//      is faithful without coupling the permanent suite to git state.
//   2. NO-MATERIALIZATION — under a tight --max-old-space-size, a child running the NEW
//      merge against a deep bin completes; a skip-safe companion shows the ORIGINAL merge
//      OOMs under the identical cap (the regression was real).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const REPO = path.resolve(__dirname, '../../../../'); // personal_finance_draft
const NEW_MODULE = require.resolve('../../../../shared/lib/market/validation.js');
const { writeTsIndex, readTsIndex, tsWriteLockPath } = require(NEW_MODULE);
const {
  acquireFileLockSync,
  releaseFileLockSync,
} = require('../../../../shared/lib/runtime/file_lock.js');

const TS_MAGIC = 'SOVT';
const TS_RECORD_BYTES = 48;
const TS_HEADER_BYTES = 8;
const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'fx', 'prediction_market']);
const PROVIDER_PRIORITY = { binance: 3, alpaca: 3, yahoo: 1, twelvedata: 1, frankfurter: 1, ecb: 1 };

// ===========================================================================================
// FROZEN GOLDEN REFERENCE — a verbatim transcription of the ORIGINAL object-based
// writeTsIndex (the pre-mergeWriteBin implementation). Do NOT "optimize" this; its entire
// value is that it is the old behavior, frozen. readTsIndex is unchanged by the refactor,
// so reusing it here is faithful. Faithfulness vs the genuine git-HEAD original is asserted
// by the skip-safe cross-check test below while this work is uncommitted.
// ===========================================================================================
function referenceWriteTsIndex(tsDir, snapshot) {
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
        symbol: s.symbol, timeframe: s.timeframe, family: s.family,
        provider: s.provider || '', coordinate_id: s.coordinate_id || '',
        config_market: s.config_market || '', config_sector: s.config_sector || '',
        ...(s.derived_from_timeframe ? { derived_from: s.derived_from_timeframe } : {}),
      };
    }
  }

  for (const [, { records, meta }] of groups) {
    if (!meta || records.length === 0) continue;
    {
      const existing = readTsIndex(tsDir, meta.symbol, meta.timeframe);
      if (existing && existing.length > 0) {
        const existingPriority = PROVIDER_PRIORITY[existing[0]?.provider] ?? 0;
        const incomingPriority = PROVIDER_PRIORITY[meta.provider] ?? 0;
        if (existingPriority > incomingPriority) {
          const existingMs = new Set();
          for (const r of existing) { const ms = Date.parse(r.timestamp); if (Number.isFinite(ms)) existingMs.add(ms); }
          const gapRecords = records.filter((r) => { const ms = Date.parse(r.timestamp); return Number.isFinite(ms) && !existingMs.has(ms); });
          records.length = 0;
          records.push(...existing, ...gapRecords);
        } else {
          const newMs = new Set();
          for (const r of records) { const ms = Date.parse(r.timestamp); if (Number.isFinite(ms)) newMs.add(ms); }
          for (const r of existing) { const ms = Date.parse(r.timestamp); if (Number.isFinite(ms) && !newMs.has(ms)) records.push(r); }
        }
      }
    }

    records.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    const seen = new Set();
    const deduped = records.filter((r) => {
      const ms = Date.parse(r.timestamp);
      if (!Number.isFinite(ms) || seen.has(ms)) return false;
      seen.add(ms);
      return true;
    });

    const count = deduped.length;
    const buf = Buffer.allocUnsafe(TS_HEADER_BYTES + count * TS_RECORD_BYTES);
    buf.write(TS_MAGIC, 0, 'ascii');
    buf.writeUInt32LE(count, 4);
    for (let i = 0; i < count; i++) {
      const r = deduped[i];
      const off = TS_HEADER_BYTES + i * TS_RECORD_BYTES;
      buf.writeDoubleLE(Date.parse(r.timestamp), off);
      buf.writeDoubleLE(Number(r.open) || 0, off + 8);
      buf.writeDoubleLE(Number(r.high) || 0, off + 16);
      buf.writeDoubleLE(Number(r.low) || 0, off + 24);
      buf.writeDoubleLE(Number(r.close) || 0, off + 32);
      buf.writeDoubleLE(Number(r.volume) || 0, off + 40);
    }

    const safe = meta.symbol.replace(/[^a-zA-Z0-9_]/g, '_');
    const bin = path.join(tsDir, `${safe}_${meta.timeframe}.bin`);
    const metaPath = path.join(tsDir, `${safe}_${meta.timeframe}.meta.json`);
    const tag = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    fs.writeFileSync(`${bin}.${tag}.tmp`, buf);
    fs.renameSync(`${bin}.${tag}.tmp`, bin);
    fs.writeFileSync(`${metaPath}.${tag}.tmp`, JSON.stringify({ ...meta, count }), 'utf8');
    fs.renameSync(`${metaPath}.${tag}.tmp`, metaPath);
  }
}

// ---- Skip-safe access to the genuine git-HEAD original (only while uncommitted). ----
// Returns a require()-able module path, or null if git is unavailable OR HEAD already
// contains the refactored merge (i.e. this work is committed). validation.js needs only
// node:fs / node:path, so it loads from a temp path.
let _gitOriginal; // undefined = not yet tried; null = unavailable; string = path
function gitOriginalModulePath() {
  if (_gitOriginal !== undefined) return _gitOriginal;
  try {
    const src = cp.execSync('git show HEAD:./shared/lib/market/validation.js', { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    if (/mergeWriteBin|readTsIndexSince/.test(src)) { _gitOriginal = null; return _gitOriginal; }
    const p = path.join(os.tmpdir(), `val_gitorig_${process.pid}.js`);
    fs.writeFileSync(p, src);
    process.on('exit', () => { try { fs.rmSync(p); } catch (_) { /* best effort */ } });
    _gitOriginal = p;
  } catch (_) {
    _gitOriginal = null;
  }
  return _gitOriginal;
}
const GIT_ORIGINAL = gitOriginalModulePath();
const SKIP_GIT = GIT_ORIGINAL ? false : 'git-HEAD original merge not reachable (work committed or git unavailable) — frozen reference is the durable golden';

// ---- Helpers ----
function rec(symbol, provider, tf, ms, base) {
  return {
    symbol, family: 'crypto', provider, timeframe: tf,
    timestamp: new Date(ms).toISOString(),
    open: base, high: base + 1, low: base - 1, close: base + 0.5, volume: base * 2,
  };
}
function tmp(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), `tsmerge-${tag}-`)); }
function filePath(tsDir, sym, tf, ext) {
  return path.join(tsDir, `${sym.replace(/[^a-zA-Z0-9_]/g, '_')}_${tf}${ext}`);
}
function readBytes(p) { return fs.existsSync(p) ? fs.readFileSync(p) : null; }

let _writerChildPath;
function writerChildPath() {
  if (_writerChildPath) return _writerChildPath;
  _writerChildPath = path.join(os.tmpdir(), `ts_writer_child_${process.pid}.js`);
  fs.writeFileSync(_writerChildPath, `
    const fs = require('node:fs');
    const { writeTsIndex } = require(process.argv[2]);
    const tsDir = process.argv[3];
    const barrier = process.argv[4];
    const sources = JSON.parse(Buffer.from(process.argv[5], 'base64url').toString('utf8'));
    while (barrier !== '-' && !fs.existsSync(barrier)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
    writeTsIndex(tsDir, { sources });
    process.stdout.write(JSON.stringify({ ok: true, pid: process.pid, rows: sources.length }));
  `);
  process.on('exit', () => { try { fs.rmSync(_writerChildPath); } catch { /* best effort */ } });
  return _writerChildPath;
}

function spawnWriter(tsDir, sources, barrier = '-') {
  const encoded = Buffer.from(JSON.stringify(sources), 'utf8').toString('base64url');
  const child = cp.spawn(process.execPath, [writerChildPath(), NEW_MODULE, tsDir, barrier, encoded], {
    env: {
      ...process.env,
      SOVEREIGN_TS_WRITE_LOCK_TIMEOUT_MS: '5000',
      SOVEREIGN_TS_WRITE_LOCK_STALE_MS: '60000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, completed };
}

function assertTimestampUnion(tsDir, expectedCount) {
  const rows = readTsIndex(tsDir, 'BTCUSDT', '1m');
  assert.equal(rows.length, expectedCount);
  assert.equal(new Set(rows.map((row) => row.timestamp)).size, expectedCount, 'no timestamp was lost or duplicated');
  const meta = JSON.parse(fs.readFileSync(filePath(tsDir, 'BTCUSDT', '1m', '.meta.json'), 'utf8'));
  assert.equal(meta.count, expectedCount, 'metadata count matches the serialized bin');
  assert.equal(fs.existsSync(tsWriteLockPath(tsDir, 'BTCUSDT', '1m')), false, 'write lock is released');
  return rows;
}

// Seed both dirs with byte-identical initial bins (write via the reference, mirror to the
// new dir), so the only thing compared is the MERGE of `incoming`.
function seedBoth(seedSources) {
  const a = tmp('ref'); const b = tmp('new');
  if (seedSources && seedSources.length) {
    referenceWriteTsIndex(a, { sources: seedSources });
    for (const s of seedSources) {
      for (const ext of ['.bin', '.meta.json']) {
        const src = filePath(a, s.symbol, s.timeframe, ext);
        if (fs.existsSync(src)) fs.copyFileSync(src, filePath(b, s.symbol, s.timeframe, ext));
      }
    }
  }
  return { a, b };
}

// Apply `incoming` via reference and new writeTsIndex; assert identical bin + meta bytes.
function assertEquivalent(label, seedSources, incoming, writeRef = referenceWriteTsIndex) {
  const { a, b } = seedBoth(seedSources);
  writeRef(a, { sources: incoming });
  writeTsIndex(b, { sources: incoming });
  const keys = new Set(incoming.map((s) => `${s.symbol} ${s.timeframe}`));
  let checked = 0;
  for (const key of keys) {
    const [sym, tf] = key.split(' ');
    const binA = readBytes(filePath(a, sym, tf, '.bin'));
    const binB = readBytes(filePath(b, sym, tf, '.bin'));
    assert.ok(binA && binB, `${label}: ${sym} ${tf} both bins exist`);
    assert.ok(binA.equals(binB), `${label}: ${sym} ${tf} BIN bytes identical (ref=${binA.length} new=${binB.length})`);
    assert.ok(readBytes(filePath(a, sym, tf, '.meta.json')).equals(readBytes(filePath(b, sym, tf, '.meta.json'))), `${label}: ${sym} ${tf} META bytes identical`);
    checked += 1;
  }
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
  return checked;
}

const M = (s) => Date.parse('2026-06-01T00:00:00Z') + s * 60000; // minute offsets
const seedN = (n, baseOff = 0, prov = 'binance') =>
  Array.from({ length: n }, (_, k) => rec('BTCUSDT', prov, '1m', M(k), 100 + baseOff + k));

// Scenario table reused for both the reference equivalence AND the git-original cross-check.
const SCENARIOS = [
  ['new_bin', null, () => seedN(5)],
  ['pure_append', () => seedN(5), () => [5, 6, 7].map((k) => rec('BTCUSDT', 'binance', '1m', M(k), 200 + k))],
  ['full_overlap', () => seedN(5), () => [0, 1, 2, 3, 4].map((k) => rec('BTCUSDT', 'binance', '1m', M(k), 900 + k))],
  ['partial_overlap', () => seedN(6), () => [3, 4, 5, 6, 7].map((k) => rec('BTCUSDT', 'binance', '1m', M(k), 500 + k))],
  ['gapfill', () => seedN(5, 0, 'binance'), () => [2, 3, 4, 5, 6].map((k) => rec('BTCUSDT', 'yahoo', '1m', M(k), 700 + k))],
  ['lowexist', () => seedN(5, 0, 'yahoo'), () => [2, 3, 4, 5, 6].map((k) => rec('BTCUSDT', 'binance', '1m', M(k), 800 + k))],
  ['unsorted_dups', () => seedN(3), () => [
    rec('BTCUSDT', 'binance', '1m', M(5), 305),
    rec('BTCUSDT', 'binance', '1m', M(2), 302),
    rec('BTCUSDT', 'binance', '1m', M(5), 999), // dup ms -> keep-first
    rec('BTCUSDT', 'binance', '1m', M(3), 303),
  ]],
  ['invalid_ts', () => seedN(2), () => {
    const bad = rec('BTCUSDT', 'binance', '1m', M(2), 102); bad.timestamp = 'not-a-date';
    return [bad, rec('BTCUSDT', 'binance', '1m', M(3), 103)];
  }],
  ['multi_group', () => [
    ...Array.from({ length: 4 }, (_, k) => rec('BTCUSDT', 'binance', '1m', M(k), 100 + k)),
    ...Array.from({ length: 4 }, (_, k) => rec('ETHUSDT', 'binance', '5m', M(k * 5), 50 + k)),
  ], () => [
    ...[2, 3, 4, 5].map((k) => rec('BTCUSDT', 'binance', '1m', M(k), 600 + k)),
    ...[2, 3, 4, 5].map((k) => rec('ETHUSDT', 'binance', '5m', M(k * 5), 70 + k)),
  ]],
];

for (const [name, seedFn, incFn] of SCENARIOS) {
  test(`EQUIV ${name}: new merge == frozen reference (bin + meta)`, () => {
    assertEquivalent(name, seedFn && seedFn(), incFn());
  });
}

test('pure append does not read or rewrite the historical binary payload', () => {
  const dir = tmp('append-io');
  referenceWriteTsIndex(dir, { sources: seedN(1000) });
  const bin = filePath(dir, 'BTCUSDT', '1m', '.bin');
  const originalReadFileSync = fs.readFileSync;
  const originalWriteFileSync = fs.writeFileSync;
  let historicalReads = 0;
  let historicalRewrites = 0;

  fs.readFileSync = (target, ...args) => {
    if (String(target) === bin) historicalReads += 1;
    return originalReadFileSync(target, ...args);
  };
  fs.writeFileSync = (target, ...args) => {
    if (String(target) === bin || String(target).startsWith(`${bin}.`)) historicalRewrites += 1;
    return originalWriteFileSync(target, ...args);
  };

  try {
    writeTsIndex(dir, { sources: [rec('BTCUSDT', 'binance', '1m', M(1000), 500)] });
  } finally {
    fs.readFileSync = originalReadFileSync;
    fs.writeFileSync = originalWriteFileSync;
  }

  const rows = readTsIndex(dir, 'BTCUSDT', '1m');
  assert.equal(rows.length, 1001);
  assert.equal(rows.at(-1).close, 500.5);
  assert.equal(historicalReads, 0, 'append path reads only the header and last timestamp');
  assert.equal(historicalRewrites, 0, 'append path does not create a full-bin replacement');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('production ts writer waits for an existing cross-process lock and releases cleanly', async (t) => {
  const dir = tmp('held-lock');
  writeTsIndex(dir, { sources: seedN(2) });
  const lockPath = tsWriteLockPath(dir, 'BTCUSDT', '1m');
  const handle = acquireFileLockSync(lockPath, { timeoutMs: 1000, staleMs: 60000 });
  const writer = spawnWriter(dir, [rec('BTCUSDT', 'binance', '1m', M(2), 500)]);

  try {
    await delay(100);
    if (writer.child.exitCode !== null && writer.child.exitCode !== 0) {
      const result = await writer.completed;
      if (/EPERM|operation not permitted/i.test(result.stderr)) return t.skip('child processes unavailable in this sandbox');
      assert.fail(`writer exited while the lock was held: ${result.stderr}`);
    }
    assert.equal(writer.child.exitCode, null, 'writer remains blocked while another owner holds the bin lock');
    assert.equal(releaseFileLockSync(handle), true);
    const result = await writer.completed;
    assert.equal(result.code, 0, `writer completes after release: ${result.stderr}`);
    assertTimestampUnion(dir, 3);
    console.log(JSON.stringify({ type: 'ts_write_lock', case: 'held_lock', blocked_ms: 100, final_count: 3 }));
  } finally {
    releaseFileLockSync(handle);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cross-process append/append and append/merge races preserve the exact timestamp union', async (t) => {
  const cases = [
    {
      name: 'append_append',
      left: Array.from({ length: 50 }, (_, k) => rec('BTCUSDT', 'binance', '1m', M(100 + k), 500 + k)),
      right: Array.from({ length: 50 }, (_, k) => rec('BTCUSDT', 'binance', '1m', M(150 + k), 700 + k)),
      expected: 200,
    },
    {
      name: 'append_merge',
      left: Array.from({ length: 50 }, (_, k) => rec('BTCUSDT', 'binance', '1m', M(100 + k), 900 + k)),
      right: Array.from({ length: 70 }, (_, k) => rec('BTCUSDT', 'binance', '1m', M(50 + k), 1100 + k)),
      expected: 150,
    },
  ];

  for (const race of cases) {
    const dir = tmp(race.name);
    const barrier = path.join(dir, 'start.signal');
    writeTsIndex(dir, { sources: seedN(100) });
    const left = spawnWriter(dir, race.left, barrier);
    const right = spawnWriter(dir, race.right, barrier);
    fs.writeFileSync(barrier, 'go');
    const [leftResult, rightResult] = await Promise.all([left.completed, right.completed]);
    if (leftResult.code !== 0 || rightResult.code !== 0) {
      const stderr = `${leftResult.stderr}\n${rightResult.stderr}`;
      fs.rmSync(dir, { recursive: true, force: true });
      if (/EPERM|operation not permitted/i.test(stderr)) return t.skip('child processes unavailable in this sandbox');
      assert.fail(`${race.name} writer failed: ${stderr}`);
    }
    assertTimestampUnion(dir, race.expected);
    console.log(JSON.stringify({
      type: 'ts_write_lock',
      case: race.name,
      initial_count: 100,
      left_rows: race.left.length,
      right_rows: race.right.length,
      final_count: race.expected,
    }));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('EQUIV real deep bin (copy of a live bin) + overlapping synthetic window == reference', () => {
  const { STORAGE_TS_DIR } = require('../../../../shared/lib/paths.js');
  let ran = 0;
  for (const [sym, tf] of [['XAUUSD', '5m'], ['BTCUSDT', '4h'], ['BTCUSDT', '1h']]) {
    if (!fs.existsSync(filePath(STORAGE_TS_DIR, sym, tf, '.bin'))) continue;
    const a = tmp('rref'); const b = tmp('rnew');
    for (const ext of ['.bin', '.meta.json']) {
      fs.copyFileSync(filePath(STORAGE_TS_DIR, sym, tf, ext), filePath(a, sym, tf, ext));
      fs.copyFileSync(filePath(STORAGE_TS_DIR, sym, tf, ext), filePath(b, sym, tf, ext));
    }
    const existing = readTsIndex(a, sym, tf);
    const lastMs = Date.parse(existing[existing.length - 1].timestamp);
    const step = tf === '5m' ? 300000 : tf === '1h' ? 3600000 : 14400000;
    const meta = existing[0];
    const inc = [];
    for (let k = -30; k <= 5; k++) {
      const r = rec(sym, meta.provider, tf, lastMs + k * step, 12345 + k);
      r.family = meta.family;
      inc.push(r);
    }
    referenceWriteTsIndex(a, { sources: inc });
    writeTsIndex(b, { sources: inc });
    assert.ok(readBytes(filePath(a, sym, tf, '.bin')).equals(readBytes(filePath(b, sym, tf, '.bin'))), `real ${sym} ${tf}: BIN identical`);
    assert.ok(readBytes(filePath(a, sym, tf, '.meta.json')).equals(readBytes(filePath(b, sym, tf, '.meta.json'))), `real ${sym} ${tf}: META identical`);
    console.log(JSON.stringify({ type: 'ts_merge_write', case: 'real_bin', symbol: sym, tf }));
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
    ran += 1;
  }
  assert.ok(ran >= 1, 'at least one real deep bin was available to test');
});

// FAITHFULNESS: the frozen reference must equal the genuine git-HEAD original across every
// scenario. Runs only while this work is uncommitted (otherwise HEAD == new code); skips
// cleanly thereafter so the suite never breaks on commit.
test('frozen reference is byte-identical to the genuine git-HEAD original', { skip: SKIP_GIT }, () => {
  const gitOriginal = require(GIT_ORIGINAL).writeTsIndex;
  for (const [name, seedFn, incFn] of SCENARIOS) {
    // reference-vs-git: seed both via reference, then apply incoming via git-original (a)
    // and reference (b); they must match. (assertEquivalent compares new-vs-ref, so here we
    // do an explicit ref-vs-git comparison instead.)
    const a = tmp('git'); const b = tmp('ref');
    const seed = seedFn && seedFn();
    if (seed && seed.length) {
      referenceWriteTsIndex(a, { sources: seed });
      for (const s of seed) for (const ext of ['.bin', '.meta.json']) {
        const src = filePath(a, s.symbol, s.timeframe, ext);
        if (fs.existsSync(src)) fs.copyFileSync(src, filePath(b, s.symbol, s.timeframe, ext));
      }
    }
    const inc = incFn();
    gitOriginal(a, { sources: inc });
    referenceWriteTsIndex(b, { sources: inc });
    for (const key of new Set(inc.map((s) => `${s.symbol} ${s.timeframe}`))) {
      const [sym, tf] = key.split(' ');
      assert.ok(readBytes(filePath(a, sym, tf, '.bin')).equals(readBytes(filePath(b, sym, tf, '.bin'))), `${name}: ${sym} ${tf} reference matches git-original BIN`);
    }
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ type: 'ts_merge_write', case: 'reference_faithful_vs_git', scenarios: SCENARIOS.length }));
});

// ===========================================================================================
// NO-MATERIALIZATION under a tight heap cap. Build a deep 1m bin, merge a small window in a
// heap-capped child. The NEW merge must complete (durable); the ORIGINAL merge must OOM
// under the identical cap (skip-safe — only while the git-HEAD original is reachable).
// ===========================================================================================
const OOM_DEEP = 1_300_000; // ~1.3M existing rows -> ~300MB+ if fully materialized
const OOM_HEAP_MB = 192;    // tight cap that 1.3M objects cannot fit but a Buffer merge can
const OOM_START = Date.parse('2018-01-01T00:00:00Z');

function buildDeepBin() {
  const baseDir = tmp('oom-base');
  const buf = Buffer.allocUnsafe(TS_HEADER_BYTES + OOM_DEEP * TS_RECORD_BYTES);
  buf.write(TS_MAGIC, 0, 'ascii');
  buf.writeUInt32LE(OOM_DEEP, 4);
  for (let i = 0; i < OOM_DEEP; i++) {
    const off = TS_HEADER_BYTES + i * TS_RECORD_BYTES;
    buf.writeDoubleLE(OOM_START + i * 60000, off);
    buf.writeDoubleLE(100, off + 8); buf.writeDoubleLE(101, off + 16);
    buf.writeDoubleLE(99, off + 24); buf.writeDoubleLE(100, off + 32); buf.writeDoubleLE(5, off + 40);
  }
  fs.writeFileSync(filePath(baseDir, 'BTCUSDT', '1m', '.bin'), buf);
  fs.writeFileSync(filePath(baseDir, 'BTCUSDT', '1m', '.meta.json'),
    JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance', count: OOM_DEEP }), 'utf8');
  return baseDir;
}

let _childPath;
function oomChildPath() {
  if (_childPath) return _childPath;
  _childPath = path.join(os.tmpdir(), `oom_child_${process.pid}.js`);
  fs.writeFileSync(_childPath, `
    const { writeTsIndex } = require(process.argv[2]);
    const tsDir = process.argv[3], start = Number(process.argv[4]), deep = Number(process.argv[5]);
    const sources = [];
    for (let k = 0; k < 5000; k++) {
      const ms = start + (deep - 2500 + k) * 60000;
      sources.push({ symbol:'BTCUSDT', family:'crypto', provider:'binance', timeframe:'1m',
        timestamp: new Date(ms).toISOString(), open:1, high:1, low:1, close:1, volume:1 });
    }
    writeTsIndex(tsDir, { sources });
    console.log('CHILD_OK');
  `);
  process.on('exit', () => { try { fs.rmSync(_childPath); } catch (_) { /* best effort */ } });
  return _childPath;
}

function runOomChild(targetModule, baseDir) {
  const dir = tmp('oom-run');
  for (const ext of ['.bin', '.meta.json']) fs.copyFileSync(filePath(baseDir, 'BTCUSDT', '1m', ext), filePath(dir, 'BTCUSDT', '1m', ext));
  const r = cp.spawnSync(process.execPath,
    [`--max-old-space-size=${OOM_HEAP_MB}`, oomChildPath(), targetModule, dir, String(OOM_START), String(OOM_DEEP)],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

test('NEW merge completes under a tight heap cap on a deep bin (no full materialization)', (t) => {
  const baseDir = buildDeepBin();
  const r = runOomChild(NEW_MODULE, baseDir);
  fs.rmSync(baseDir, { recursive: true, force: true });
  if (r.error && r.error.code === 'EPERM') {
    return t.skip('nested spawnSync is unavailable in this sandbox');
  }
  assert.equal(r.status, 0, `new merge child should exit 0 under ${OOM_HEAP_MB}MB (stderr: ${(r.stderr || '').slice(-200)})`);
  assert.ok(/CHILD_OK/.test(r.stdout || ''), 'new merge child should print the completion sentinel');
  console.log(JSON.stringify({ type: 'ts_merge_write', case: 'new_survives_cap', deep: OOM_DEEP, heap_cap_mb: OOM_HEAP_MB, status: r.status }));
});

test('ORIGINAL merge OOMs under the same cap (proves the regression was real)', { skip: SKIP_GIT }, () => {
  const baseDir = buildDeepBin();
  const r = runOomChild(GIT_ORIGINAL, baseDir);
  fs.rmSync(baseDir, { recursive: true, force: true });
  const oomSig = /heap out of memory|Allocation failed|Ineffective mark-compacts|Reached heap limit/i;
  assert.ok(!/CHILD_OK/.test(r.stdout || ''), 'original merge should NOT complete under the cap');
  assert.ok(r.status !== 0, `original merge child should exit non-zero (got ${r.status})`);
  assert.ok(oomSig.test(r.stderr || ''), `original merge child should report an OOM (stderr tail: ${(r.stderr || '').slice(-200)})`);
  console.log(JSON.stringify({ type: 'ts_merge_write', case: 'original_ooms', deep: OOM_DEEP, heap_cap_mb: OOM_HEAP_MB, status: r.status }));
});
