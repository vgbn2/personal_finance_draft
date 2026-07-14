'use strict';

// Guards the `backend integrity` optimization: it now derives {bars, from, to} from the cheap
// readCoverage probe (header + head/tail reads) instead of a full readTsIndex materialization.
// This test pins that the two paths are byte-for-byte equivalent on ADVERSARIAL bins the 1009
// real bins don't exercise: single-bar, empty-header, meta-only marker, and truncated bins.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTsIndex, readTsIndex } = require('../../../shared/lib/market/validation.js');
const { readCoverage } = require('../../../shared/lib/market/coverage.js');

const TS_MAGIC = 'SOVT';
const HEADER = 8;
const RECORD = 48;

// Exact derivations used inside runBackendIntegrity (backend.js), old path vs new path.
function oldTuple(recs) {
  if (!recs || recs.length === 0) return null;
  return { bars: recs.length, from: recs[0].timestamp.slice(0, 10), to: recs[recs.length - 1].timestamp.slice(0, 10) };
}
function newTuple(cov) {
  if (!cov.exists || cov.count === 0 || cov.lastBarMs === null || cov.firstBarMs === null) return null;
  return { bars: cov.count, from: new Date(cov.firstBarMs).toISOString().slice(0, 10), to: new Date(cov.lastBarMs).toISOString().slice(0, 10) };
}
function bars(tsDir, sym, n, lastIso) {
  const lastMs = Date.parse(lastIso);
  const sources = [];
  for (let i = 0; i < n; i += 1) {
    const ts = new Date(lastMs - (n - 1 - i) * 60000).toISOString();
    sources.push({ symbol: sym, family: 'crypto', provider: 'binance', timeframe: '1m', timestamp: ts, open: 1, high: 2, low: 1, close: 1 + i, volume: 1 });
  }
  writeTsIndex(tsDir, { sources });
}

test('integrity readCoverage path == readTsIndex path on adversarial bins', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eqv-'));

  // 1) Normal multi-bar bin.
  bars(tsDir, 'MULTI', 50, '2026-06-14T03:59:00.000Z');
  // 2) Single-bar bin (firstBarMs === lastBarMs).
  bars(tsDir, 'SINGLE', 1, '2026-06-10T12:00:00.000Z');
  // 3) Empty-header bin: valid magic, count 0, with a meta sidecar.
  {
    const b = Buffer.alloc(HEADER); b.write(TS_MAGIC, 0, 'ascii'); b.writeUInt32LE(0, 4);
    fs.writeFileSync(path.join(tsDir, 'EMPTY_1m.bin'), b);
    fs.writeFileSync(path.join(tsDir, 'EMPTY_1m.meta.json'), JSON.stringify({ symbol: 'EMPTY', timeframe: '1m', family: 'crypto', provider: 'binance', count: 0 }));
  }
  // 4) Meta-only "not found" marker (delisted): no bin.
  fs.writeFileSync(path.join(tsDir, 'DEAD_1m.meta.json'), JSON.stringify({ symbol: 'DEAD', timeframe: '1m', family: 'crypto', provider: 'binance', count: 0, last_checked: Date.now() }));
  // 5) Truncated bin: header claims 10 bars, file holds only 2.
  bars(tsDir, 'TRUNC', 10, '2026-06-12T00:00:00.000Z');
  fs.truncateSync(path.join(tsDir, 'TRUNC_1m.bin'), HEADER + 2 * RECORD);

  const cases = ['MULTI', 'SINGLE', 'EMPTY', 'DEAD', 'TRUNC', 'MISSING'];
  const now = Date.parse('2026-06-14T04:10:00.000Z');
  const results = {};
  for (const sym of cases) {
    const oldV = oldTuple(readTsIndex(tsDir, sym, '1m'));
    const newV = newTuple(readCoverage(tsDir, sym, '1m', now));
    assert.deepEqual(newV, oldV, `mismatch for ${sym}: old=${JSON.stringify(oldV)} new=${JSON.stringify(newV)}`);
    results[sym] = newV;
  }

  // Sanity: the cases actually exercised the distinct branches we care about.
  assert.deepEqual(results.MULTI, { bars: 50, from: '2026-06-14', to: '2026-06-14' });
  assert.equal(results.SINGLE.bars, 1);
  assert.equal(results.SINGLE.from, results.SINGLE.to, 'single-bar: from === to (head read == tail read)');
  assert.equal(results.EMPTY, null, 'empty-header bin → skipped by both');
  assert.equal(results.DEAD, null, 'dead-symbol marker → skipped by both');
  assert.equal(results.TRUNC, null, 'truncated bin → skipped by both (readTsIndex null / readCoverage null tail)');
  assert.equal(results.MISSING, null, 'absent symbol → skipped by both');

  console.log(JSON.stringify({ type: 'integrity_equiv', cases: cases.length, results }));
});
