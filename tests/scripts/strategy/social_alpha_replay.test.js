'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  HALF_LIVES_MS,
  MAX_CUTOFFS_MS,
  CONSTANTS,
  sigmoid,
  alignEffectiveTimestamp,
  calculateDecayedSignal,
  calculateCreatorWeight,
  applyCreatorWeightCaps,
  calculateCompositeSentiment,
  generateContrarianSignal,
  findTightestInvalidation
} = require('../../../shared/lib/analysis/social_alpha.js');

test('exponential half-life decay adheres to research specifications', () => {
  const baseTime = Date.parse('2026-09-10T12:00:00.000Z');
  const signal = {
    direction: 'BULLISH',
    conviction_score: 0.8,
    time_horizon: 'SWING',
    is_promotional: false
  };

  // At effective time (t0): S(t0) = 1.0 * 0.8 * 1.0 = 0.8
  const scoreAtT0 = calculateDecayedSignal(signal, baseTime, baseTime);
  assert.equal(Number(scoreAtT0.toFixed(4)), 0.8);

  // At 1 half-life (24h for SWING): S(t0 + 24h) = 0.8 * 0.5 = 0.4
  const scoreAt1Half = calculateDecayedSignal(signal, baseTime + HALF_LIVES_MS.SWING, baseTime);
  assert.equal(Number(scoreAt1Half.toFixed(4)), 0.4);

  // At 2 half-lives (48h for SWING): S(t0 + 48h) = 0.8 * 0.25 = 0.2
  const scoreAt2Half = calculateDecayedSignal(signal, baseTime + 2 * HALF_LIVES_MS.SWING, baseTime);
  assert.equal(Number(scoreAt2Half.toFixed(4)), 0.2);

  // Beyond hard cutoff (72h for SWING): S(t) = 0
  const scorePastCutoff = calculateDecayedSignal(signal, baseTime + MAX_CUTOFFS_MS.SWING + 1000, baseTime);
  assert.equal(scorePastCutoff, 0);

  // Prior to effective time: S(t) = 0 (no lookahead leakage)
  const scoreBeforeT0 = calculateDecayedSignal(signal, baseTime - 1000, baseTime);
  assert.equal(scoreBeforeT0, 0);

  // Promotional signal is always 0
  const promoSignal = { ...signal, is_promotional: true };
  assert.equal(calculateDecayedSignal(promoSignal, baseTime, baseTime), 0);

  // Bearish polarity produces negative decayed score
  const bearishSignal = { ...signal, direction: 'BEARISH' };
  const bearishScore = calculateDecayedSignal(bearishSignal, baseTime, baseTime);
  assert.equal(Number(bearishScore.toFixed(4)), -0.8);

  // Test all horizons have expected tau and cutoff
  assert.equal(HALF_LIVES_MS.SCALP, 4 * 3600 * 1000);
  assert.equal(MAX_CUTOFFS_MS.SCALP, 12 * 3600 * 1000);
  assert.equal(HALF_LIVES_MS.POSITION, 72 * 3600 * 1000);
  assert.equal(MAX_CUTOFFS_MS.POSITION, 216 * 3600 * 1000);
  assert.equal(HALF_LIVES_MS.MACRO_REGIME, 168 * 3600 * 1000);
  assert.equal(MAX_CUTOFFS_MS.MACRO_REGIME, 720 * 3600 * 1000);
});

test('bayesian creator credibility weight calculation', () => {
  // Sample count below threshold of 10 gives zero weight
  const unqualified = { sample_count: 9, brier_score: 0.10 };
  assert.equal(calculateCreatorWeight(unqualified), 0.0);

  // Brier score equal to prior (0.25) -> sigmoid(10 * 0) = 0.5
  const averageCreator = { sample_count: 15, brier_score: 0.25 };
  assert.equal(Number(calculateCreatorWeight(averageCreator).toFixed(4)), 0.5);

  // Superior predictive track record (Brier = 0.15) -> sigmoid(10 * (0.25 - 0.15)) = sigmoid(1.0)
  const superiorCreator = { sample_count: 30, brier_score: 0.15 };
  const superiorWeight = calculateCreatorWeight(superiorCreator);
  const expectedSuperior = sigmoid(1.0);
  assert.equal(Number(superiorWeight.toFixed(4)), Number(expectedSuperior.toFixed(4)));
  assert.ok(superiorWeight > 0.73);

  // Inferior track record (Brier = 0.35) -> sigmoid(10 * (0.25 - 0.35)) = sigmoid(-1.0)
  const inferiorCreator = { sample_count: 20, brier_score: 0.35 };
  const inferiorWeight = calculateCreatorWeight(inferiorCreator);
  const expectedInferior = sigmoid(-1.0);
  assert.equal(Number(inferiorWeight.toFixed(4)), Number(expectedInferior.toFixed(4)));
  assert.ok(inferiorWeight < 0.27);
});

