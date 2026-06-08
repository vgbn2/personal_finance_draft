#!/usr/bin/env node
'use strict';

// RSI Reversal — native backtest harness
//
// Runs notebooks/research/rsi_reversal.py's "RSI Signal Strength Analyzer" loop
// (shared/lib/rsi_backtest.js — a 1:1 port of its crossover/outcome/Bayesian/Kelly
// math) directly against the platform's own cached bars (storage/data/ts/*.bin),
// instead of pulling fresh history from yfinance via the Jupyter notebook.
//
// Why this exists: "which pairs/timeframes does price actually react to at RSI
// zone boundaries?" is an empirical question the platform should be able to answer
// from its own data on demand — re-running the Python notebook requires Jupyter,
// yfinance, and a full redownload every time. This gives the same DEPLOY/CAUTION/
// SKIP verdicts, Kelly sizing and OOS check, scoped to whatever history the local
// `.bin` cache actually has (which can be shorter than the notebook's yfinance pull —
// see the [data] column in the report).
//
// Usage:
//   node scripts/strategies/rsi_reversal_backtest.js [--tf 1h,1d,...] [--asset SPY,...]
//                                                      [--export <path>] [--quiet]
//
//   --tf       comma-separated timeframes to scan (default: 1d,1wk,1mo — 1h cached
//              history is too short locally to pass the notebook's >=8-cluster bar)
//   --asset    comma-separated assets to scan (default: notebook's ASSETS list)
//   --export   write a notebooks/signal_library.json-shaped file with the
//              actionable (DEPLOY/CAUTION, OOS-clean) signals this run finds
//   --quiet    skip the per-asset/TF detail table, print only top signals + summary

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../shared/lib/paths');
const { inferFamily, normalizeSymbol } = require('../../shared/lib/quote_router');
const { loadBars } = require('./rsi_reversal_signal');
const {
  analyzeSeries, extractActionable, RSI_PERIOD, OVERSOLD_TH, OVERBOUGHT_TH, COST_PCT, OOS_DATE,
} = require('../../shared/lib/rsi_backtest');

// Mirrors rsi_reversal.py CONFIG. forward_bars/regime_ma must match the notebook's
// values for normalized returns (and verdicts) to be apples-to-apples comparable.
const ASSETS = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD',
  'SPY', 'QQQ', 'IWM',
  'TLT',
  'GLD', 'SLV', 'USO',
];

// The local cache doesn't carry these ETF tickers themselves, but it does carry the
// underlying spot/futures series they track closely — use those as proxies so the scan
// isn't blind to gold/silver/oil reactions. TLT (treasury bonds) has no such proxy in the
// cache (no bond/rates series), so it's left to the normal symbol lookup and skips.
const CACHE_SYMBOL_OVERRIDES = {
  GLD: 'XAUUSD', // SPDR Gold Trust -> spot gold
  SLV: 'XAGUSD', // iShares Silver Trust -> spot silver
  USO: 'USOIL',  // United States Oil Fund -> WTI crude proxy
};

const TIMEFRAMES = {
  '1h': { forwardBars: 48, regimeMaPeriod: 4800 },
  '1d': { forwardBars: 21, regimeMaPeriod: 200 },
  '1wk': { forwardBars: 4, regimeMaPeriod: 52 },
  '1mo': { forwardBars: 3, regimeMaPeriod: 12 },
};

// 1h local cache only spans ~months (vs. the notebook's 730-day yfinance pull),
// so 1h almost always lands in DISCARD (n_eff < 8) here — scan 1d/1wk/1mo by default.
const DEFAULT_TIMEFRAMES = ['1d', '1wk', '1mo'];

function parseArgs(argv) {
  const out = {
    timeframes: DEFAULT_TIMEFRAMES, assets: ASSETS, exportPath: null, quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--tf') out.timeframes = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--asset') out.assets = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--export') out.exportPath = path.resolve(argv[++i] || 'signal_library.backtest.json');
    else if (a === '--quiet') out.quiet = true;
  }
  return out;
}

