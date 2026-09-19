'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  JSON_CACHE_RETENTION_MS,
  capSnapshotForJson,
  writePartitionedSnapshot,
  readSnapshot,
} = require('../../../../shared/lib/market/validation');

test('capSnapshotForJson enforces tiered retention on high-frequency intraday bars and preserves daily bars indefinitely', () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const mk = (timeframe, ageDays) => ({
    family: 'crypto',
    provider: 'binance',
    symbol: 'BTCUSDT',
    timeframe,
    timestamp: new Date(now - ageDays * DAY_MS).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 10,
  });

  const snapshot = {
    mode: 'test_snapshot',
    sources: [
      mk('1m', 1),   // recent 1m (1 day old) -> kept (retention: 3 days)
      mk('1m', 5),   // old 1m (5 days old) -> dropped
      mk('5m', 10),  // recent 5m (10 days old) -> kept (retention: 14 days)
      mk('5m', 20),  // old 5m (20 days old) -> dropped
      mk('15m', 25), // recent 15m (25 days old) -> kept (retention: 30 days)
      mk('15m', 45), // old 15m (45 days old) -> dropped
      mk('1h', 60),  // recent 1h (60 days old) -> kept (retention: 90 days)
      mk('1h', 120), // old 1h (120 days old) -> dropped
      mk('1d', 500), // 1d (500 days old) -> KEPT indefinitely (daily)
      mk('1w', 1000),// 1w (1000 days old) -> KEPT indefinitely (weekly)
      mk('1mo', 2000),// 1mo (2000 days old) -> KEPT indefinitely (monthly)
    ],
  };

  const capped = capSnapshotForJson(snapshot, { now });
  assert.equal(capped.sources.length, 7, 'exactly 7 records should be retained');
  const tfs = capped.sources.map((s) => s.timeframe);
  assert.deepEqual(tfs, ['1m', '5m', '15m', '1h', '1d', '1w', '1mo']);
  // Verify input snapshot immutability
  assert.equal(snapshot.sources.length, 11);
});

test('writePartitionedSnapshot applies tiered retention automatically when writing to disk', () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiered-cache-test-'));

  try {
    const snapshot = {
      mode: 'backtest_history',
      sources: [
        {
          family: 'fx',
          symbol: 'EURUSD',
          timeframe: '1m',
          timestamp: new Date(now - 10 * DAY_MS).toISOString(),
          open: 1.08, high: 1.09, low: 1.07, close: 1.085, volume: 50,
        },
        {
          family: 'fx',
          symbol: 'EURUSD',
          timeframe: '1d',
          timestamp: new Date(now - 200 * DAY_MS).toISOString(),
          open: 1.25, high: 1.26, low: 1.24, close: 1.255, volume: 1000,
        },
      ],
    };

    writePartitionedSnapshot(tmpDir, snapshot, { now });

    const fxFile = path.join(tmpDir, 'fx', 'backtest_history.json');
    assert.equal(fs.existsSync(fxFile), true, 'partitioned fx file should exist');
    const onDisk = JSON.parse(fs.readFileSync(fxFile, 'utf8'));
    assert.equal(onDisk.sources.length, 1, 'stale 1m record should be dropped while 1d is kept');
    assert.equal(onDisk.sources[0].timeframe, '1d');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
