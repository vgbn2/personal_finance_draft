#!/usr/bin/env node
'use strict';

// Mock Strategy #2 — "ML Smoke: Polymarket"
//
// Goal: prove that an order generated from one of our REAL trained ONNX models actually
// reaches the Polymarket paper-trading path (writes real fills to
// storage/data/paper_trading/ via runPolymarketPaperRun -> savePortfolio/fills.jsonl).
// Quality of the signal is not the point — order submission is.
//
// Polymarket's prediction markets aren't price/symbol-keyed, so there's no direct way to
// hand our OHLCV-trained ONNX models a market to score (that's a real future-design problem,
// not a smoke-test one). Instead: read a real model's (logistic_v1 by default) directional
// call on a representative crypto symbol as a crude "regime" signal, and let THAT pick which
// of the existing paper-run strategy labels to execute. The paper-run scanner itself is
// generic (see polymarket_paper.js — `strategy` is a label/tag, not pluggable per-strategy
// logic), so this is the most direct way to make a real ONNX prediction the thing that
// decides which real paper order flow runs.
//
// Usage: node scripts/strategies/ml_smoke_polymarket.js [--symbol BTCUSDT] [--model logistic_v1] [--dry]

require('#shared/runtime/env');
const { getMlPrediction } = require('./ml_signal');
const { commandPolymarket } = require('../../backend/cli/commands/trade/trade.js');

// Crude regime -> paper-strategy mapping, chosen for a defensible-enough story, not edge:
//   bearish  -> low_prob_dip  (hunt for cheap, beaten-down markets)
//   flat/up  -> mean_revert   (bet on reversion to fair value)
const STRATEGY_BY_REGIME = {
  down: 'low_prob_dip',
  flat: 'mean_revert',
  up: 'mean_revert',
};

function parseArgs(argv) {
  const out = { symbol: 'BTCUSDT', model: 'logistic_v1', dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--symbol') out.symbol = String(argv[++i] || out.symbol).toUpperCase();
    else if (a === '--model') out.model = argv[++i] || out.model;
    else if (a === '--dry') out.dry = true;
  }
  return out;
}

async function main() {
  const { symbol, model, dry } = parseArgs(process.argv.slice(2));

  console.log(`[ml-smoke-polymarket] Asking '${model}' (real ONNX, onnx_runtime) for a regime read via ${symbol}...`);
  const signal = getMlPrediction({ symbol, model });
  if (!signal.ok) {
    console.error(`[ml-smoke-polymarket] Could not get ML signal: ${signal.error}`);
    return 1;
  }
  console.log(`[ml-smoke-polymarket] ${model} reads '${signal.label}' (as_of ${signal.as_of}, class=${signal.predicted_class}, backend=${signal.backend})`);

  const strategy = STRATEGY_BY_REGIME[signal.label] || 'mean_revert';
  console.log(`[ml-smoke-polymarket] '${signal.label}' regime -> running paper strategy '${strategy}' (writes real fills to storage/data/paper_trading/)`);

  if (dry) {
    console.log('[ml-smoke-polymarket] --dry passed: skipping paper-run submission.');
    return 0;
  }

  return commandPolymarket(['paper-run', '--strategy', strategy, '--json']);
}

main().then((code) => { process.exitCode = code; }).catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
