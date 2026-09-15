'use strict';

/**
 * Social Alpha Signal Scoring, Decay & Contrarian Engine.
 * Pure mathematical primitives for experimental social sentiment analysis.
 *
 * ponytail: pure functions only, zero external I/O or stateful connections.
 */

const HALF_LIVES_MS = Object.freeze({
  SCALP: 4 * 3600 * 1000,          // 4 hours
  SWING: 24 * 3600 * 1000,        // 24 hours
  POSITION: 72 * 3600 * 1000,     // 72 hours
  MACRO_REGIME: 168 * 3600 * 1000 // 168 hours (7 days)
});

const MAX_CUTOFFS_MS = Object.freeze({
  SCALP: 12 * 3600 * 1000,          // 12 hours
  SWING: 72 * 3600 * 1000,          // 72 hours
  POSITION: 216 * 3600 * 1000,      // 216 hours (9 days)
  MACRO_REGIME: 720 * 3600 * 1000   // 720 hours (30 days)
});

const CONSTANTS = Object.freeze({
  DEFAULT_BETA: 10.0,
  DEFAULT_PRIOR_BRIER: 0.25,
  MIN_SAMPLE_COUNT: 10,
  CREATOR_WEIGHT_CAP_RATIO: 0.25,
  EPSILON: 1e-6,
  VOLUME_FLOOR_USD: 10_000_000,
  EUPHORIA_THRESHOLD: 0.70,
  CAPITULATION_THRESHOLD: -0.70,
  RSI_OVERBOUGHT: 70,
  RSI_OVERSOLD: 30,
  DEFAULT_PROCESSING_DELAY_MS: 300_000 // 5 minutes
});

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function parseTimestampMs(ts) {
  if (typeof ts === 'number') return ts;
  const parsed = Date.parse(ts);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Invalid timestamp: ${ts}`);
  }
  return parsed;
}

function parseBarIntervalMs(tf) {
  const map = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 3600 * 1000,
    '4h': 4 * 3600 * 1000,
    '1d': 24 * 3600 * 1000
  };
  return map[tf] || (24 * 3600 * 1000);
}

function alignEffectiveTimestamp(pubTime, barIntervalMs, processingLatencyMs = CONSTANTS.DEFAULT_PROCESSING_DELAY_MS) {
  const pubMs = parseTimestampMs(pubTime);
  const intervalMs = typeof barIntervalMs === 'string' ? parseBarIntervalMs(barIntervalMs) : barIntervalMs;
  return Math.ceil((pubMs + processingLatencyMs) / intervalMs) * intervalMs;
}

function calculateDecayedSignal(signal, currentTimeMs, effectiveTimeMs) {
  if (signal.is_promotional) return 0;
  const dt = currentTimeMs - effectiveTimeMs;
  if (dt < 0) return 0;

  const horizon = signal.time_horizon || 'SWING';
  const tauHalf = HALF_LIVES_MS[horizon] || HALF_LIVES_MS.SWING;
  const cutoff = MAX_CUTOFFS_MS[horizon] || MAX_CUTOFFS_MS.SWING;

  if (dt > cutoff) return 0;

  let polarity = 0.0;
  if (signal.direction === 'BULLISH') polarity = 1.0;
  else if (signal.direction === 'BEARISH') polarity = -1.0;

  const conviction = Math.max(0.0, Math.min(1.0, Number(signal.conviction_score) || 0.0));
  return polarity * conviction * Math.pow(2, -dt / tauHalf);
}

function calculateCreatorWeight(creatorRep, beta = CONSTANTS.DEFAULT_BETA, priorBrier = CONSTANTS.DEFAULT_PRIOR_BRIER) {
  if (!creatorRep || typeof creatorRep !== 'object') return 0;
  const sampleCount = Number(creatorRep.sample_count) || 0;
  if (sampleCount < CONSTANTS.MIN_SAMPLE_COUNT) return 0;
  const brierScore = Number(creatorRep.brier_score) || 0;
  return sigmoid(beta * (priorBrier - brierScore));
}

function applyCreatorWeightCaps(creatorWeights) {
  const count = creatorWeights.length;
  if (count <= 1) return [...creatorWeights];
  const sumW = creatorWeights.reduce((sum, w) => sum + w, 0);
  // ponytail: cap ratio is max(0.25, 1/M) to prevent sub-mean truncation when M < 4
  const capRatio = Math.max(CONSTANTS.CREATOR_WEIGHT_CAP_RATIO, 1 / count);
  const cap = capRatio * sumW;
  return creatorWeights.map((w) => Math.min(w, cap));
}

function calculateCompositeSentiment(signalsWithMetadata, reputationLedger, currentTimeMs, options = {}) {
  const valid = (signalsWithMetadata || []).filter((item) => !item.signal?.is_promotional);
  if (valid.length === 0) return 0.0;

  const rawWeights = valid.map((item) => {
    const rep = reputationLedger?.creators?.[item.channel_id] || reputationLedger?.[item.channel_id];
    return calculateCreatorWeight(rep, options.beta, options.priorBrier);
  });

  const cappedWeights = applyCreatorWeightCaps(rawWeights);
  let weightedSignalSum = 0;
  let weightSum = 0;

  for (let i = 0; i < valid.length; i++) {
    const item = valid[i];
    const w = cappedWeights[i];
    const s = calculateDecayedSignal(item.signal, currentTimeMs, item.effectiveTimeMs);
    weightedSignalSum += w * s;
    weightSum += w;
  }

  return weightedSignalSum / (weightSum + CONSTANTS.EPSILON);
}

function generateContrarianSignal({
  symbol,
  compositeSentiment,
  bar,
  rsiValue,
  divergence,
  volume24hUsd,
  activeSignals = [],
  options = {}
}) {
  const volumeFloor = options.volumeFloorUsd ?? CONSTANTS.VOLUME_FLOOR_USD;
  const euphoriaTh = options.euphoriaThreshold ?? CONSTANTS.EUPHORIA_THRESHOLD;
  const capitulationTh = options.capitulationThreshold ?? CONSTANTS.CAPITULATION_THRESHOLD;
  const atrVal = bar?.atr || (bar?.high && bar?.low ? (bar.high - bar.low) : 0);

  if (typeof volume24hUsd === 'number' && volume24hUsd < volumeFloor) {
    return {
      symbol,
      bias: 'NEUTRAL',
      reason: 'BELOW_VOLUME_FLOOR',
      composite_sentiment: compositeSentiment,
      volume_24h_usd: volume24hUsd
    };
  }

  if (compositeSentiment >= euphoriaTh) {
    const isOverbought = typeof rsiValue === 'number' && rsiValue >= CONSTANTS.RSI_OVERBOUGHT;
    const isBearishDiv = divergence?.bearish === true || divergence?.smc_bearish_structure_break === true;
    if (isOverbought || isBearishDiv) {
      const invalidation = findTightestInvalidation(activeSignals, bar?.close || 0, 'SHORT', atrVal);
      return {
        symbol,
        bias: 'SHORT',
        action: 'SELL',
        reason: 'CONTRARIAN_EUPHORIA_REVERSAL',
        composite_sentiment: compositeSentiment,
        rsi: rsiValue,
        technical_trigger: isOverbought ? 'RSI_OVERBOUGHT' : 'BEARISH_DIVERGENCE',
        stop_loss: invalidation,
        take_profit_1: (bar?.close || 0) - 1.5 * atrVal,
        take_profit_2: (bar?.close || 0) - 3.0 * atrVal,
        max_allocation_pct: 0.01,
        time_stop_horizon: getDominantTimeHorizon(activeSignals)
      };
    }
    return { symbol, bias: 'NEUTRAL', reason: 'EUPHORIA_UNCONFIRMED_CONTINUATION_RISK', composite_sentiment: compositeSentiment };
  }

  if (compositeSentiment <= capitulationTh) {
    const isOversold = typeof rsiValue === 'number' && rsiValue <= CONSTANTS.RSI_OVERSOLD;
    const isBullishDiv = divergence?.bullish === true || divergence?.smc_bullish_structure_break === true;
    if (isOversold || isBullishDiv) {
      const invalidation = findTightestInvalidation(activeSignals, bar?.close || 0, 'LONG', atrVal);
      return {
        symbol,
        bias: 'LONG',
        action: 'BUY',
        reason: 'CONTRARIAN_CAPITULATION_REVERSAL',
        composite_sentiment: compositeSentiment,
        rsi: rsiValue,
        technical_trigger: isOversold ? 'RSI_OVERSOLD' : 'BULLISH_DIVERGENCE',
        stop_loss: invalidation,
        take_profit_1: (bar?.close || 0) + 1.5 * atrVal,
        take_profit_2: (bar?.close || 0) + 3.0 * atrVal,
        max_allocation_pct: 0.01,
        time_stop_horizon: getDominantTimeHorizon(activeSignals)
      };
    }
    return { symbol, bias: 'NEUTRAL', reason: 'CAPITULATION_UNCONFIRMED_CONTINUATION_RISK', composite_sentiment: compositeSentiment };
  }

  return { symbol, bias: 'NEUTRAL', reason: 'SENTIMENT_WITHIN_NORMAL_BOUNDS', composite_sentiment: compositeSentiment };
}

function findTightestInvalidation(signals, currentPrice, direction, atr) {
  const atrStop = direction === 'SHORT' ? currentPrice + 2.0 * atr : currentPrice - 2.0 * atr;
  const validPrices = (signals || [])
    .map((s) => s.invalidation_price)
    .filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0);

  if (validPrices.length === 0) return atrStop;

  if (direction === 'SHORT') {
    const validAbove = validPrices.filter((p) => p > currentPrice);
    if (validAbove.length === 0) return atrStop;
    const transcriptStop = Math.min(...validAbove);
    return Math.min(transcriptStop, atrStop);
  } else {
    const validBelow = validPrices.filter((p) => p < currentPrice);
    if (validBelow.length === 0) return atrStop;
    const transcriptStop = Math.max(...validBelow);
    return Math.max(transcriptStop, atrStop);
  }
}

function getDominantTimeHorizon(signals) {
  if (!signals || signals.length === 0) return 'SWING';
  return signals[0].time_horizon || 'SWING';
}

module.exports = {
  HALF_LIVES_MS,
  MAX_CUTOFFS_MS,
  CONSTANTS,
  sigmoid,
  parseTimestampMs,
  parseBarIntervalMs,
  alignEffectiveTimestamp,
  calculateDecayedSignal,
  calculateCreatorWeight,
  applyCreatorWeightCaps,
  calculateCompositeSentiment,
  generateContrarianSignal,
  findTightestInvalidation,
  getDominantTimeHorizon
};
