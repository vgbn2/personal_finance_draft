'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  StreamingQuoteRouter,
} = require('../../../shared/lib/market/streaming_quote_router.js');
const {
  ProviderMesh,
  calculateJitteredBackoff,
} = require('../../../shared/lib/market/provider_mesh.js');

test('Pillar 4: StreamingQuoteRouter applies coalescing drop policy under subscriber backpressure', () => {
  const router = new StreamingQuoteRouter({ capacity: 50 });

  const normalReceived = [];
  const slowReceived = [];
  let isSlowBackpressured = false;

  // 1. Normal subscriber
  router.subscribe((event) => {
    normalReceived.push(event);
  });

  // 2. Slow subscriber with backpressure simulation
  router.subscribeWithBackpressure((event) => {
    slowReceived.push(event);
  }, {
    checkBackpressure: () => isSlowBackpressured,
  });

  // Ingest 5 normal bars
  for (let i = 1; i <= 5; i++) {
    router.ingestBar('BTCUSDT', {
      symbol: 'BTCUSDT',
      close: 60000 + i * 10,
      high: 60000 + i * 10 + 5,
      low: 60000 + i * 10 - 5,
      volume: 10,
    });
  }

  assert.strictEqual(normalReceived.length, 5);
  assert.strictEqual(slowReceived.length, 5);

  // Turn on backpressure for slow subscriber
  isSlowBackpressured = true;

  // Ingest 10 ticks while slow consumer is lagging
  for (let i = 6; i <= 15; i++) {
    router.ingestBar('BTCUSDT', {
      symbol: 'BTCUSDT',
      close: 60000 + i * 10,
      high: 60000 + i * 10 + 5,
      low: 60000 + i * 10 - 5,
      volume: 10,
    });
  }

  assert.strictEqual(normalReceived.length, 15);
  // Slow subscriber dropped intermediate ticks and coalesced the latest state
  assert.strictEqual(slowReceived.length, 5);

  const stats = router.getBackpressureStats();
  assert.strictEqual(stats.subscribers_count, 2);
  assert.strictEqual(stats.backpressured_subscribers, 1);
  assert.strictEqual(stats.total_dropped, 10);

  // Relief: slow subscriber catches up
  isSlowBackpressured = false;

  // Next tick flushes coalesced latest state
  router.ingestBar('BTCUSDT', {
    symbol: 'BTCUSDT',
    close: 60200,
    high: 60205,
    low: 60195,
    volume: 15,
  });

  assert.strictEqual(normalReceived.length, 16);
  // Receives the coalesced bar + the new bar
  assert.strictEqual(slowReceived.length, 7);
  assert.strictEqual(slowReceived[slowReceived.length - 1].bar.close, 60200);
});

test('Pillar 4: ProviderMesh enforces concurrency limits and exponential backoff retry', async () => {
  const mesh = new ProviderMesh({
    binance: { maxConcurrency: 2, minDelayMs: 5, maxRetries: 2, baseBackoffMs: 10, maxBackoffMs: 50 },
  });

  let currentActive = 0;
  let maxObservedActive = 0;

  const makeTask = (delayMs = 20) => async () => {
    currentActive += 1;
    if (currentActive > maxObservedActive) maxObservedActive = currentActive;
    await new Promise((r) => setTimeout(r, delayMs));
    currentActive -= 1;
    return 'OK';
  };

  // Run 6 concurrent tasks on lane with maxConcurrency = 2
  const promises = [
    mesh.execute('binance', makeTask(30)),
    mesh.execute('binance', makeTask(30)),
    mesh.execute('binance', makeTask(30)),
    mesh.execute('binance', makeTask(30)),
    mesh.execute('binance', makeTask(30)),
    mesh.execute('binance', makeTask(30)),
  ];

  const results = await Promise.all(promises);
  assert.strictEqual(results.length, 6);
  assert.ok(maxObservedActive <= 2, `Max concurrency should be <= 2, was ${maxObservedActive}`);

  // Test 429 retry with jittered backoff
  let attemptCount = 0;
  const failingThenSuccess = async () => {
    attemptCount += 1;
    if (attemptCount <= 2) {
      const err = new Error('HTTP 429 Too Many Requests');
      err.status = 429;
      throw err;
    }
    return 'RECOVERED';
  };

  const res = await mesh.execute('binance', failingThenSuccess, { maxRetries: 3 });
  assert.strictEqual(res, 'RECOVERED');
  assert.strictEqual(attemptCount, 3);

  const laneStats = mesh.getStats('binance');
  assert.strictEqual(laneStats.total_executed, 7);
  assert.strictEqual(laneStats.total_retries, 2);
});

test('Pillar 4: calculateJitteredBackoff returns values bounded within [0, cap]', () => {
  for (let i = 0; i < 20; i++) {
    const backoff = calculateJitteredBackoff(2, 100, 1000);
    assert.ok(backoff >= 0 && backoff <= 400, `Backoff ${backoff} out of range [0, 400]`);
  }
});
