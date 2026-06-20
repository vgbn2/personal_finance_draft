'use strict';

// Rigorous coverage of the dead-symbol marker + its clobber guard (data.js writeDeadSymbolMarker),
// exercising the REAL helper (not a re-implementation) and the downstream gate consumers
// readCoverage / isFresh / readTsIndex end-to-end.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTsIndex, readTsIndex } = require('../../../shared/lib/market/validation.js');
const { readCoverage, isFresh } = require('../../../shared/lib/market/coverage.js');
const { writeDeadSymbolMarker } = require('../../../backend/cli/commands/data/data.js');

const DAY = 24 * 60 * 60 * 1000;

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'mark-')); }

test('writeDeadSymbolMarker writes a marker when NO bin exists; daemon then skips for 7d, re-probes after', () => {
  const tsDir = tmp();
  const wrote = writeDeadSymbolMarker(tsDir, 'RNDRUSDT', '1m', 'crypto', 'binance');
  assert.equal(wrote, true, 'marker written for a never-listed symbol');
  assert.equal(fs.existsSync(path.join(tsDir, 'RNDRUSDT_1m.meta.json')), true);
  assert.equal(fs.existsSync(path.join(tsDir, 'RNDRUSDT_1m.bin')), false, 'no bin created');

  const markerMs = JSON.parse(fs.readFileSync(path.join(tsDir, 'RNDRUSDT_1m.meta.json'), 'utf8')).last_checked;
  const cov = readCoverage(tsDir, 'RNDRUSDT', '1m', markerMs);
  assert.equal(cov.exists, true);
  assert.equal(cov.count, 0);
  assert.equal(cov.notFoundCheckedMs, markerMs);

  // < 7d → daemon SKIPS (reason not_found, fresh true) → no infinite re-deep.
  const within = isFresh(tsDir, 'RNDRUSDT', '1m', 'crypto', markerMs + 3 * DAY);
  assert.equal(within.fresh, true);
  assert.equal(within.reason, 'not_found');
  // > 7d → marker expires → re-probe (reason empty, not fresh).
  const after = isFresh(tsDir, 'RNDRUSDT', '1m', 'crypto', markerMs + 8 * DAY);
  assert.equal(after.fresh, false);
  assert.equal(after.reason, 'empty');

  console.log(JSON.stringify({ type: 'marker_test', case: 'no_bin_writes_marker', wrote, within: within.reason, after: after.reason }));
});

test('writeDeadSymbolMarker REFUSES to write over an existing bin — enriched sidecar is preserved (clobber fix)', () => {
  const tsDir = tmp();
  // A symbol that already has real bars + enriched meta (the pre-fix clobber victim).
  writeTsIndex(tsDir, { sources: [
    { family: 'crypto', provider: 'binance', symbol: 'BTCUSDT', timeframe: '1m', timestamp: '2026-06-01T00:00:00.000Z', open: 1, high: 2, low: 1, close: 1.5, volume: 9, coordinate_id: 'crypto:BTCUSDT', config_market: 'Crypto', config_sector: 'Layer1' },
    { family: 'crypto', provider: 'binance', symbol: 'BTCUSDT', timeframe: '1m', timestamp: '2026-06-01T00:01:00.000Z', open: 1.5, high: 2, low: 1, close: 1.7, volume: 4, coordinate_id: 'crypto:BTCUSDT', config_market: 'Crypto', config_sector: 'Layer1' },
  ] });

  // A transient 0-bar deep backfill must NOT write a marker over the real sidecar.
  const wrote = writeDeadSymbolMarker(tsDir, 'BTCUSDT', '1m', 'crypto', 'binance');
  assert.equal(wrote, false, 'marker write refused because a real bin exists');

  // Prove no clobber: enriched fields survive on every record.
  const recs = readTsIndex(tsDir, 'BTCUSDT', '1m');
  assert.equal(recs.length, 2);
  for (const r of recs) {
    assert.equal(r.coordinate_id, 'crypto:BTCUSDT', 'coordinate_id retained');
    assert.equal(r.config_sector, 'Layer1', 'config_sector retained');
  }
  // And readCoverage still reports the real bars, ignoring any marker semantics.
  const cov = readCoverage(tsDir, 'BTCUSDT', '1m', Date.parse('2026-06-01T00:02:00.000Z'));
  assert.equal(cov.count, 2);
  assert.equal(cov.notFoundCheckedMs, null);

  console.log(JSON.stringify({ type: 'marker_test', case: 'bin_exists_refuses', wrote, bars: cov.count, sector: recs[0].config_sector }));
});
