'use strict';

const { DeribitAdapter } = require('../../../gateway/dist/adapters/deribit_adapter.js');
const {
  calculateWhalleyWilmottBand,
  calculateInverseHedgeContracts,
} = require('../../../../shared/lib/strategy/options_smile_model.js');
const {
  validateOptionsGreeks,
} = require('../../../../shared/lib/risk/options_greek_risk.js');
const utils = require('../../lib/utils.js');
const {
  printPayload,
  optionValue,
  numericOption,
  hasFlag,
} = utils;

/**
 * Options Delta-Neutral Bot Runner Cycle
 *
 * 1. Queries net options Greek exposure (Δ, Γ, ν, Θ) via DeribitAdapter.
 * 2. Evaluates Whalley-Wilmott asymptotic no-trade band around portfolio gamma.
 * 3. Enforces C++ PreTradeRisk Greek boundaries (Gamma <= max_gamma, Vega <= max_vega).
 * 4. Sizes and submits inverse perpetual futures rebalancing order when delta breaches the band.
 *
 * ponytail: one-shot cycle execution with Deribit perpetual hedge; multi-leg options roll when gamma limit approaches
 */
async function runOptionsBotCycle(options = {}) {
  const currency = String(options.currency || 'BTC').toUpperCase();
  const txCost = options.txCost != null ? Number(options.txCost) : 0.0005;
  const riskAversion = options.riskAversion != null ? Number(options.riskAversion) : 0.1;
  const maxGamma = options.maxGamma != null ? Number(options.maxGamma) : 50.0;
  const maxVega = options.maxVega != null ? Number(options.maxVega) : 10000.0;
  const maxDelta = options.maxDelta != null ? Number(options.maxDelta) : 5.0;
  const dryRun = Boolean(options.dryRun ?? false);

  const adapter = options.adapter || new DeribitAdapter({
    testnet: options.testnet !== false,
    simulateIfMissingCredentials: true,
  });

  // 1. Fetch Greeks and Spot Price
  const greeks = await adapter.getOptionsGreeks(currency);
  let spotPrice = 0;
  try {
    spotPrice = await adapter.getTickerPrice(`${currency}-PERPETUAL`);
  } catch {
    spotPrice = 0;
  }
  if (!spotPrice || spotPrice <= 0) {
    // Default reference mark price when ticker returns zero in offline/sim mode
    spotPrice = currency === 'BTC' ? 65000 : (currency === 'ETH' ? 3500 : 150);
  }

  // 2. Pre-Trade Risk Verification
  const riskLimits = {
    max_gamma: maxGamma,
    max_vega: maxVega,
    max_delta: maxDelta,
    fail_closed: true,
  };
  const riskDecision = validateOptionsGreeks(greeks, riskLimits);

  if (!riskDecision.approved || riskDecision.halt_trading) {
    return {
      ok: false,
      halted: true,
      currency,
      spotPrice,
      greeks,
      riskDecision,
      reason: riskDecision.reason,
      rebalanced: false,
      timestamp: Date.now(),
    };
  }

  // 3. Evaluate Whalley-Wilmott No-Trade Band
  const band = calculateWhalleyWilmottBand(greeks.gamma, spotPrice, {
    netDelta: greeks.delta,
    transactionCost: txCost,
    riskAversion,
  });

  // 4. Calculate Sizing & Execute Hedge
  let hedgeOrder = null;
  let executionResult = null;

  if (band.needsRebalance) {
    const sizing = calculateInverseHedgeContracts(band.excessDelta, spotPrice, 10);
    hedgeOrder = {
      instrumentId: `${currency}-PERPETUAL`,
      side: sizing.side,
      quantity: sizing.quantity,
      type: 'market',
      netDeltaUsd: sizing.netDeltaUsd,
      contracts: sizing.contracts,
    };

    if (!dryRun && sizing.quantity > 0) {
      executionResult = await adapter.placeOrder({
        instrumentId: hedgeOrder.instrumentId,
        side: hedgeOrder.side,
        quantity: hedgeOrder.quantity,
        type: 'market',
        strategyId: 'options-delta-neutral',
      });
    }
  }

  return {
    ok: true,
    halted: false,
    currency,
    spotPrice,
    greeks,
    band,
    riskDecision,
    hedgeOrder,
    executionResult,
    rebalanced: Boolean(hedgeOrder && hedgeOrder.quantity > 0),
    dryRun,
    timestamp: Date.now(),
  };
}

async function commandOptionsBotRunner(args = []) {
  const currency = optionValue(args, '--currency', 'BTC');
  const maxGamma = numericOption(args, '--max-gamma', 50.0);
  const maxVega = numericOption(args, '--max-vega', 10000.0);
  const maxDelta = numericOption(args, '--max-delta', 5.0);
  const txCost = numericOption(args, '--tx-cost', 0.0005);
  const riskAversion = numericOption(args, '--risk-aversion', 0.1);
  const dryRun = hasFlag(args, '--dry-run');

  const result = await runOptionsBotCycle({
    currency,
    maxGamma,
    maxVega,
    maxDelta,
    txCost,
    riskAversion,
    dryRun,
  });

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  console.log(`\n======================================================================`);
  console.log(`OPTIONS DELTA-NEUTRAL BOT RUNNER: ${result.currency} ($${result.spotPrice.toLocaleString()})`);
  console.log(`======================================================================`);
  console.log(`[NET GREEKS]`);
  console.log(`  Delta: ${(result.greeks?.delta ?? 0).toFixed(4)}`);
  console.log(`  Gamma: ${(result.greeks?.gamma ?? 0).toFixed(4)}`);
  console.log(`  Vega:  $${(result.greeks?.vega ?? 0).toFixed(2)}`);
  console.log(`  Theta: $${(result.greeks?.theta ?? 0).toFixed(2)} / day`);
  console.log(`\n[RISK DECISION]`);
  console.log(`  Approved: ${result.riskDecision?.approved ? '\x1b[32mYES\x1b[0m' : '\x1b[31mNO\x1b[0m'}`);
  console.log(`  Reason:   ${result.riskDecision?.reason}`);
  if (result.band) {
    console.log(`\n[WHALLEY-WILMOTT NO-TRADE BAND]`);
    console.log(`  Band Half-Width: ±${result.band.halfWidth.toFixed(4)}`);
    console.log(`  Rebalance Required: ${result.band.needsRebalance ? '\x1b[33mYES\x1b[0m' : 'NO'}`);
  }
  if (result.hedgeOrder) {
    console.log(`\n[HEDGE INTENT]`);
    console.log(`  Instrument: ${result.hedgeOrder.instrumentId}`);
    console.log(`  Side:       ${result.hedgeOrder.side.toUpperCase()}`);
    console.log(`  Contracts:  ${result.hedgeOrder.quantity} ($10 notional / contract)`);
    if (result.executionResult) {
      console.log(`  Order ID:   ${result.executionResult.orderId} (${result.executionResult.status})`);
    }
  }
  console.log(`======================================================================\n`);

  return result.ok ? 0 : 1;
}

module.exports = {
  runOptionsBotCycle,
  commandOptionsBotRunner,
};
