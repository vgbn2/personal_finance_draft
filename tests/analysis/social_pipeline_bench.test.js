'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { TranscriptStore } = require('../../shared/lib/analysis/transcript_store');
const { reconstructSentences, normalizeFinancialText, extractSignal, processVideoTranscript } = require('../../shared/lib/analysis/transcript_nlp');

test('Social Pipeline Benchmark: SQLite WAL transaction batching, zlib compression, and NLP throughput', () => {
  const store = new TranscriptStore(':memory:');

  store.upsertChannel({
    channel_id: 'UC_bench_channel',
    handle: '@BenchChannel',
    name: 'Benchmark Channel',
    tier: 'tier_1_liquidity'
  });

  // 1. Benchmark batch video seeding (1,000 videos)
  const mockVideos = Array.from({ length: 1000 }, (_, i) => ({
    video_id: `bench_vid_${i}`,
    channel_id: 'UC_bench_channel',
    title: `Market Update Episode #${i} - Bitcoin and Ethereum analysis`,
    published_at: 1726000000000 + i * 3600000,
    duration_sec: 600 + (i % 300)
  }));

  const t0 = performance.now();
  const seeded = store.seedVideos(mockVideos);
  const t1 = performance.now();
  const seedDurationMs = t1 - t0;

  assert.equal(seeded, 1000);
  assert.ok(seedDurationMs < 200, `Seeding 1000 videos took ${seedDurationMs.toFixed(2)}ms (expected < 200ms)`);

  // 2. Benchmark Transcript Compression & Decompression (100 transcripts with 50 segments each)
  const mockTranscriptChunks = Array.from({ length: 50 }, (_, i) => ({
    startMs: i * 2000,
    durMs: 1800,
    text: `Segment ${i}: Bitcoin is testing support at $64.5k while euro dollar holds the weekly level.`
  }));

  const t2 = performance.now();
  for (let i = 0; i < 100; i++) {
    store.saveTranscript(`bench_vid_${i}`, {
      language: 'en',
      trackType: 'asr',
      segments: mockTranscriptChunks
    });
  }
  const t3 = performance.now();
  const saveDurationMs = t3 - t2;

  assert.ok(saveDurationMs < 300, `Saving 100 compressed transcripts took ${saveDurationMs.toFixed(2)}ms (expected < 300ms)`);

  const fetched = store.getTranscript('bench_vid_0');
  assert.ok(fetched);
  assert.equal(fetched.segments.length, 50);
  assert.match(fetched.fullText, /Bitcoin is testing support/);

  // 3. Benchmark NLP Processing & Signal Extraction
  const t4 = performance.now();
  let signalCount = 0;
  for (let i = 0; i < 100; i++) {
    const signals = processVideoTranscript({
      video_id: `bench_vid_${i}`,
      channel_id: 'UC_bench_channel',
      published_at: 1726000000000 + i * 3600000
    }, mockTranscriptChunks);
    signalCount += signals.length;
  }
  const t5 = performance.now();
  const nlpDurationMs = t5 - t4;

  assert.ok(signalCount >= 100, `Expected >= 100 signals, got ${signalCount}`);
  assert.ok(nlpDurationMs < 250, `NLP extraction over 100 videos (5,000 chunks) took ${nlpDurationMs.toFixed(2)}ms (expected < 250ms)`);

  // 4. Batch Signal Storage
  const t6 = performance.now();
  const sampleSignals = Array.from({ length: 500 }, (_, i) => ({
    signal_id: `sig_${i}`,
    video_id: `bench_vid_${i % 100}`,
    channel_id: 'UC_bench_channel',
    symbol: 'BTC',
    direction: i % 2 === 0 ? 'BULLISH' : 'BEARISH',
    conviction_score: 0.75,
    time_horizon: 'SWING',
    invalidation_price: 63000,
    price_targets: [{ level: 68000, weight: 1.0 }],
    is_promotional: 0,
    effective_time_ms: 1726000000000 + i * 3600000
  }));
  const savedSignals = store.saveSignals(sampleSignals);
  const t7 = performance.now();
  const signalSaveMs = t7 - t6;

  assert.equal(savedSignals, 500);
  assert.ok(signalSaveMs < 100, `Batch saving 500 signals took ${signalSaveMs.toFixed(2)}ms (expected < 100ms)`);

  const queried = store.getSignalsForAsset('BTC', 50);
  assert.equal(queried.length, 50);
});
