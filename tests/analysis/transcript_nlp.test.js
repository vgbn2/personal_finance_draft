'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  reconstructSentences,
  normalizeFinancialText,
  parseLevels,
  extractSignal,
  processVideoTranscript
} = require('../../shared/lib/analysis/transcript_nlp');

test('transcript_nlp: sentence reconstruction, phonetic normalization & signal extraction', () => {
  const rawFragments = [
    { startMs: 0, durMs: 1400, text: 'um b t c is' },
    { startMs: 1500, durMs: 1300, text: 'breaking out right now' },
    { startMs: 2900, durMs: 1500, text: 'clear target at 68k' },
    { startMs: 4500, durMs: 1600, text: 'stop loss at 62k' },
    { startMs: 6200, durMs: 1200, text: 'on the daily chart' },
    // >700ms pause triggers sentence boundary (8200 - 7400 = 800ms)
    { startMs: 8200, durMs: 1500, text: 'sign up with bybit for deposit bonus' }
  ];

  // 1. Reconstruct sentences
  const sentences = reconstructSentences(rawFragments, { pauseThresholdMs: 700 });
  assert.equal(sentences.length, 2);
  assert.match(sentences[0].text, /^B t c is breaking out/);

  // 2. Normalize financial text
  const norm0 = normalizeFinancialText(sentences[0].text);
  assert.ok(norm0.includes('BTC'));
  assert.ok(norm0.includes('68000'));
  assert.ok(norm0.includes('62000'));

  // 3. Level extraction
  const levels = parseLevels(norm0);
  assert.equal(levels.invalidation, 62000);
  assert.equal(levels.targets[0].level, 68000);

  // 4. Signal extraction
  const sig0 = extractSignal(norm0);
  assert.equal(sig0.direction, 'BULLISH');
  assert.equal(sig0.is_promotional, false);
  assert.equal(sig0.time_horizon, 'SWING');
  assert.ok(sig0.conviction_score >= 0.80);

  // 5. Promotional segment
  const norm1 = normalizeFinancialText(sentences[1].text);
  const sig1 = extractSignal(norm1);
  assert.equal(sig1.is_promotional, true);

  // 6. Full processVideoTranscript pipeline
  const videoMeta = {
    video_id: 'v_btc_daily',
    channel_id: 'UC_test_chan',
    published_at: '2026-09-16T10:00:00.000Z'
  };
  const processed = processVideoTranscript(videoMeta, rawFragments);
  assert.equal(processed.length, 1);
  assert.equal(processed[0].symbol, 'BTC');
  assert.equal(processed[0].direction, 'BULLISH');
  assert.equal(processed[0].invalidation_price, 62000);
  assert.equal(processed[0].effective_time_ms, Date.parse('2026-09-16T11:00:00.000Z'));
});