test('creator diversity weight capping prevents single-creator dominance', () => {
  // Single creator is not capped
  const single = [0.8];
  assert.deepEqual(applyCreatorWeightCaps(single), [0.8]);

  // Multiple creators with M >= 4: each capped at 25% of total sum
  const dominant4 = [0.85, 0.05, 0.05, 0.05];
  const sumW4 = 0.85 + 0.05 + 0.05 + 0.05; // 1.0
  const cap4 = 0.25 * sumW4; // 0.25
  const capped4 = applyCreatorWeightCaps(dominant4);
  assert.equal(capped4[0], cap4);
  assert.equal(capped4[1], 0.05);
  assert.equal(capped4[2], 0.05);
  assert.equal(capped4[3], 0.05);

  // M = 2: capped at max(0.25, 1/2) = 50%
  const dominant2 = [0.8, 0.2];
  const capped2 = applyCreatorWeightCaps(dominant2);
  assert.equal(capped2[0], 0.5);
  assert.equal(capped2[1], 0.2);
});

test('zero-lookahead effective timestamp alignment', () => {
  const pubTime = '2026-09-10T12:03:00.000Z'; // 12:03 UTC
  const pubMs = Date.parse(pubTime);
  const delayMs = 5 * 60 * 1000; // 5m latency -> 12:08 UTC

  // On 1h interval bars, 12:08 rounds up to 13:00 UTC
  const effective1h = alignEffectiveTimestamp(pubTime, '1h', delayMs);
  assert.equal(effective1h, Date.parse('2026-09-10T13:00:00.000Z'));

  // On 15m interval bars, 12:08 rounds up to 12:15 UTC
  const effective15m = alignEffectiveTimestamp(pubTime, '15m', delayMs);
  assert.equal(effective15m, Date.parse('2026-09-10T12:15:00.000Z'));
});

test('composite sentiment aggregation with epsilon safety and promotional filter', () => {
  const t0 = Date.parse('2026-09-10T12:00:00.000Z');
  const ledger = {
    creators: {
      c1: { sample_count: 20, brier_score: 0.15 },
      c2: { sample_count: 20, brier_score: 0.35 }
    }
  };

  const signals = [
    {
      channel_id: 'c1',
      effectiveTimeMs: t0,
      signal: { direction: 'BULLISH', conviction_score: 0.9, time_horizon: 'SWING', is_promotional: false }
    },
    {
      channel_id: 'c2',
      effectiveTimeMs: t0,
      signal: { direction: 'BEARISH', conviction_score: 0.9, time_horizon: 'SWING', is_promotional: false }
    }
  ];

  // Higher weight on c1 (superior brier) yields positive net composite sentiment
  const sentiment = calculateCompositeSentiment(signals, ledger, t0);
  assert.ok(sentiment > 0, `Expected sentiment > 0, got ${sentiment}`);

  // Empty signals returns 0.0 safely
  assert.equal(calculateCompositeSentiment([], ledger, t0), 0.0);

  // All promotional signals returns 0.0 safely
  const promoSignals = [
    {
      channel_id: 'c1',
      effectiveTimeMs: t0,
      signal: { direction: 'BULLISH', conviction_score: 1.0, is_promotional: true }
    }
  ];
  assert.equal(calculateCompositeSentiment(promoSignals, ledger, t0), 0.0);
});

