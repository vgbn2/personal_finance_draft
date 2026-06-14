#!/usr/bin/env node
'use strict';

// Mock Strategy #1 — "ML Smoke: Alpaca"
//
// Goal: prove that an order generated from one of our REAL trained ONNX models actually
// reaches a broker. Quality of the signal is not the point (per spec: "doesn't have to
// be good, just need to know that the orders are actually submitted").
//
// Flow: pull a prediction for a US-equity symbol from a real ONNX model (xgboost_v1 by
// default — see scripts/strategies/ml_signal.js), map it to a side, then submit a market
// order via `commandTrade([..., '--live'])`. ALPACA_URL is configured against Alpaca's
// PAPER endpoint (paper-api.alpaca.markets), so '--live' here means "actually call the
// broker API", landing on simulated paper money — not a live MT5/real-money path.
//
// Usage: node scripts/strategies/ml_smoke_alpaca.js [--symbol AAPL] [--model xgboost_v1] [--qty 1] [--dry]

require('#shared/runtime/env');
const { getMlPrediction } = require('./ml_signal');
const { commandTrade } = require('../../backend/cli/commands/trade/trade.js');

function parseArgs(argv) {
  const out = { symbol: 'AAPL', model: 'xgboost_v1', qty: '1', dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--symbol') out.symbol = String(argv[++i] || out.symbol).toUpperCase();
    else if (a === '--model') out.model = argv[++i] || out.model;
    else if (a === '--qty') out.qty = argv[++i] || out.qty;
    else if (a === '--dry') out.dry = true;
  }
  return out;
}

async function main() {
  const { symbol, model, qty, dry } = parseArgs(process.argv.slice(2));

  console.log(`[ml-smoke-alpaca] Asking '${model}' (real ONNX, onnx_runtime) for a read on ${symbol}...`);
  const signal = getMlPrediction({ symbol, model });
  if (!signal.ok) {
    console.error(`[ml-smoke-alpaca] Could not get ML signal: ${signal.error}`);
    return 1;
  }
  console.log(`[ml-smoke-alpaca] ${model} predicts '${signal.label}' for ${symbol} (as_of ${signal.as_of}, class=${signal.predicted_class}, backend=${signal.backend})`);

  // Crude mapping by design — the point is that a real model output drives a real order,
  // not that the mapping is profitable: bearish prediction sells, anything else buys.
  const side = signal.label === 'down' ? 'sell' : 'buy';
  console.log(`[ml-smoke-alpaca] '${signal.label}' -> side '${side}'. Submitting ${dry ? 'DRY-RUN (no order)' : 'LIVE call to Alpaca PAPER API'}: ${side} ${qty} ${symbol} @ market`);

  if (dry) {
    console.log('[ml-smoke-alpaca] --dry passed: skipping order submission.');
    return 0;
  }

  return commandTrade([side, symbol, qty, 'market', '--live', '--json']);
}

main().then((code) => { process.exitCode = code; }).catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