function fmtPct(v) {
  return Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
}
function fmtNum(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}
function fmtSigned(v, d = 2) {
  if (!Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
}

function printDetailRow(asset, timeframe, condLabel, entryLabel, stats, oos, tier) {
  if (!stats || !stats.ok) return;
  const v = require('../../shared/lib/rsi_backtest').verdict(stats, oos, tier);
  console.log(
    `  ${asset.padEnd(9)} ${timeframe.padEnd(4)} ${condLabel.padEnd(10)} ${entryLabel.padEnd(9)} `
    + `n=${String(stats.n).padEnd(4)} hit=${fmtPct(stats.hit_rate).padEnd(6)} `
    + `kelly=${fmtSigned(stats.kelly, 3).padEnd(7)} 1/4=${fmtSigned(stats.kelly / 4, 3).padEnd(7)} `
    + `netNorm=${fmtSigned(stats.avg_net_norm).padEnd(6)} P(net>0)=${fmtNum(stats.p_net_pos, 3).padEnd(5)} `
    + `[${tier}] ${v.label}  OOS:${v.oos_ok}`,
  );
}

async function main() {
  const {
    timeframes, assets, exportPath, quiet,
  } = parseArgs(process.argv.slice(2));

  console.log('[rsi-backtest] Native re-run of notebooks/research/rsi_reversal.py\'s analyzer '
    + 'against locally cached bars (storage/data/ts/).');
  console.log(`[rsi-backtest] RSI/ATR period=${RSI_PERIOD}  oversold<${OVERSOLD_TH}  overbought>${OVERBOUGHT_TH}  `
    + `cost=${(COST_PCT * 100).toFixed(2)}%  OOS split=${OOS_DATE}`);
  console.log(`[rsi-backtest] Scanning ${assets.length} asset(s) x ${timeframes.length} timeframe(s): ${timeframes.join(', ')}\n`);

  const analyses = [];
  for (const asset of assets) {
    const cacheSymbol = CACHE_SYMBOL_OVERRIDES[asset] || normalizeSymbol(asset, inferFamily(asset));
    for (const tf of timeframes) {
      const tfCfg = TIMEFRAMES[tf];
      if (!tfCfg) {
        console.log(`  ${asset.padEnd(9)} ${tf.padEnd(4)} -> skip (unknown timeframe, not in TIMEFRAMES config)`);
        continue;
      }
      const bars = loadBars(cacheSymbol, tf);
      if (!bars || bars.length < RSI_PERIOD * 3) {
        console.log(`  ${asset.padEnd(9)} ${tf.padEnd(4)} -> skip (no/insufficient cached bars for '${cacheSymbol}')`);
        continue;
      }

      const analysis = analyzeSeries({
        bars, timeframe: tf, forwardBars: tfCfg.forwardBars, regimeMaPeriod: tfCfg.regimeMaPeriod,
      });
      if (!analysis) {
        console.log(`  ${asset.padEnd(9)} ${tf.padEnd(4)} -> skip (analysis returned no result)`);
        continue;
      }
      analyses.push({ asset, analysis });

      if (!quiet) {
        const span = `${bars[0].timestamp.slice(0, 10)}→${bars[bars.length - 1].timestamp.slice(0, 10)}`;
        console.log(`  ${asset.padEnd(9)} ${tf.padEnd(4)} ✓ ${String(bars.length).padStart(5)} bars  [${span}]  `
          + `OS n=${analysis.oversold.n}/eff${analysis.oversold.n_eff ?? '—'}  `
          + `OB n=${analysis.overbought.n}/eff${analysis.overbought.n_eff ?? '—'}`);
        printDetailRow(asset, tf, 'oversold', 'crossover', analysis.oversold, analysis.os_oos, analysis.oversold.tier);
        printDetailRow(asset, tf, 'oversold', 'recovery', analysis.os_recovery, analysis.os_rec_oos, analysis.oversold.tier);
        printDetailRow(asset, tf, 'overbought', 'crossover', analysis.overbought, analysis.ob_oos, analysis.overbought.tier);
        printDetailRow(asset, tf, 'overbought', 'recovery', analysis.ob_recovery, analysis.ob_rec_oos, analysis.overbought.tier);
      }
    }
  }

  const actionable = extractActionable(analyses);

  console.log(`\n${'═'.repeat(100)}`);
  console.log(`  TOP SIGNALS — ${actionable.length} actionable (DEPLOY/CAUTION, OOS-clean), sorted by Kelly f*`);
  console.log('═'.repeat(100));
  if (!actionable.length) {
    console.log('  No actionable setups found in the scanned range — either no genuine reaction at these '
      + 'zone boundaries for this data window, or the cached history is too short to clear the trust bar.');
  } else {
    for (const s of actionable) {
      console.log(
        `  ${s.asset.padEnd(9)} ${s.timeframe.padEnd(4)} ${s.condition.padEnd(10)} ${s.entry.padEnd(9)} `
        + `n=${String(s.n).padEnd(4)} kelly=${fmtSigned(s.kelly, 3).padEnd(7)} 1/4=${fmtSigned(s.quarter_kelly, 3).padEnd(7)} `
        + `payoff=${fmtNum(s.payoff).padEnd(5)} netNorm=${fmtSigned(s.net_norm).padEnd(6)} `
        + `P(net>0)=${fmtNum(s.p_net_pos, 3).padEnd(5)} [${s.trust}] ${s.verdict}  OOS ${s.oos_str}`,
      );
    }
  }

  const deployCount = actionable.filter((s) => s.verdict.includes('DEPLOY')).length;
  const cautionCount = actionable.filter((s) => s.verdict.includes('CAUTION')).length;
  console.log(`\n[rsi-backtest] ${deployCount} DEPLOY, ${cautionCount} CAUTION, ${actionable.length} total actionable.`);

  if (exportPath) {
    const output = {
      generated: new Date().toISOString(),
      source: 'native (shared/lib/rsi_backtest.js against storage/data/ts/ cached bars)',
      config: {
        oversold_threshold: OVERSOLD_TH,
        overbought_threshold: OVERBOUGHT_TH,
        rsi_period: RSI_PERIOD,
        cost_pct: COST_PCT,
        oos_split_date: OOS_DATE,
        timeframes_scanned: timeframes,
        forward_bars: Object.fromEntries(Object.entries(TIMEFRAMES).map(([tf, c]) => [tf, c.forwardBars])),
      },
      summary: { total: actionable.length, deploy: deployCount, caution: cautionCount },
      signals: actionable,
      integration_notes: {
        position_size: 'quarter_kelly × account_equity / (mae_95_atr × ATR)',
        stop_distance: 'entry_price ± (mae_95_atr × ATR_at_signal)',
        note: 'Cross-check against notebooks/signal_library.json (yfinance-sourced, longer history) '
          + 'before treating a signal here as validated — local cache history can be much shorter '
          + 'per asset/timeframe (see the [data] span printed per row).',
      },
    };
    fs.writeFileSync(exportPath, JSON.stringify(output, null, 2));
    console.log(`[rsi-backtest] Exported ${actionable.length} signal(s) -> ${path.relative(REPO_ROOT, exportPath)}`);
  }

  return 0;
}

main().then((code) => { process.exitCode = code; }).catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
