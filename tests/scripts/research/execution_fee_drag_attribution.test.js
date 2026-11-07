'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ponytail: analytical fee & attribution formulas use closed-form stdlib math; upgrade to streaming orderbook telemetry when live tick queue is active.

/**
 * Calculates SEC Section 31 regulatory fee with mandatory ceiling cent round-up
 * @param {number} proceeds - Gross sales proceeds in USD
 * @param {number} [rate=0.0000278] - Statutory rate per dollar
 * @returns {number} Fee in USD rounded up to nearest cent
 */
function calculateSecSection31Fee(proceeds, rate = 0.0000278) {
  if (!Number.isFinite(proceeds) || proceeds <= 0) return 0;
  const raw = proceeds * rate;
  return Math.ceil(raw * 100) / 100;
}

/**
 * Calculates net expected return and fee drag in basis points
 */
function calculateExecutionDrag({ notional, feeCat = 0.01, feeReg = 0.02, slippageBps = 2.0 }) {
  assert(Number.isFinite(notional) && notional > 0, 'Notional must be positive finite number');
  const fixedFees = feeCat + feeReg;
  const feeDragBps = (fixedFees / notional) * 10000;
  const totalDragBps = feeDragBps + slippageBps;
  return {
    fixedFees,
    feeDragBps,
    totalDragBps,
  };
}

/**
 * Calculates critical notional threshold below which fee drag dominates target alpha
 */
function calculateCriticalNotionalThreshold({ grossAlphaBps, slippageBps, hurdleAlphaBps, fixedFees = 0.03 }) {
  const netAlphaBudgetBps = grossAlphaBps - slippageBps - hurdleAlphaBps;
  assert(netAlphaBudgetBps > 0, 'Net alpha budget must be positive');
  const budgetRatio = netAlphaBudgetBps / 10000;
  return fixedFees / budgetRatio;
}

/**
 * Calculates dynamic minimum notional floor:
 * floor = max(statutoryFloor, portfolioEquity * minEquityFraction)
 * (Defaults: $150 statutory floor, 0.7% of portfolio minimum)
 */
function calculateDynamicNotionalFloor(portfolioEquity, statutoryFloor = 150.0, minEquityFraction = 0.007) {
  assert(Number.isFinite(portfolioEquity) && portfolioEquity > 0, 'Portfolio equity must be a positive number');
  const fractionFloor = portfolioEquity * minEquityFraction;
  return Math.max(statutoryFloor, Number(fractionFloor.toFixed(2)));
}

/**
 * Co-allocates target quantity across weighted strategies and tests netting
 */
function coAllocateAndNet({ totalQuantity, strategies }) {
  const sumWeights = strategies.reduce((acc, s) => acc + s.weight, 0);
  assert(sumWeights > 0, 'Sum of weights must be positive');

  const allocations = strategies.map(s => {
    const qty = Number(((s.weight / sumWeights) * totalQuantity).toFixed(3));
    return {
      strategyId: s.id,
      weight: s.weight,
      targetQuantity: qty,
      direction: s.direction || 1, // 1 for long, -1 for short
    };
  });

  const aggregatePhysical = allocations.reduce((acc, a) => acc + a.targetQuantity, 0);
  const netOrderQuantity = allocations.reduce((acc, a) => acc + (a.targetQuantity * a.direction), 0);
  const grossTurnover = allocations.reduce((acc, a) => acc + Math.abs(a.targetQuantity), 0);

  return {
    allocations,
    aggregatePhysical: Number(aggregatePhysical.toFixed(3)),
    netOrderQuantity: Number(netOrderQuantity.toFixed(3)),
    grossTurnover: Number(grossTurnover.toFixed(3)),
    turnoverSavingsPercent: Number(((1 - Math.abs(netOrderQuantity) / grossTurnover) * 100).toFixed(1)),
  };
}

test('empirical regulatory fee verification on Nov 02 2026 proceeds ($595.37)', () => {
  const proceeds = 595.37;
  const secFee = calculateSecSection31Fee(proceeds);
  assert.equal(secFee, 0.02, 'SEC Section 31 fee on $595.37 proceeds must round up to exactly $0.02');

  const catFee = 0.01;
  const totalSellFees = secFee + catFee;
  assert.equal(totalSellFees, 0.03, 'Total fixed regulatory exit fees must equal $0.03');
});

