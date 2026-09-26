'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamingRingBuffer, StreamingQuoteRouter } = require('../../../shared/lib/market/streaming_quote_router.js');

test('StreamingRingBuffer: maintains fixed capacity and FIFO ordering', () => {
  const ring = new StreamingRingBuffer(5);
  for (let i = 1; i <= 8; i++) {
    ring.push({ close: i });
  }
  assert.equal(ring.length, 5);
  const arr = ring.toArray();
  assert.deepEqual(arr.map((b) => b.close), [4, 5, 6, 7, 8]);
});

test('StreamingQuoteRouter: dispatches live ticks and computes rolling features', () => {
  const router = new StreamingQuoteRouter({ windowSize: 50 });
  const received = [];
  const unsubscribe = router.subscribe((update) => received.push(update));

  const basePrice = 60000;
  for (let i = 0; i < 30; i++) {
    router.ingestBar('BTCUSDT', {
      symbol: 'BTCUSDT',
      timeframe: '1m',
      timestamp: new Date(Date.now() + i * 60000).toISOString(),
      open: basePrice + i * 10,
      high: basePrice + i * 10 + 5,
      low: basePrice + i * 10 - 5,
      close: basePrice + i * 10 + 2,
      volume: 100,
    }, '1m');
  }

  assert.equal(received.length, 30);
  const last = received[received.length - 1];
  assert.equal(last.symbol, 'BTCUSDT');
  assert.equal(last.window_size, 30);
  assert.ok(last.features, 'rolling features calculated');
  assert.ok(Number.isFinite(last.features.rsi), 'rsi is finite');
  assert.ok(Number.isFinite(last.features.close), 'close is finite');
  assert.ok(last.incremental, 'incremental indicators provided');
  assert.ok(Number.isFinite(last.incremental.rsi), 'incremental rsi is finite');
  assert.ok(Number.isFinite(last.incremental.atr), 'incremental atr is finite');
  assert.ok(Number.isFinite(last.incremental.bollinger_middle), 'incremental bollinger_middle is finite');
  assert.ok(last.incremental.bollinger_upper >= last.incremental.bollinger_middle, 'upper band >= middle');
  assert.ok(last.incremental.bollinger_lower <= last.incremental.bollinger_middle, 'lower band <= middle');
  unsubscribe();
});

test('StreamingRingBuffer: computes O(1) incremental Wilder RSI, ATR, and Bollinger bands', () => {
  const ring = new StreamingRingBuffer(30);
  let price = 100;
  for (let i = 0; i < 25; i++) {
    price += (i % 2 === 0 ? 2 : -1);
    ring.push({
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 500,
    });
  }

  const ind = ring.getIncrementalIndicators();
  assert.ok(Number.isFinite(ind.rsi), 'RSI must be finite');
  assert.ok(ind.rsi >= 0 && ind.rsi <= 100, 'RSI must be in [0, 100]');
  assert.ok(Number.isFinite(ind.atr), 'ATR must be finite');
  assert.ok(ind.atr > 0, 'ATR must be strictly positive');
  assert.ok(Number.isFinite(ind.bollinger_middle), 'Bollinger middle must be finite');
  assert.ok(ind.bollinger_upper >= ind.bollinger_middle, 'Bollinger upper >= middle');
  assert.ok(ind.bollinger_lower <= ind.bollinger_middle, 'Bollinger lower <= middle');
});

test('StreamingRingBuffer: dynamically resizes capacity while preserving FIFO ordering', () => {
  const ring = new StreamingRingBuffer(10);
  for (let i = 1; i <= 8; i++) ring.push({ close: i });
  assert.equal(ring.capacity, 10);
  assert.equal(ring.length, 8);

  // Shrink to 4 (keeps 4 most recent: [5, 6, 7, 8])
  ring.resize(4);
  assert.equal(ring.capacity, 4);
  assert.equal(ring.length, 4);
  assert.deepEqual(ring.toArray().map((b) => b.close), [5, 6, 7, 8]);

  // Push new bar
  ring.push({ close: 9 });
  assert.equal(ring.length, 4);
  assert.deepEqual(ring.toArray().map((b) => b.close), [6, 7, 8, 9]);

  // Expand to 20
  ring.resize(20);
  assert.equal(ring.capacity, 20);
  assert.equal(ring.length, 4);
  ring.push({ close: 10 });
  assert.equal(ring.length, 5);
  assert.deepEqual(ring.toArray().map((b) => b.close), [6, 7, 8, 9, 10]);
});

test('StreamingQuoteRouter: dynamic capacity via function, symbol map, and runtime override', () => {
  const router = new StreamingQuoteRouter({
    windowSize: (symbol, timeframe) => (timeframe === '1d' ? 50 : 25),
  });

  router.ingestBar('BTCUSDT', { close: 100 }, '1m');
  assert.equal(router.resolveCapacity('BTCUSDT', '1m'), 25);

  router.ingestBar('ETHUSDT', { close: 200 }, '1d');
  assert.equal(router.resolveCapacity('ETHUSDT', '1d'), 50);

  // Override dynamically per ingest
  router.ingestBar('BTCUSDT', { close: 105 }, '1m', { capacity: 75 });
  const btcRing = router.buffers.get('BTCUSDT:1m');
  assert.equal(btcRing.capacity, 75);

  // Dynamic setCapacity
  router.setCapacity('SOLUSDT', '1h', 120);
  const solRing = router.buffers.get('SOLUSDT:1h');
  assert.equal(solRing.capacity, 120);
});


