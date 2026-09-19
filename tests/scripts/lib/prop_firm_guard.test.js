'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateDrawdownLimits,
  calculateNextUtcMidnight,
  isLockoutActive,
  calculateBreakEvenSl,
  calculateTrailingSl,
} = require('../../../shared/lib/risk/prop_firm_guard.js');

test('evaluateDrawdownLimits detects daily loss breach', () => {
  const profile = {
    id: 'test_profile',
    rules: { max_daily_loss: 0.04, max_total_loss: 0.10 },
  };

  // 100k starting equity, 95k current equity -> 5% daily loss -> breach 4%
  const result = evaluateDrawdownLimits({
    currentEquity: 95000,
    startingDailyEquity: 100000,
    highWaterMark: 100000,
    profile,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'max_daily_loss_breached');
  assert.equal(result.action, 'liquidate_and_lockout');
  assert.equal(result.daily_loss, 0.05);
});

test('evaluateDrawdownLimits detects total drawdown breach', () => {
  const profile = {
    id: 'test_profile',
    rules: { max_daily_loss: 0.05, max_total_loss: 0.08 },
  };

  // Starting today at 93k, but peak was 100k, now 91k (2.1% daily, 9% total)
  const result = evaluateDrawdownLimits({
    currentEquity: 91000,
    startingDailyEquity: 93000,
    highWaterMark: 100000,
    profile,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'max_total_loss_breached');
  assert.equal(result.action, 'freeze');
  assert.equal(result.total_drawdown, 0.09);
});

test('evaluateDrawdownLimits allows trading inside limits', () => {
  const profile = {
    id: 'test_profile',
    rules: { max_daily_loss: 0.04, max_total_loss: 0.08 },
  };

  const result = evaluateDrawdownLimits({
    currentEquity: 99000,
    startingDailyEquity: 100000,
    highWaterMark: 100000,
    profile,
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'continue');
  assert.equal(result.daily_loss, 0.01);
  assert.equal(result.total_drawdown, 0.01);
});

test('lockout expiration and midnight calculation', () => {
  const now = new Date('2026-09-19T12:00:00.000Z');
  const midnight = calculateNextUtcMidnight(now);
  assert.equal(midnight, '2026-09-20T00:00:00.000Z');

  assert.equal(isLockoutActive(midnight, new Date('2026-09-19T18:00:00.000Z')), true);
  assert.equal(isLockoutActive(midnight, new Date('2026-09-20T00:00:01.000Z')), false);
});

test('calculateBreakEvenSl adjusts stop loss at target R-multiple', () => {
  // BUY: entry 1.1000, initial SL 1.0950 (risk = 0.0050 = 50 pips)
  // At 1.1060 (profit 60 pips > 1.0R), move SL to entry + 1 pip (1.1001)
  const buyBe = calculateBreakEvenSl({
    side: 'buy',
    openPrice: 1.1000,
    currentPrice: 1.1060,
    currentSl: 1.0950,
    riskDistance: 0.0050,
    thresholdRMultiple: 1.0,
    bufferPips: 1,
    pipSize: 0.0001,
  });
  assert.equal(buyBe, 1.1001);

  // Before 1.0R (currentPrice 1.1030 < 1.1050), no change
  const buyNoBe = calculateBreakEvenSl({
    side: 'buy',
    openPrice: 1.1000,
    currentPrice: 1.1030,
    currentSl: 1.0950,
    riskDistance: 0.0050,
    thresholdRMultiple: 1.0,
  });
  assert.equal(buyNoBe, null);

  // SELL: entry 1.1000, initial SL 1.1050 (risk = 0.0050)
  // At 1.0940 (profit 60 pips > 1.0R), move SL to entry - 1 pip (1.0999)
  const sellBe = calculateBreakEvenSl({
    side: 'sell',
    openPrice: 1.1000,
    currentPrice: 1.0940,
    currentSl: 1.1050,
    riskDistance: 0.0050,
    thresholdRMultiple: 1.0,
    bufferPips: 1,
    pipSize: 0.0001,
  });
  assert.equal(sellBe, 1.0999);
});

test('calculateTrailingSl trails stop loss in favorable direction', () => {
  // BUY: entry 1.1000, currentPrice 1.1080, trail 0.0030 -> candidate 1.1050
  const buyTrail = calculateTrailingSl({
    side: 'buy',
    openPrice: 1.1000,
    currentPrice: 1.1080,
    currentSl: 1.1020,
    trailDistance: 0.0030,
  });
  assert.equal(buyTrail, 1.1050);

  // SELL: entry 1.1000, currentPrice 1.0920, trail 0.0030 -> candidate 1.0950
  const sellTrail = calculateTrailingSl({
    side: 'sell',
    openPrice: 1.1000,
    currentPrice: 1.0920,
    currentSl: 1.0980,
    trailDistance: 0.0030,
  });
  assert.equal(sellTrail, 1.0950);
});
