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

module.exports = {
  findNearestOption,
  calculate25DeltaSkew,
  calculateSkewZScore,
};
