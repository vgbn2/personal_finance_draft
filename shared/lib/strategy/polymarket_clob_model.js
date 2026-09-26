'use strict';

/**
 * Polymarket CLOB Depth Imbalance & Binary Probability Model
 *
 * Computes:
 * - Top-5 Weighted Depth Imbalance Ratio (DIR5)
 * - Level-1 / Multi-Level Micro-Price
 * - Bounded Logit Probability Forecast with Pin-Risk Protection
 *
 * ponytail: linear logit drift with depth weighting; full Cont-Kukanov-Stoikov OFI multi-tick kernel when WebSocket order stream is enabled
 */

function calculateDepthImbalance(bids = [], asks = [], depth = 5) {
  if (!Array.isArray(bids)) bids = [];
  if (!Array.isArray(asks)) asks = [];

  const maxLevels = Math.max(1, depth);
  let weightedBidSize = 0;
  let weightedAskSize = 0;

  for (let i = 0; i < maxLevels; i++) {
    const weight = 1 / (i + 1); // harmonic decay: 1, 1/2, 1/3, 1/4, 1/5
    if (bids[i]) {
      const bSize = Number(bids[i].size || bids[i].quantity || 0);
      if (Number.isFinite(bSize) && bSize > 0) {
        weightedBidSize += weight * bSize;
      }
    }
    if (asks[i]) {
      const aSize = Number(asks[i].size || asks[i].quantity || 0);
      if (Number.isFinite(aSize) && aSize > 0) {
        weightedAskSize += weight * aSize;
      }
    }
  }

  const totalWeighted = weightedBidSize + weightedAskSize;
  const dir5 = totalWeighted > 1e-9 ? (weightedBidSize - weightedAskSize) / totalWeighted : 0;

  // Best prices and sizes for micro-price calculation
  const bestBidPrice = Number(bids[0]?.price || 0);
  const bestAskPrice = Number(asks[0]?.price || 0);
  const bestBidSize = Number(bids[0]?.size || bids[0]?.quantity || 0);
  const bestAskSize = Number(asks[0]?.size || asks[0]?.quantity || 0);

  let microPrice = 0.5;
  const topSizeSum = bestBidSize + bestAskSize;
  if (topSizeSum > 1e-9 && bestBidPrice > 0 && bestAskPrice > 0) {
    microPrice = (bestAskPrice * bestBidSize + bestBidPrice * bestAskSize) / topSizeSum;
  } else if (bestBidPrice > 0 && bestAskPrice > 0) {
    microPrice = (bestBidPrice + bestAskPrice) / 2;
  } else if (bestBidPrice > 0) {
    microPrice = bestBidPrice;
  } else if (bestAskPrice > 0) {
    microPrice = bestAskPrice;
  }

  return {
    dir5: Math.max(-1, Math.min(1, dir5)),
    microPrice,
    weightedBidSize,
    weightedAskSize,
    bestBid: bestBidPrice,
    bestAsk: bestAskPrice,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function forecastBinaryProbability(pMid, dir5, ofiZ = 0, weights = { b1: 0.15, b2: 0.25 }) {
  const p = clamp(Number(pMid || 0.5), 0.001, 0.999);
  const b1 = Number(weights?.b1 ?? 0.15);
  const b2 = Number(weights?.b2 ?? 0.25);
  const d = clamp(Number(dir5 || 0), -1, 1);
  const z = clamp(Number(ofiZ || 0), -5, 5);

  // Logit transform: ln(p / (1 - p))
  const logitP = Math.log(p / (1 - p));

  // Drift on logit space
  const logitNext = logitP + b1 * d + b2 * z;

  // Inverse logit: 1 / (1 + exp(-x))
  const pForecast = 1 / (1 + Math.exp(-logitNext));

  // Pin-risk boundary safety guard:
  // If price is within extreme tails (< 0.03 or > 0.97), halt new directional positions
  const pinRisk = pForecast < 0.03 || pForecast > 0.97;
  const signal = pinRisk ? 0 : pForecast - p;

  return {
    pForecast: pinRisk ? p : pForecast,
    signal,
    pinRisk,
    logitP,
    logitNext,
  };
}

module.exports = {
  calculateDepthImbalance,
  forecastBinaryProbability,
};
