'use strict';

/**
 * Options Volatility Smile & 25-Delta Skew Model
 *
 * Computes:
 * - 25-Delta Risk Reversal (RR25): sigma_call(0.25) - sigma_put(-0.25)
 * - 25-Delta Butterfly (BF25): (sigma_call(0.25) + sigma_put(-0.25)) / 2 - sigma_atm
 * - Skew Z-Score: (RR25 - rolling_mean) / rolling_std
 *
 * ponytail: static 25-delta nearest neighbor; full Gatheral SVI calibration when continuous smile interpolation is required
 */

function findNearestOption(records = [], targetDelta, optionType = null) {
  if (!Array.isArray(records) || records.length === 0) return null;

  let best = null;
  let minDiff = Infinity;

  for (const r of records) {
    if (!r || r.mark_iv == null || r.delta == null) continue;
    if (optionType && r.option_type && String(r.option_type).toUpperCase() !== optionType.toUpperCase()) {
      continue;
    }
    const delta = Number(r.delta);
    if (!Number.isFinite(delta)) continue;

    const diff = Math.abs(delta - targetDelta);
    if (diff < minDiff) {
      minDiff = diff;
      best = r;
    }
  }

  return best;
}

function calculate25DeltaSkew(smileRecords = []) {
  if (!Array.isArray(smileRecords) || smileRecords.length === 0) {
    return {
      rr25: 0,
      bf25: 0,
      atmIv: 0,
      call25Iv: 0,
      put25Iv: 0,
      sampleCount: 0,
    };
  }

  // 25-Delta Call: delta approx +0.25
  const call25 = findNearestOption(smileRecords, 0.25, 'C') || findNearestOption(smileRecords, 0.25);
  // 25-Delta Put: delta approx -0.25
  const put25 = findNearestOption(smileRecords, -0.25, 'P') || findNearestOption(smileRecords, -0.25);
  // ATM Option: delta approx 0.50 (call) or -0.50 (put)
  const atmCall = findNearestOption(smileRecords, 0.50, 'C');
  const atmPut = findNearestOption(smileRecords, -0.50, 'P');
  const atm = atmCall || atmPut || findNearestOption(smileRecords, 0.50);

  const call25Iv = Number(call25?.mark_iv || 0);
  const put25Iv = Number(put25?.mark_iv || 0);
  const atmIv = Number(atm?.mark_iv || (call25Iv + put25Iv) / 2 || 0);

  const rr25 = call25Iv && put25Iv ? call25Iv - put25Iv : 0;
  const bf25 = call25Iv && put25Iv && atmIv ? (call25Iv + put25Iv) / 2 - atmIv : 0;

  return {
    rr25,
    bf25,
    atmIv,
    call25Iv,
    put25Iv,
    sampleCount: smileRecords.length,
  };
}

function calculateSkewZScore(currentRR, rollingMean = 0, rollingStd = 1) {
  const std = Number(rollingStd);
  if (!Number.isFinite(std) || std <= 1e-9) return 0;
  return (Number(currentRR || 0) - Number(rollingMean || 0)) / std;
}

/**
 * Whalley-Wilmott Asymptotic No-Trade Band for Options Delta Hedging
 * Delta Band Half-Width: ΔH = ( (3 * λ * S * Γ_net^2) / (2 * γ) )^(1/3)
 * where:
 * - λ = proportional transaction cost (default 0.0005 = 5 bps)
 * - S = underlying spot price
 * - Γ_net = net portfolio gamma
 * - γ = risk aversion parameter (default 0.1)
 *
 * ponytail: asymptotic expansion; full numerical Bellman PDE when discrete time step exceeds 1 hour
 */
function calculateWhalleyWilmottBand(gammaNet, spotPrice, options = {}) {
  const gamma = Math.abs(Number(gammaNet) || 0);
  const spot = Math.max(1.0, Number(spotPrice) || 1.0);
  const lambda = Number(options.transactionCost ?? 0.0005);
  const riskAversion = Number(options.riskAversion ?? 0.1);

  if (!Number.isFinite(gamma) || gamma <= 1e-9) {
    return {
      halfWidth: 0,
      lowerBound: 0,
      upperBound: 0,
      needsRebalance: false,
      rebalanceTargetDelta: 0,
      excessDelta: 0,
    };
  }

  // ΔH = ( (3 * λ * S * Γ^2) / (2 * γ) )^(1/3)
  const numerator = 3 * lambda * spot * (gamma * gamma);
  const denominator = 2 * Math.max(1e-6, riskAversion);
  const halfWidth = Math.cbrt(numerator / denominator);

  const netDelta = Number(options.netDelta ?? 0);
  const needsRebalance = Math.abs(netDelta) > halfWidth;

  let rebalanceTargetDelta = netDelta;
  if (netDelta > halfWidth) {
    rebalanceTargetDelta = halfWidth;
  } else if (netDelta < -halfWidth) {
    rebalanceTargetDelta = -halfWidth;
  }

  return {
    halfWidth,
    lowerBound: -halfWidth,
    upperBound: halfWidth,
    needsRebalance,
    rebalanceTargetDelta,
    excessDelta: netDelta > halfWidth ? netDelta - halfWidth : (netDelta < -halfWidth ? netDelta + halfWidth : 0),
  };
}

/**
 * Deribit Inverse Perpetual Futures Hedge Sizing ($10 USD / contract for BTC)
 * Net Delta (USD) = deltaCoin * spotPrice
 * Contract Count = -round(Net Delta (USD) / contractNotionalUsd)
 *
 * ponytail: linear contract sizing rounded to nearest integer contract; partial sub-contract execution when micro-perps are listed
 */
function calculateInverseHedgeContracts(netDeltaCoin, spotPrice, contractNotionalUsd = 10) {
  const deltaCoin = Number(netDeltaCoin) || 0;
  const spot = Number(spotPrice) || 0;
  const netDeltaUsd = deltaCoin * spot;
  const notional = Number(contractNotionalUsd) > 0 ? Number(contractNotionalUsd) : 10;
  const contracts = -Math.round(netDeltaUsd / notional);

  return {
    deltaCoin,
    spotPrice: spot,
    netDeltaUsd,
    contracts,
    side: contracts >= 0 ? 'buy' : 'sell',
    quantity: Math.abs(contracts),
  };
}

module.exports = {
  findNearestOption,
  calculate25DeltaSkew,
  calculateSkewZScore,
  calculateWhalleyWilmottBand,
  calculateInverseHedgeContracts,
};
