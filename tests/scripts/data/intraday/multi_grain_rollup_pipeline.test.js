'use strict';

// multi_grain_rollup_pipeline.test.js
// Verifies in-memory multi-grain rollup engine: math invariants, edge cases,
// streaming rollover events, and zero-read-back single-pass disk storage.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deriveMultiGrainInMemory,
  MultiGrainRollupPipeline,
  writeMultiGrainTsIndex,
  sanitizeRecord,
} = require('../../../../shared/lib/market/multi_grain_rollup.js');
const { readTsIndex } = require('../../../../shared/lib/market/validation.js');
const { StreamingQuoteRouter } = require('../../../../shared/lib/market/streaming_quote_router.js');

function generate1mBars(symbol, count = 60, startIso = '2026-06-12T14:00:00.000Z') {
  const baseMs = Date.parse(startIso);
  const bars = [];
  for (let i = 0; i < count; i++) {
    const c = 100 + i;
    bars.push({
      symbol,
      family: 'crypto',
      provider: 'binance',
      timeframe: '1m',
      timestamp: new Date(baseMs + i * 60 * 1000).toISOString(),
      open: c,
      high: c + 0.5,
      low: c - 0.5,
      close: c,
      volume: 2,
    });
  }
  return bars;
}

test('deriveMultiGrainInMemory: deterministic OHLCV aggregation & volume conservation across 60 1m bars', () => {
  const bars = generate1mBars('BTC', 60, '2026-06-12T14:00:00.000Z');
  const { derived, sources, counts } = deriveMultiGrainInMemory(bars, {
    targetTimeframes: ['5m', '15m', '30m', '1h'],
  });

  // 1 hour of 1m bars -> 12 x 5m, 4 x 15m, 2 x 30m, 1 x 1h
  assert.equal(counts['5m'], 12);
  assert.equal(counts['15m'], 4);
  assert.equal(counts['30m'], 2);
  assert.equal(counts['1h'], 1);

  // Check 1h bar OHLCV invariants
  const h1 = derived['1h'][0];
  assert.equal(h1.timestamp, '2026-06-12T14:00:00.000Z');
  assert.equal(h1.open, 100, '1h open matches first 1m bar');
  assert.equal(h1.close, 159, '1h close matches last 1m bar');
  assert.equal(h1.high, 159.5, '1h high matches peak 1m high');
  assert.equal(h1.low, 99.5, '1h low matches lowest 1m low');
  assert.equal(h1.volume, 120, '1h volume is sum of 60 x 2');
  assert.equal(h1.derived_from_timeframe, '1m');

  // Volume conservation: sum of volume across all grains equals total input volume
  const sumVol = (arr) => arr.reduce((acc, b) => acc + b.volume, 0);
  assert.equal(sumVol(bars), 120);
  assert.equal(sumVol(derived['5m']), 120);
  assert.equal(sumVol(derived['15m']), 120);
  assert.equal(sumVol(derived['30m']), 120);
  assert.equal(sumVol(derived['1h']), 120);

  // Check 5m bucket 0 (14:00 .. 14:04) and bucket 1 (14:05 .. 14:09)
  const m5_0 = derived['5m'][0];
  assert.equal(m5_0.timestamp, '2026-06-12T14:00:00.000Z');
  assert.equal(m5_0.open, 100);
  assert.equal(m5_0.close, 104);
  assert.equal(m5_0.high, 104.5);
  assert.equal(m5_0.low, 99.5);
  assert.equal(m5_0.volume, 10);

  const m5_1 = derived['5m'][1];
  assert.equal(m5_1.timestamp, '2026-06-12T14:05:00.000Z');
  assert.equal(m5_1.open, 105);
  assert.equal(m5_1.close, 109);
  assert.equal(m5_1.volume, 10);

  // Sources contain base (60) + 12 + 4 + 2 + 1 = 79 records
  assert.equal(sources.length, 60 + 12 + 4 + 2 + 1);
});

test('deriveMultiGrainInMemory edge case: handles out-of-order bars chronologically', () => {
  const sorted = generate1mBars('ETH', 10, '2026-06-12T14:00:00.000Z');
  const shuffled = [...sorted].sort(() => Math.random() - 0.5);

  const resSorted = deriveMultiGrainInMemory(sorted, { targetTimeframes: ['5m'] });
  const resShuffled = deriveMultiGrainInMemory(shuffled, { targetTimeframes: ['5m'] });

  assert.deepEqual(resShuffled.derived['5m'], resSorted.derived['5m']);
  assert.equal(resShuffled.derived['5m'].length, 2);
});

