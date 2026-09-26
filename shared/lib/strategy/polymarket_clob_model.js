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

/**
 * Multi-Level Orderbook VWAP Fill Cost Simulator
 * Calculates realistic market impact across top-N depth levels.
 *
 * ponytail: discrete level walking with VWAP; continuous power-law orderbook density integration when tick count exceeds 50
 */
function calculateMarketFillCost(asks = [], targetShares = 1) {
  const target = Math.max(0, Number(targetShares) || 0);
  if (target <= 0 || !Array.isArray(asks) || asks.length === 0) {
    return {
      vwap: 0,
      totalCost: 0,
      totalFilled: 0,
      fullyFilled: false,
      remainingShares: target,
      levelsUsed: 0,
    };
  }

  // Sort asks by price ascending
  const sortedAsks = [...asks]
    .filter(a => a && Number(a.price) > 0 && Number(a.size || a.quantity) > 0)
    .sort((a, b) => Number(a.price) - Number(b.price));

  let remaining = target;
  let totalCost = 0;
  let totalFilled = 0;
  let levelsUsed = 0;

  for (const level of sortedAsks) {
    if (remaining <= 1e-9) break;

    const price = Number(level.price);
    const size = Number(level.size || level.quantity || 0);
    const fillQty = Math.min(remaining, size);

    totalCost += fillQty * price;
    totalFilled += fillQty;
    remaining -= fillQty;
    levelsUsed++;
  }

  const fullyFilled = remaining <= 1e-9;
  const vwap = totalFilled > 0 ? totalCost / totalFilled : 0;

  return {
    vwap,
    totalCost,
    totalFilled,
    fullyFilled,
    remainingShares: Math.max(0, remaining),
    levelsUsed,
  };
}

/**
 * Combinatorial Sum-to-One Arbitrage Detector for Multi-Outcome Prediction Markets
 *
 * Evaluates whether purchasing 1 complete set across all mutually exclusive outcomes
 * costs strictly less than 1.00 USDC after accounting for taker fees and slippage reserve:
 *   Σ P_ask,i(L) + Fees + SlippageReserve < 1.00
 *
 * ponytail: static fee and slippage reserve deduction; dynamic taker fee tier resolution when Polymarket VIP volume scales
 */
function detectSumToOneArbitrage(outcomes = [], options = {}) {
  if (!Array.isArray(outcomes) || outcomes.length < 2) {
    return {
      hasArbitrage: false,
      edge: 0,
      grossCostPerShare: 0,
      netCostPerShare: 0,
      totalCost: 0,
      expectedProfit: 0,
      targetShares: Number(options.targetShares ?? 1),
      legs: [],
      valid: false,
      reason: 'Insufficient outcomes (minimum 2 required for categorical market)',
    };
  }

  const targetShares = Math.max(0.01, Number(options.targetShares ?? 1));
  const takerFeeRate = Number(options.takerFeeRate ?? 0.001); // 10 bps default
  const slippageReserve = Number(options.slippageReserve ?? 0.002); // 20 bps buffer
  const minEdge = Number(options.minEdge ?? 0.003); // 30 bps min profit threshold

  const legs = [];
  let grossCostPerShare = 0;
  let allLegsFilled = true;

  for (const outcome of outcomes) {
    const outcomeId = outcome.outcomeId || outcome.id || outcome.name || 'unknown';
    const tokenId = outcome.tokenId || outcome.asset_id || outcome.id;

    // Depth fill or single-level best ask
    let fill;
    if (Array.isArray(outcome.asks) && outcome.asks.length > 0) {
      fill = calculateMarketFillCost(outcome.asks, targetShares);
    } else {
      const askPrice = Number(outcome.bestAsk ?? outcome.price ?? 1.0);
      fill = {
        vwap: askPrice,
        totalCost: askPrice * targetShares,
        totalFilled: targetShares,
        fullyFilled: askPrice > 0 && askPrice < 1.0,
        remainingShares: 0,
        levelsUsed: 1,
      };
    }

    if (!fill.fullyFilled) {
      allLegsFilled = false;
    }

    grossCostPerShare += fill.vwap;
    legs.push({
      outcomeId,
      tokenId,
      name: outcome.name || outcomeId,
      vwap: fill.vwap,
      totalCost: fill.totalCost,
      filledShares: fill.totalFilled,
      fullyFilled: fill.fullyFilled,
      levelsUsed: fill.levelsUsed,
    });
  }

  const totalFeePerShare = grossCostPerShare * takerFeeRate;
  const netCostPerShare = grossCostPerShare + totalFeePerShare + slippageReserve;
  const edge = 1.0 - netCostPerShare;
  const hasArbitrage = allLegsFilled && edge >= minEdge;
  const totalCost = netCostPerShare * targetShares;
  const expectedProfit = hasArbitrage ? edge * targetShares : 0;

  return {
    hasArbitrage,
    edge,
    grossCostPerShare,
    netCostPerShare,
    totalCost,
    expectedProfit,
    targetShares,
    legs,
    allLegsFilled,
    valid: true,
  };
}

/**
 * NegRisk Conversion & Token Parity Evaluator
 * Checks whether holding 1 NO token or converting to complementary YES tokens yields higher yield.
 *
 * ponytail: deterministic payoff parity comparison; gas-optimized batch conversion when on-chain NegRiskAdapter is invoked
 */
function evaluateNegRiskConversion(noPrice, alternativeYesPrices = []) {
  const pNo = Number(noPrice ?? 0);
  const sumOtherYes = alternativeYesPrices.reduce((acc, p) => acc + (Number(p) || 0), 0);

  // Parity: In NegRisk, NO_A == sum(YES_B, YES_C, ...)
  const conversionCost = sumOtherYes;
  const directCost = pNo;
  const conversionEdge = directCost - conversionCost;

  return {
    directNoPrice: pNo,
    impliedNoPriceFromYes: conversionCost,
    conversionEdge,
    canConvert: Math.abs(conversionEdge) > 0.005,
    recommendation: conversionEdge > 0.005 ? 'buy_complementary_yes' : (conversionEdge < -0.005 ? 'buy_direct_no' : 'hold'),
  };
}

module.exports = {
  calculateDepthImbalance,
  forecastBinaryProbability,
  calculateMarketFillCost,
  detectSumToOneArbitrage,
  evaluateNegRiskConversion,
};
