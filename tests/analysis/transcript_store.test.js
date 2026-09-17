'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TranscriptStore } = require('../../shared/lib/analysis/transcript_store');

test('TranscriptStore in-memory schema, video seeding, transcript compression & signal queries', () => {
  const store = new TranscriptStore(':memory:');

  // 1. Channel upsert
  store.upsertChannel({
    channel_id: 'UC_test_123',
    handle: '@TestTrader',
    name: 'Test Trader',
    tier: 'tier_1_liquidity'
  });

  // 2. Seed videos
  const seeded = store.seedVideos([
    { video_id: 'vid_1', channel_id: 'UC_test_123', title: 'BTC analysis', published_at: 1726000000000 },
    { video_id: 'vid_2', channel_id: 'UC_test_123', title: 'ETH scalp', published_at: 1726003600000 }
  ]);
  assert.equal(seeded, 2);

  // Re-seeding existing video is idempotent (ignored)
  const reseeded = store.seedVideos([
    { video_id: 'vid_1', channel_id: 'UC_test_123', title: 'BTC analysis', published_at: 1726000000000 }
  ]);
  assert.equal(reseeded, 0);

  // 3. Pending videos
  const pending = store.getPendingVideos(10);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].video_id, 'vid_2'); // Newest first

  // 4. Save gzipped transcript
  const mockSegments = [
    { startMs: 0, durMs: 2000, text: 'Bitcoin is testing major support.' },
    { startMs: 2100, durMs: 1800, text: 'Breaking out right now towards 68k.' }
  ];
  store.saveTranscript('vid_1', {
    language: 'en',
    trackType: 'manual',
    segments: mockSegments
  });

  const stored = store.getTranscript('vid_1');
  assert.ok(stored);
  assert.equal(stored.language, 'en');
  assert.equal(stored.trackType, 'manual');
  assert.equal(stored.segments.length, 2);
  assert.match(stored.fullText, /Bitcoin is testing major support/);
  assert.equal(stored.wordCount, 11);

  // Status flipped to COMPLETED
  const pendingAfter = store.getPendingVideos(10);
  assert.equal(pendingAfter.length, 1);
  assert.equal(pendingAfter[0].video_id, 'vid_2');

  // 5. Save and query extracted signals
  store.saveSignals([
    {
      signal_id: 'sig_1',
      video_id: 'vid_1',
      channel_id: 'UC_test_123',
      symbol: 'BTC',
      direction: 'BULLISH',
      conviction_score: 0.85,
      time_horizon: 'SWING',
      invalidation_price: 58200,
      effective_time_ms: 1726000300000
    }
  ]);

  const btcSignals = store.getSignalsForAsset('BTC');
  assert.equal(btcSignals.length, 1);
  assert.equal(btcSignals[0].direction, 'BULLISH');
  assert.equal(btcSignals[0].conviction_score, 0.85);

  // 6. Check stats
  const stats = store.getStats();
  assert.equal(stats.totalChannels, 1);
  assert.equal(stats.totalVideos, 2);
  assert.equal(stats.completedVideos, 1);
  assert.equal(stats.pendingVideos, 1);
  assert.equal(stats.totalSignals, 1);

  store.close();
});