test('deriveMultiGrainInMemory edge case: handles time gaps and missing bars cleanly', () => {
  const bars = [
    { symbol: 'SOL', timestamp: '2026-06-12T14:00:00.000Z', open: 150, high: 151, low: 149, close: 150.5, volume: 5 },
    { symbol: 'SOL', timestamp: '2026-06-12T14:01:00.000Z', open: 150.5, high: 152, low: 150, close: 151, volume: 5 },
    // 25 minute gap
    { symbol: 'SOL', timestamp: '2026-06-12T14:27:00.000Z', open: 155, high: 156, low: 154, close: 155.5, volume: 10 },
  ];

  const { derived } = deriveMultiGrainInMemory(bars, { targetTimeframes: ['5m', '15m'] });
  // 5m should have 14:00 (from 14:00, 14:01) and 14:25 (from 14:27)
  assert.equal(derived['5m'].length, 2);
  assert.equal(derived['5m'][0].timestamp, '2026-06-12T14:00:00.000Z');
  assert.equal(derived['5m'][0].volume, 10);
  assert.equal(derived['5m'][1].timestamp, '2026-06-12T14:25:00.000Z');
  assert.equal(derived['5m'][1].volume, 10);

  // 15m should have 14:00 (from 14:00, 14:01) and 14:15 (from 14:27)
  assert.equal(derived['15m'].length, 2);
  assert.equal(derived['15m'][0].timestamp, '2026-06-12T14:00:00.000Z');
  assert.equal(derived['15m'][1].timestamp, '2026-06-12T14:15:00.000Z');
});

test('deriveMultiGrainInMemory edge case: deduplicates identical timestamps without volume double-counting', () => {
  const bars = [
    { symbol: 'BTC', timestamp: '2026-06-12T14:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 1 },
    // Duplicate 14:00 timestamp from reconnect
    { symbol: 'BTC', timestamp: '2026-06-12T14:00:00.000Z', open: 100, high: 102, low: 98, close: 101, volume: 2 },
    { symbol: 'BTC', timestamp: '2026-06-12T14:01:00.000Z', open: 101, high: 103, low: 100, close: 102, volume: 3 },
  ];

  const { derived } = deriveMultiGrainInMemory(bars, { targetTimeframes: ['5m'] });
  assert.equal(derived['5m'].length, 1);
  assert.equal(derived['5m'][0].volume, 5, 'Deduplicated: volume = 2 + 3, not 1 + 2 + 3');
  assert.equal(derived['5m'][0].high, 103);
  assert.equal(derived['5m'][0].low, 98);
});

test('sanitizeRecord edge case: enforces invariant low <= open/close <= high and positive volume', () => {
  const malformed = {
    symbol: 'bad',
    timestamp: '2026-06-12T14:00:00.000Z',
    open: 100,
    high: 90,  // Inverted: high < open
    low: 110,  // Inverted: low > open
    close: 105,
    volume: -10, // Negative volume
  };

  const s = sanitizeRecord(malformed);
  assert.ok(s);
  assert.equal(s.open, 100);
  assert.equal(s.close, 105);
  assert.equal(s.high, 105, 'high corrected to max(high, open, close)');
  assert.equal(s.low, 100, 'low corrected to min(low, open, close)');
  assert.equal(s.volume, 0, 'negative volume clamped to 0');
});

test('MultiGrainRollupPipeline: streaming rollover event emission & open bucket inspection', () => {
  const pipeline = new MultiGrainRollupPipeline({
    baseTimeframe: '1m',
    targetTimeframes: ['5m', '15m'],
  });

  const closedEvents = [];
  const updateEvents = [];
  pipeline.onBarClosed((e) => closedEvents.push(e));
  pipeline.onBarUpdated((e) => updateEvents.push(e));

  // Stream 5 bars (14:00 .. 14:04) -> All in same 5m and 15m bucket
  for (let i = 0; i < 5; i++) {
    pipeline.ingest({
      symbol: 'BTC',
      timestamp: new Date(Date.parse('2026-06-12T14:00:00.000Z') + i * 60000).toISOString(),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1,
    });
  }

  assert.equal(closedEvents.length, 0, 'No buckets closed yet at 14:04');
  const openBuckets = pipeline.getOpenBuckets('BTC');
  assert.equal(openBuckets.length, 2, 'Two open buckets: 5m and 15m');
  const open5m = openBuckets.find((b) => b.timeframe === '5m');
  assert.equal(open5m.count, 5);
  assert.equal(open5m.volume, 5);
  assert.equal(open5m.is_partial, true);

  // Ingest 6th bar at 14:05 -> Triggers 5m rollover!
  pipeline.ingest({
    symbol: 'BTC',
    timestamp: '2026-06-12T14:05:00.000Z',
    open: 105,
    high: 106,
    low: 104,
    close: 105,
    volume: 1,
  });

  assert.equal(closedEvents.length, 1, '5m bucket closed');
  assert.equal(closedEvents[0].timeframe, '5m');
  assert.equal(closedEvents[0].bar.timestamp, '2026-06-12T14:00:00.000Z');
  assert.equal(closedEvents[0].bar.open, 100);
  assert.equal(closedEvents[0].bar.close, 104);
  assert.equal(closedEvents[0].bar.volume, 5);

  // Flush closed bars
  const flushRes = pipeline.flush();
  assert.equal(flushRes.sources.length, 1);
  assert.equal(flushRes.counts['5m'], 1);

  // Clean state
  pipeline.removeSymbol('BTC');
  assert.equal(pipeline.getOpenBuckets('BTC').length, 0);
});

test('writeMultiGrainTsIndex: single-pass unified disk flush creates valid binary TS files for all grains', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multigrain-'));
  const bars = generate1mBars('AVAX', 60, '2026-06-12T14:00:00.000Z');

  const res = writeMultiGrainTsIndex(tsDir, { sources: bars }, {
    targetTimeframes: ['5m', '15m', '1h', '1d'],
  });

  assert.equal(res.ok, true);
  assert.equal(res.counts['5m'], 12);
  assert.equal(res.counts['15m'], 4);
  assert.equal(res.counts['1h'], 1);
  assert.equal(res.counts['1d'], 1);

  // Verify physical binary files and meta sidecars on disk
  const grains = ['1m', '5m', '15m', '1h', '1d'];
  for (const grain of grains) {
    const binPath = path.join(tsDir, `AVAX_${grain}.bin`);
    const metaPath = path.join(tsDir, `AVAX_${grain}.meta.json`);
    assert.ok(fs.existsSync(binPath), `Binary file exists for ${grain}`);
    assert.ok(fs.existsSync(metaPath), `Metadata file exists for ${grain}`);

    // Read back using canonical reader to ensure binary format compatibility
    const records = readTsIndex(tsDir, 'AVAX', grain);
    assert.ok(records && records.length > 0, `Read back records for ${grain}`);
    if (grain === '1m') assert.equal(records.length, 60);
    if (grain === '5m') assert.equal(records.length, 12);
    if (grain === '15m') assert.equal(records.length, 4);
    if (grain === '1h') assert.equal(records.length, 1);
    if (grain === '1d') assert.equal(records.length, 1);
  }
});

