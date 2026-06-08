#!/usr/bin/env node
'use strict';

// RSI Reversal — live scanner / strategy runner
//
// Walks every DEPLOY/CAUTION entry the research notebook validated
// (notebooks/research/rsi_reversal.py -> notebooks/signal_library.json), checks each one
// against the latest cached bars via rsi_reversal_signal.getRsiReversalSignal(), and
// reports which documented setups just fired (RSI crossed the validated zone boundary on
// the latest bar). With --trade, fired equity/ETF signals are submitted as real paper
// orders through the existing Alpaca path (mirrors ml_smoke_alpaca.js's '--live' = "hits
// the broker's PAPER endpoint" convention).
//
// Crypto entries (BTC-USD, SOL-USD, XRP-USD — the library's yfinance tickers map to
// BTCUSDT/SOLUSDT/XRPUSDT in the local cache) are reported but not traded here: Alpaca
// crypto order routing is a separate integration this script doesn't attempt.
//
// Position sizing: the library prescribes a quarter-Kelly fraction of equity and a
// stop distance in ATR units (mae_95_atr). Translating that into share quantity needs a
// live account-equity read and a real risk-per-trade policy — out of scope for this pass,
// so orders use a flat --qty (default 1), same as ml_smoke_alpaca.js. The prescribed size
// and stop are still computed and printed so a sizing layer has something real to consume.
//
// --confluence [model] additionally requires a real ONNX model (default xgboost_v1) to
// agree on direction (see rsi_ml_confluence.js) before a fired setup counts as actionable —
// raises conviction by requiring two independent reads to align, at the cost of fewer hits.
//
// Usage: node scripts/strategies/rsi_reversal_live.js [--trade] [--qty 1] [--confluence [model]] [--dry]
//   (no flags = report only; --trade submits paper orders for fired equity/ETF signals)

require('#shared/env');
const { getRsiReversalSignal, actionableSignals } = require('./rsi_reversal_signal');
const { getConfluenceSignal } = require('./rsi_ml_confluence');
const { commandTrade } = require('../../backend/cli/commands/trade/trade.js');
const { inferFamily } = require('../../shared/lib/quote_router');

function parseArgs(argv) {
  const out = {
    trade: false, qty: '1', dry: false, confluence: false, model: 'xgboost_v1',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--trade') out.trade = true;
    else if (a === '--qty') out.qty = argv[++i] || out.qty;
    else if (a === '--dry') out.dry = true;
    else if (a === '--confluence') {
      out.confluence = true;
      // optional model name follows; only consume it if it isn't another flag
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) out.model = argv[++i];
    }
  }
  return out;
}

function dedupeKey(s) {
  return `${s.asset}|${s.timeframe}|${s.condition}|${s.entry}`;
}

async function main() {
  const {
    trade, qty, dry, confluence, model,
  } = parseArgs(process.argv.slice(2));

  const entries = actionableSignals();
  const seen = new Set();
  const unique = entries.filter((s) => {
    const key = dedupeKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[rsi-reversal-live] Checking ${unique.length} actionable signal(s) from notebooks/signal_library.json against live cached bars`
    + `${confluence ? ` (confluence with '${model}' required)` : ''}...`);

  const fired = [];
  for (const entry of unique) {
    let rsiResult;
    let confluenceResult = null;

    if (confluence) {
      confluenceResult = getConfluenceSignal({
        asset: entry.asset, timeframe: entry.timeframe, condition: entry.condition, entry: entry.entry, model,
      });
      if (!confluenceResult.ok) {
        console.log(`  ${entry.asset.padEnd(8)} ${entry.timeframe.padEnd(4)} ${entry.condition.padEnd(10)} ${entry.entry.padEnd(9)} -> skip (${confluenceResult.error})`);
        continue;
      }
      rsiResult = confluenceResult.rsi;
    } else {
      rsiResult = getRsiReversalSignal({
        asset: entry.asset, timeframe: entry.timeframe, condition: entry.condition, entry: entry.entry,
      });
      if (!rsiResult.ok) {
        console.log(`  ${entry.asset.padEnd(8)} ${entry.timeframe.padEnd(4)} ${entry.condition.padEnd(10)} ${entry.entry.padEnd(9)} -> skip (${rsiResult.error})`);
        continue;
      }
    }

    let status = rsiResult.fired ? 'FIRED' : 'waiting';
    let mlNote = '';
    if (confluence) {
      const ml = confluenceResult.ml;
      mlNote = ml.ok
        ? ` | ML(${model}) reads '${ml.label}' (expects '${confluenceResult.expected_ml_label}') -> ${confluenceResult.agreement === true ? 'AGREE' : confluenceResult.agreement === false ? 'disagree' : 'neutral'}`
        : ` | ML(${model}) unavailable (${ml.error})`;
      if (rsiResult.fired) status = confluenceResult.confluent ? 'CONFLUENT' : 'fired-no-confluence';
    }

    console.log(
      `  ${rsiResult.asset.padEnd(8)} ${rsiResult.timeframe.padEnd(4)} ${rsiResult.condition.padEnd(10)} ${rsiResult.entry.padEnd(9)} `
      + `RSI ${rsiResult.rsi_prev.toFixed(1)}->${rsiResult.rsi_curr.toFixed(1)} (zone ${rsiResult.threshold}) `
      + `[${rsiResult.trust}] -> ${status}${mlNote}`,
    );

    const actionable = confluence ? confluenceResult.confluent : rsiResult.fired;
    if (actionable) fired.push(rsiResult);
  }

  if (fired.length === 0) {
    console.log(`[rsi-reversal-live] No ${confluence ? 'confluent' : 'documented'} setups fired on the latest bar.`);
    return 0;
  }

  console.log(`\n[rsi-reversal-live] ${fired.length} ${confluence ? 'confluent ' : ''}setup(s) fired:`);
  for (const f of fired) {
    console.log(
      `  ${f.side.toUpperCase()} ${f.asset} (${f.cache_symbol}) @ ~${f.entry_price.toFixed(2)} `
      + `| stop ~${f.stop_price !== null ? f.stop_price.toFixed(2) : '—'} `
      + `| 1/4-Kelly ${f.quarter_kelly !== null ? f.quarter_kelly.toFixed(3) : '—'} `
      + `| P(net>0) ${f.p_net_pos !== null ? f.p_net_pos.toFixed(3) : '—'} | ${f.verdict} (OOS ${f.oos_str})`,
    );
  }

  if (dry || !trade) {
    console.log(`\n[rsi-reversal-live] ${dry ? '--dry passed' : 'reporting only (pass --trade to submit paper orders)'}: no orders submitted.`);
    return 0;
  }

  let exitCode = 0;
  for (const f of fired) {
    if (inferFamily(f.asset) === 'crypto') {
      console.log(`[rsi-reversal-live] ${f.asset} fired but is a crypto asset — Alpaca crypto routing isn't wired here, skipping order.`);
      continue;
    }
    console.log(`[rsi-reversal-live] Submitting LIVE call to Alpaca PAPER API: ${f.side} ${qty} ${f.asset} @ market...`);
    const code = await commandTrade([f.side, f.asset, qty, 'market', '--live', '--json']);
    if (code !== 0) exitCode = code;
  }
  return exitCode;
}

main().then((code) => { process.exitCode = code; }).catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