test('fee drag analysis on micro-sized fractional trades (0.131 SPY and 0.286 AAPL)', () => {
  // 0.131 SPY @ $595.37 => $77.99 notional
  const spyNotional = 0.131 * 595.37;
  const spyDrag = calculateExecutionDrag({ notional: spyNotional, feeCat: 0.01, feeReg: 0.02, slippageBps: 2.0 });
  assert(spyDrag.feeDragBps >= 3.84 && spyDrag.feeDragBps <= 3.86, `Expected ~3.85 bps, got ${spyDrag.feeDragBps}`);
  assert(spyDrag.totalDragBps >= 5.84 && spyDrag.totalDragBps <= 5.86, `Expected ~5.85 bps total drag`);

  // 0.286 AAPL @ $225.00 => $64.35 notional
  const aaplNotional = 0.286 * 225.00;
  const aaplDrag = calculateExecutionDrag({ notional: aaplNotional, feeCat: 0.01, feeReg: 0.02, slippageBps: 2.5 });
  assert(aaplDrag.feeDragBps >= 4.65 && aaplDrag.feeDragBps <= 4.67, `Expected ~4.66 bps, got ${aaplDrag.feeDragBps}`);
  assert(aaplDrag.totalDragBps >= 7.15 && aaplDrag.totalDragBps <= 7.17, `Expected ~7.16 bps total drag`);

  // Micro-trade $25 notional exhibits severe fee drag
  const microDrag = calculateExecutionDrag({ notional: 25.0, feeCat: 0.01, feeReg: 0.02, slippageBps: 2.0 });
  assert(Math.abs(microDrag.feeDragBps - 12.0) < 1e-6, 'Fee drag on $25 trade must equal 12.0 bps');
});

test('critical sizing threshold derivation for Sovereign intraday engine', () => {
  // Gross alpha = 8 bps, slippage = 2 bps, target net alpha = 4 bps => net budget = 2 bps
  const criticalNotional = calculateCriticalNotionalThreshold({
    grossAlphaBps: 8.0,
    slippageBps: 2.0,
    hurdleAlphaBps: 4.0,
    fixedFees: 0.03,
  });

  assert.equal(criticalNotional, 150.0, 'Minimum sizing floor must be exactly $150.00 to preserve positive net expectation');
});

test('dynamic minimum notional floor combines $150 statutory floor with 0.7% portfolio equity rule', () => {
  // Small portfolio ($10,000): 0.7% = $70 < $150 -> $150 statutory floor binds
  const floor10k = calculateDynamicNotionalFloor(10000.0);
  assert.equal(floor10k, 150.0, 'On $10,000 equity, $150 statutory floor must bind (since 0.7% = $70)');

  // Medium portfolio ($30,000): 0.7% = $210 > $150 -> 0.7% equity floor binds
  const floor30k = calculateDynamicNotionalFloor(30000.0);
  assert.equal(floor30k, 210.0, 'On $30,000 equity, 0.7% portfolio floor ($210) must bind');

  // Large portfolio ($100,000): 0.7% = $700 > $150 -> 0.7% equity floor binds
  const floor100k = calculateDynamicNotionalFloor(100000.0);
  assert.equal(floor100k, 700.0, 'On $100,000 equity, 0.7% portfolio floor ($700) must bind');
});

test('multi-strategy co-allocation and internal netting efficiency (Trend 2x vs MeanRev 1x)', () => {
  const result = coAllocateAndNet({
    totalQuantity: 0.867,
    strategies: [
      { id: 'trend_following', weight: 2.0, direction: 1 },
      { id: 'mean_reversion', weight: 1.0, direction: -1 }, // opposing signal: short/exit
    ],
  });

  assert.equal(result.allocations[0].targetQuantity, 0.578, 'Trend Following must be allocated 0.578 shares');
  assert.equal(result.allocations[1].targetQuantity, 0.289, 'Mean Reversion must be allocated 0.289 shares');
  assert.equal(result.aggregatePhysical, 0.867, 'Physical share conservation invariant must hold');

  // Opposing signals: +0.578 long vs -0.289 short => Net order: +0.289
  assert.equal(result.netOrderQuantity, 0.289, 'Net order routed to broker must be +0.289 shares');
  assert.equal(result.grossTurnover, 0.867, 'Gross turnover without netting is 0.867 shares');
  assert.equal(result.turnoverSavingsPercent, 66.7, 'Netting must eliminate 66.7% of gross turnover and crossing spread');
});