test('StreamingQuoteRouter integration: activates rollup pipeline and dispatches multi-grain events', () => {
  const router = new StreamingQuoteRouter({
    enableRollup: true,
    rollupOptions: { baseTimeframe: '1m', targetTimeframes: ['5m'] },
  });

  const payloads = [];
  router.subscribe((p) => payloads.push(p));

  // Ingest 5 bars
  for (let i = 0; i < 5; i++) {
    router.ingestBar('ETH', {
      timestamp: new Date(Date.parse('2026-06-12T14:00:00.000Z') + i * 60000).toISOString(),
      open: 3000 + i,
      high: 3005 + i,
      low: 2995 + i,
      close: 3000 + i,
      volume: 1,
    });
  }

  // Verify router tracked ring buffers and rollup state
  const openBuckets = router.getOpenBuckets('ETH');
  assert.equal(openBuckets.length, 1);
  assert.equal(openBuckets[0].timeframe, '5m');
  assert.equal(openBuckets[0].count, 5);
  assert.equal(openBuckets[0].volume, 5);

  // Ingest 6th bar (14:05) -> triggers 5m close event through router subscriber
  router.ingestBar('ETH', {
    timestamp: '2026-06-12T14:05:00.000Z',
    open: 3005,
    high: 3010,
    low: 3000,
    close: 3005,
    volume: 1,
  });

  const closedEvent = payloads.find((p) => p.event === 'bar_closed' && p.timeframe === '5m');
  assert.ok(closedEvent, 'Router dispatched bar_closed event for 5m');
  assert.equal(closedEvent.bar.open, 3000);
  assert.equal(closedEvent.bar.close, 3004);
  assert.equal(closedEvent.bar.volume, 5);
});