test('contrarian signal generation and risk sizing rules', () => {
  const bar = { close: 65000, high: 66000, low: 64000, atr: 1000 };

  // 1. Below liquidity volume floor fails closed to NEUTRAL
  const lowVol = generateContrarianSignal({
    symbol: 'ILLIQUID/USD',
    compositeSentiment: 0.85,
    bar,
    rsiValue: 75,
    volume24hUsd: 5_000_000 // < 10M floor
  });
  assert.equal(lowVol.bias, 'NEUTRAL');
  assert.equal(lowVol.reason, 'BELOW_VOLUME_FLOOR');

  // 2. Euphoria (Sentiment >= 0.70) + RSI >= 70 -> SHORT
  const euphoriaShort = generateContrarianSignal({
    symbol: 'BTC/USD',
    compositeSentiment: 0.85,
    bar,
    rsiValue: 78,
    volume24hUsd: 50_000_000,
    activeSignals: [{ invalidation_price: 67500, time_horizon: 'SWING' }]
  });
  assert.equal(euphoriaShort.bias, 'SHORT');
  assert.equal(euphoriaShort.action, 'SELL');
  assert.equal(euphoriaShort.reason, 'CONTRARIAN_EUPHORIA_REVERSAL');
  assert.equal(euphoriaShort.stop_loss, 67000); // ATR stop 65000 + 2*1000 = 67000 tighter than 67500
  assert.equal(euphoriaShort.take_profit_1, 63500); // 65000 - 1.5*1000
  assert.equal(euphoriaShort.take_profit_2, 62000); // 65000 - 3.0*1000

  // 3. Euphoria without technical confirmation stays NEUTRAL
  const euphoriaUnconfirmed = generateContrarianSignal({
    symbol: 'BTC/USD',
    compositeSentiment: 0.85,
    bar,
    rsiValue: 55,
    volume24hUsd: 50_000_000
  });
  assert.equal(euphoriaUnconfirmed.bias, 'NEUTRAL');
  assert.equal(euphoriaUnconfirmed.reason, 'EUPHORIA_UNCONFIRMED_CONTINUATION_RISK');

  // 4. Capitulation (Sentiment <= -0.70) + RSI <= 30 -> LONG
  const capitulationLong = generateContrarianSignal({
    symbol: 'BTC/USD',
    compositeSentiment: -0.85,
    bar,
    rsiValue: 24,
    volume24hUsd: 50_000_000,
    activeSignals: [{ invalidation_price: 62500, time_horizon: 'SWING' }]
  });
  assert.equal(capitulationLong.bias, 'LONG');
  assert.equal(capitulationLong.action, 'BUY');
  assert.equal(capitulationLong.reason, 'CONTRARIAN_CAPITULATION_REVERSAL');
  assert.equal(capitulationLong.stop_loss, 63000); // ATR stop 65000 - 2*1000 = 63000 tighter than 62500
  assert.equal(capitulationLong.take_profit_1, 66500); // 65000 + 1.5*1000
  assert.equal(capitulationLong.take_profit_2, 68000); // 65000 + 3.0*1000
});

test('deterministic end-to-end replay with offline fixtures', () => {
  const fixturesDir = path.join(__dirname, '../../fixtures/social');
  const signalsPath = path.join(fixturesDir, 'signals_payload_fixture.json');
  const reputationPath = path.join(fixturesDir, 'creator_reputation_fixture.json');

  assert.ok(fs.existsSync(signalsPath), 'signals fixture must exist');
  assert.ok(fs.existsSync(reputationPath), 'reputation fixture must exist');

  const rawSignals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
  const reputationLedger = JSON.parse(fs.readFileSync(reputationPath, 'utf8'));

  // Flatten signals into metadata format
  const btcSignals = [];
  for (const item of rawSignals) {
    const pubMs = Date.parse(item.source.published_at_utc);
    const effectiveTimeMs = alignEffectiveTimestamp(pubMs, '1h', 5 * 60 * 1000);
    for (const s of item.extracted_signals) {
      if (s.symbol === 'BTC/USD') {
        btcSignals.push({
          channel_id: item.source.channel_id,
          effectiveTimeMs,
          signal: s
        });
      }
    }
  }

  assert.equal(btcSignals.length, 3, 'Found 3 BTC/USD signal entries');

  // Replay point-in-time at 2026-09-10T14:00:00.000Z
  const asOfTime = Date.parse('2026-09-10T14:00:00.000Z');
  const btcSentiment = calculateCompositeSentiment(btcSignals, reputationLedger, asOfTime);

  // Positive sentiment from CryptoAnalyst and MacroTrader; CryptoShill dropped due to is_promotional
  assert.ok(btcSentiment > 0.15, `Expected BTC sentiment > 0.15, got ${btcSentiment}`);

  // Test unqualified creator in TSLA signal from Reddit WSB (sample_count = 5)
  const tslaItem = rawSignals.find((s) => s.source.channel_id === 'channel_reddit_wsb_hype');
  assert.ok(tslaItem, 'Found WSB item');
  const wsbWeight = calculateCreatorWeight(reputationLedger.creators.channel_reddit_wsb_hype);
  assert.equal(wsbWeight, 0.0, 'Unqualified creator weight must evaluate strictly to 0');
});
