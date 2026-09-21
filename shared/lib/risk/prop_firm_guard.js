'use strict';

const { getActivePropFirmProfile } = require('../profiles/prop_firms.js');

function finitePositive(val, fallback = null) {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function finiteNonNegative(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function evaluateDrawdownLimits(options = {}) {
  const profile = options.profile || getActivePropFirmProfile(options.propFirmOptions || {});
  const rules = profile?.rules || {};
  const maxDailyLossPct = finitePositive(rules.max_daily_loss, 0.04);
  const maxTotalLossPct = finitePositive(rules.max_total_loss, 0.06);

  const currentEquity = finitePositive(options.currentEquity);
  if (currentEquity === null) {
    return { ok: false, code: 'invalid_current_equity', reason: 'current equity must be a positive number' };
  }

  const startingDailyEquity = finitePositive(options.startingDailyEquity, currentEquity);
  const highWaterMark = finitePositive(options.highWaterMark, Math.max(startingDailyEquity, currentEquity));

  const dailyLoss = Math.max(0, (startingDailyEquity - currentEquity) / startingDailyEquity);
  const totalDrawdown = Math.max(0, (highWaterMark - currentEquity) / highWaterMark);

  if (dailyLoss >= maxDailyLossPct) {
    return {
      ok: false,
      code: 'max_daily_loss_breached',
      reason: `Daily loss ${(dailyLoss * 100).toFixed(2)}% reaches or exceeds daily limit ${(maxDailyLossPct * 100).toFixed(2)}%`,
      action: 'liquidate_and_lockout',
      daily_loss: dailyLoss,
      max_daily_loss: maxDailyLossPct,
      total_drawdown: totalDrawdown,
      max_total_loss: maxTotalLossPct,
      profile_id: profile?.id || 'default',
    };
  }

  if (totalDrawdown >= maxTotalLossPct) {
    return {
      ok: false,
      code: 'max_total_loss_breached',
      reason: `Total drawdown ${(totalDrawdown * 100).toFixed(2)}% reaches or exceeds total loss limit ${(maxTotalLossPct * 100).toFixed(2)}%`,
      action: 'freeze',
      daily_loss: dailyLoss,
      max_daily_loss: maxDailyLossPct,
      total_drawdown: totalDrawdown,
      max_total_loss: maxTotalLossPct,
      profile_id: profile?.id || 'default',
    };
  }

  return {
    ok: true,
    action: 'continue',
    daily_loss: dailyLoss,
    max_daily_loss: maxDailyLossPct,
    total_drawdown: totalDrawdown,
    max_total_loss: maxTotalLossPct,
    profile_id: profile?.id || 'default',
  };
}

function calculateNextUtcMidnight(now = new Date()) {
  const next = new Date(now.getTime());
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

function isLockoutActive(lockoutUntilUtc, now = new Date()) {
  if (!lockoutUntilUtc) return false;
  const target = new Date(lockoutUntilUtc).getTime();
  return Number.isFinite(target) && now.getTime() < target;
}

function resolveSymbolDigitsAndPipSize(symbol, explicitDigits, explicitPipSize) {
  const sym = String(symbol || '').trim().toUpperCase();
  let defaultDigits = 5;
  let defaultPipSize = 0.0001;

  if (/^(XAU|XAG)/.test(sym) || /^(US500|US30|NAS100|SPX|NDX|DJI)/.test(sym)) {
    defaultDigits = 2;
    defaultPipSize = 0.01;
  } else if (/JPY$/.test(sym)) {
    defaultDigits = 3;
    defaultPipSize = 0.01;
  } else if (/^(BTC|ETH|SOL|DOGE|XRP)/.test(sym)) {
    defaultDigits = 2;
    defaultPipSize = 0.01;
  }

  const digits = Number.isFinite(Number(explicitDigits)) ? Number(explicitDigits) : defaultDigits;
  const pipSize = Number.isFinite(Number(explicitPipSize)) && Number(explicitPipSize) > 0 ? Number(explicitPipSize) : defaultPipSize;

  return { digits, pipSize };
}

function calculateBreakEvenSl({
  symbol,
  side,
  openPrice,
  currentPrice,
  currentSl = 0,
  riskDistance,
  thresholdRMultiple = 1.0,
  bufferPips = 1,
  pipSize: explicitPipSize,
  digits: explicitDigits,
}) {
  const { digits, pipSize } = resolveSymbolDigitsAndPipSize(symbol, explicitDigits, explicitPipSize);
  const isBuy = String(side).toLowerCase() === 'buy';
  const open = Number(openPrice);
  const current = Number(currentPrice);
  const sl = Number(currentSl) || 0;
  const risk = Number(riskDistance);

  if (!Number.isFinite(open) || !Number.isFinite(current) || !Number.isFinite(risk) || risk <= 0) {
    return null;
  }

  const triggerDistance = thresholdRMultiple * risk;
  const buffer = bufferPips * pipSize;

  if (isBuy) {
    const profitDistance = current - open;
    if (profitDistance >= triggerDistance) {
      const candidateSl = Number((open + buffer).toFixed(digits));
      if (candidateSl > sl) return candidateSl;
    }
  } else {
    const profitDistance = open - current;
    if (profitDistance >= triggerDistance) {
      const candidateSl = Number((open - buffer).toFixed(digits));
      if (sl === 0 || candidateSl < sl) return candidateSl;
    }
  }

  return null;
}

function calculateTrailingSl({
  symbol,
  side,
  openPrice,
  currentPrice,
  currentSl = 0,
  trailDistance,
  pipSize: explicitPipSize,
  digits: explicitDigits,
}) {
  const { digits } = resolveSymbolDigitsAndPipSize(symbol, explicitDigits, explicitPipSize);
  const isBuy = String(side).toLowerCase() === 'buy';
  const open = Number(openPrice);
  const current = Number(currentPrice);
  const sl = Number(currentSl) || 0;
  const dist = Number(trailDistance);

  if (!Number.isFinite(open) || !Number.isFinite(current) || !Number.isFinite(dist) || dist <= 0) {
    return null;
  }

  if (isBuy) {
    const candidateSl = Number((current - dist).toFixed(digits));
    if (candidateSl > sl && candidateSl > open) {
      return candidateSl;
    }
  } else {
    const candidateSl = Number((current + dist).toFixed(digits));
    if ((sl === 0 || candidateSl < sl) && candidateSl < open) {
      return candidateSl;
    }
  }

  return null;
}

module.exports = {
  evaluateDrawdownLimits,
  calculateNextUtcMidnight,
  isLockoutActive,
  calculateBreakEvenSl,
  calculateTrailingSl,
};
