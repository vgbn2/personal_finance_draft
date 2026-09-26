'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateWhalleyWilmottBand,
  calculateInverseHedgeContracts,
} = require('../../../../shared/lib/strategy/options_smile_model.js');
const {
  validateOptionsGreeks,
} = require('../../../../shared/lib/risk/options_greek_risk.js');
const {
  runOptionsBotCycle,
  commandOptionsBotRunner,
} = require('../../../../backend/cli/commands/strategy/options_bot_runner.js');
const {
  DeribitAdapter,
} = require('../../../../backend/gateway/dist/adapters/deribit_adapter.js');

test('calculateWhalleyWilmottBand returns zero band on zero or uninitialized gamma', () => {
  const zeroBand = calculateWhalleyWilmottBand(0, 60000);
  assert.equal(zeroBand.halfWidth, 0);
  assert.equal(zeroBand.needsRebalance, false);
  assert.equal(zeroBand.rebalanceTargetDelta, 0);

  const nullBand = calculateWhalleyWilmottBand(null, 60000);
  assert.equal(nullBand.halfWidth, 0);
  assert.equal(nullBand.needsRebalance, false);
});

test('calculateWhalleyWilmottBand calculates asymptotic no-trade boundaries correctly', () => {
  // S = 60000, Gamma = 2.0, lambda = 0.0005, riskAversion = 0.1
  // Numerator = 3 * 0.0005 * 60000 * 4 = 360
  // Denominator = 2 * 0.1 = 0.2
  // halfWidth = cbrt(360 / 0.2) = cbrt(1800) ~= 12.1644
  const band = calculateWhalleyWilmottBand(2.0, 60000, {
    transactionCost: 0.0005,
    riskAversion: 0.1,
    netDelta: 5.0,
  });

  assert.ok(Math.abs(band.halfWidth - 12.1644) < 0.01, `Expected halfWidth approx 12.1644, got ${band.halfWidth}`);
  assert.equal(band.needsRebalance, false);
  assert.equal(band.excessDelta, 0);

  // Delta breach above upper bound: netDelta = 15.0
  const breachUpper = calculateWhalleyWilmottBand(2.0, 60000, {
    transactionCost: 0.0005,
    riskAversion: 0.1,
    netDelta: 15.0,
  });
  assert.equal(breachUpper.needsRebalance, true);
  assert.ok(breachUpper.excessDelta > 0);
  assert.ok(Math.abs(breachUpper.rebalanceTargetDelta - band.halfWidth) < 0.001);

  // Delta breach below lower bound: netDelta = -15.0
  const breachLower = calculateWhalleyWilmottBand(2.0, 60000, {
    transactionCost: 0.0005,
    riskAversion: 0.1,
    netDelta: -15.0,
  });
  assert.equal(breachLower.needsRebalance, true);
  assert.ok(breachLower.excessDelta < 0);
  assert.ok(Math.abs(breachLower.rebalanceTargetDelta - (-band.halfWidth)) < 0.001);
});

test('calculateInverseHedgeContracts sizes Deribit inverse perpetual contracts ($10 USD / contract)', () => {
  // Long 0.5 BTC Delta at $60,000 spot -> Net Delta = $30,000 USD
  // Required Hedge: Short 3,000 contracts
  const shortHedge = calculateInverseHedgeContracts(0.5, 60000, 10);
  assert.equal(shortHedge.netDeltaUsd, 30000);
  assert.equal(shortHedge.contracts, -3000);
  assert.equal(shortHedge.side, 'sell');
  assert.equal(shortHedge.quantity, 3000);

  // Short 0.2 BTC Delta at $50,000 spot -> Net Delta = -$10,000 USD
  // Required Hedge: Long 1,000 contracts
  const longHedge = calculateInverseHedgeContracts(-0.2, 50000, 10);
  assert.equal(longHedge.netDeltaUsd, -10000);
  assert.equal(longHedge.contracts, 1000);
  assert.equal(longHedge.side, 'buy');
  assert.equal(longHedge.quantity, 1000);
});

test('validateOptionsGreeks validates Gamma, Vega, and Delta against risk limits', () => {
  const safe = validateOptionsGreeks(
    { delta: 0.5, gamma: 15.0, vega: 3000.0, theta: -200.0 },
    { max_gamma: 50.0, max_vega: 10000.0, max_delta: 5.0 }
  );
  assert.equal(safe.approved, true);
  assert.equal(safe.halt_trading, false);

  const gammaBreach = validateOptionsGreeks(
    { delta: 0.5, gamma: 55.0, vega: 3000.0, theta: -200.0 },
    { max_gamma: 50.0, max_vega: 10000.0, max_delta: 5.0 }
  );
  assert.equal(gammaBreach.approved, false);
  assert.equal(gammaBreach.halt_trading, true);
  assert.match(gammaBreach.reason, /Gamma limit exceeded/i);

  const vegaBreach = validateOptionsGreeks(
    { delta: 0.5, gamma: 15.0, vega: 12000.0, theta: -200.0 },
    { max_gamma: 50.0, max_vega: 10000.0, max_delta: 5.0 }
  );
  assert.equal(vegaBreach.approved, false);
  assert.equal(vegaBreach.halt_trading, true);
  assert.match(vegaBreach.reason, /Vega limit exceeded/i);

  const nanGreeks = validateOptionsGreeks(
    { delta: NaN, gamma: 15.0, vega: 3000.0, theta: -200.0 },
    { max_gamma: 50.0, max_vega: 10000.0, max_delta: 5.0, fail_closed: true }
  );
  assert.equal(nanGreeks.approved, false);
  assert.equal(nanGreeks.halt_trading, true);
});

test('runOptionsBotCycle completes full zero-key simulated rebalance cycle', async () => {
  const adapter = new DeribitAdapter({
    simulateIfMissingCredentials: true,
    testnet: true,
  });

  const cycleResult = await runOptionsBotCycle({
    currency: 'BTC',
    adapter,
    dryRun: true,
  });

  assert.equal(cycleResult.ok, true);
  assert.equal(cycleResult.halted, false);
  assert.equal(cycleResult.currency, 'BTC');
  assert.ok(cycleResult.spotPrice > 0);
  assert.notEqual(cycleResult.greeks, null);
  assert.notEqual(cycleResult.band, null);
  assert.notEqual(cycleResult.riskDecision, null);
  assert.equal(cycleResult.riskDecision.approved, true);
});

test('commandOptionsBotRunner returns code 0 on successful JSON execution', async () => {
  const exitCode = await commandOptionsBotRunner(['--currency', 'ETH', '--dry-run', '--json']);
  assert.equal(exitCode, 0);
});
