'use strict';

const { optionValue, hasFlag, printPayload, get_Full_Universe_Symbols } = require('../../lib/utils.js');
const { analyzeTimeframe, aggregateBias, TF_CONFIG } = require('./bias.js');
const { STORAGE_TS_DIR } = require('../../../../shared/lib/runtime/paths.js');
const { readTsIndexSince } = require('../../../../shared/lib/market/validation.js');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[90m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';

const ARROW = { long: '↑', short: '↓', neutral: '→', null: '.' };
const PHASE_ORDER = ['1d', '4h', '1h', '1w', '15m', '5m', '1m'];

// Load VIX + SPY + AUDUSD from ts-index to produce a single risk-on/off regime label.
function loadMarketContext() {
  const since = Date.now() - 60 * 24 * 60 * 60 * 1000;

  const vixBars = readTsIndexSince(STORAGE_TS_DIR, 'VIX', '1d', since);
  const vixLast = vixBars.length ? vixBars[vixBars.length - 1].close : null;
  const vixLabel = vixLast === null ? null
    : vixLast < 15 ? 'low' : vixLast < 25 ? 'normal' : vixLast < 35 ? 'elevated' : 'extreme';

  function sma20bias(bars) {
    if (bars.length < 20) return null;
    const closes = bars.map(b => b.close);
    const last = closes[closes.length - 1];
    const sma = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    return last > sma * 1.005 ? 'up' : last < sma * 0.995 ? 'down' : 'flat';
  }

  const spyBias = sma20bias(readTsIndexSince(STORAGE_TS_DIR, 'SPY', '1d', since));
  const audBias = sma20bias(readTsIndexSince(STORAGE_TS_DIR, 'AUDUSD', '1d', since));

  let regime = 'MIXED';
  if ((vixLabel === 'elevated' || vixLabel === 'extreme') && spyBias === 'down') regime = 'RISK-OFF';
  else if ((vixLabel === 'low' || vixLabel === 'normal') && spyBias !== 'down') regime = 'RISK-ON';

  return { regime, vix: vixLast, vixLabel, spyBias, audBias };
}

// Pearson correlation of 30d log-returns between symbol and BTCUSDT.
// btcBars: pre-fetched 1d bars for BTCUSDT (pass once, reuse per symbol).
function computeBtcCorr(symbol, btcBars) {
  if (symbol === 'BTCUSDT' || btcBars.length < 10) return null;
  const since = Date.now() - 35 * 24 * 60 * 60 * 1000;
  const symBars = readTsIndexSince(STORAGE_TS_DIR, symbol, '1d', since);
  if (symBars.length < 10) return null;

  const btcMap = new Map(btcBars.map(b => [b.timestamp, b.close]));
  const pairs = symBars.filter(b => btcMap.has(b.timestamp)).map(b => [b.close, btcMap.get(b.timestamp)]);
  if (pairs.length < 10) return null;

  const xr = [], yr = [];
  for (let i = 1; i < pairs.length; i++) {
    const [x1, y1] = pairs[i - 1], [x2, y2] = pairs[i];
    if (x1 > 0 && x2 > 0 && y1 > 0 && y2 > 0) {
      xr.push(Math.log(x2 / x1));
      yr.push(Math.log(y2 / y1));
    }
  }
  if (xr.length < 5) return null;

  const n = xr.length;
  const mx = xr.reduce((a, b) => a + b, 0) / n;
  const my = yr.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const ex = xr[i] - mx, ey = yr[i] - my;
    num += ex * ey; dx2 += ex * ex; dy2 += ey * ey;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : +(num / denom).toFixed(2);
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function analyzeSymbol({ symbol, family }, tfConfigs, btcBars) {
  const tfs = tfConfigs.map(cfg => analyzeTimeframe(cfg, symbol));
  const agg = aggregateBias(tfs);

  // Phase + regime: take from highest-priority TF that has a value
  let phase = null;
  let regime = null;
  for (const key of PHASE_ORDER) {
    const t = tfs.find(x => x.tf === key && !x.error);
    if (t) {
      if (phase === null && t.phase != null) phase = t.phase;
      if (regime === null && t.regime != null) regime = t.regime;
      if (phase !== null && regime !== null) break;
    }
  }

  const tfMap = {};
  for (const t of tfs) {
    tfMap[t.tf] = t.error ? null : t.bias;
  }

  return {
    symbol, family,
    bias: agg.bias,
    confidence: agg.confidence,
    aligned: agg.aligned,
    score: agg.score,
    phase,
    regime,
    tfs: tfMap,
    btcCorr: computeBtcCorr(symbol, btcBars),
  };
}

function biasColor(b) {
  return b === 'long' ? GREEN : b === 'short' ? RED : YELLOW;
}

function phaseColor(p) {
  if (!p) return DIM;
  const up   = new Set(['markup', 'reaccumulation', 'accumulation']);
  const down = new Set(['markdown', 'distribution', 'redistribution']);
  return up.has(p) ? GREEN : down.has(p) ? RED : YELLOW;
}

function renderMarketContext(ctx) {
  if (!ctx) return;
  const { regime, vix, vixLabel, spyBias, audBias } = ctx;
  const rc = regime === 'RISK-OFF' ? RED : regime === 'RISK-ON' ? GREEN : YELLOW;
  const parts = [`${BOLD}Market:${RESET} ${rc}${regime}${RESET}`];
  if (vix !== null) parts.push(`VIX ${vix.toFixed(1)} ${DIM}(${vixLabel})${RESET}`);
  if (spyBias) parts.push(`SPY: ${spyBias === 'up' ? GREEN : spyBias === 'down' ? RED : YELLOW}${spyBias}${RESET}`);
  if (audBias) parts.push(`AUD/USD: ${audBias === 'up' ? GREEN : RED}${audBias === 'up' ? 'risk-on' : 'risk-off'}${RESET}`);
  console.log(parts.join(`  ${DIM}|${RESET}  `));
}

function renderScorecard(rows, tfKeys, elapsed, totalSymbols, skipped, ctx) {
  const date = new Date().toUTCString();
  const families = [...new Set(rows.map(r => r.family))].join(', ') || 'all';
  const tfLabel  = tfKeys.join('/');
  const W = 98;

  console.log(`\n${BOLD}${CYAN}SOVEREIGN SCORECARD${RESET}  ${DIM}${date}${RESET}`);
  console.log(`${DIM}Families: ${families} · TFs: ${tfLabel} · ${rows.length} assets scored${RESET}`);
  renderMarketContext(ctx);
  console.log(DIM + '─'.repeat(W) + RESET);

  const hdr =
    '#'.padEnd(4) +
    'Symbol'.padEnd(13) +
    'Family'.padEnd(13) +
    'Bias'.padEnd(9) +
    'Conf'.padEnd(7) +
    'Aligned'.padEnd(9) +
    'Phase'.padEnd(16) +
    tfKeys.map(t => t.padEnd(5)).join('') +
    'Regime'.padEnd(12) +
    'BTC-r';
  console.log(BOLD + hdr + RESET);
  console.log(DIM + '─'.repeat(W) + RESET);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const bc   = biasColor(r.bias);
    const pc   = phaseColor(r.phase);
    const rc   = r.regime === 'trending' ? GREEN : r.regime === 'choppy' ? YELLOW : DIM;
    const confStr = `${(r.confidence * 100).toFixed(0)}%`;

    // pad(colored, visible) — pads a pre-colored string to `visible` chars wide
    const pad = (colored, visibleText, w) => colored + ' '.repeat(Math.max(0, w - visibleText.length));

    const alignedText = r.aligned ? '✔' : ' ';
    const alignedStr  = r.aligned ? `${GREEN}✔${RESET}` : ' ';
    const phaseText   = r.phase ? r.phase.slice(0, 14) : 'n/a';
    const phaseStr    = r.phase ? `${pc}${phaseText}${RESET}` : `${DIM}n/a${RESET}`;
    const regimeText  = r.regime || 'n/a';
    const regimeStr   = r.regime ? `${rc}${r.regime}${RESET}` : `${DIM}n/a${RESET}`;

    const tfArrows = tfKeys.map(tf => {
      const b = r.tfs[tf];
      const c = b ? biasColor(b) : DIM;
      return `${c}${ARROW[b] || '.'}${RESET}    `;
    }).join('');

    // BTC-r: color-code; flag decorrelation (< 0.3) with ⚠
    let btcCorrStr = `${DIM}-${RESET}`;
    if (r.btcCorr !== null) {
      const c = r.btcCorr > 0.6 ? DIM : r.btcCorr < 0.3 ? YELLOW : '';
      const warn = r.btcCorr < 0.3 ? ' ⚠' : '';
      btcCorrStr = `${c}${r.btcCorr.toFixed(2)}${warn}${RESET}`;
    }

    console.log(
      `${CYAN}${String(i + 1).padEnd(4)}${RESET}` +
      `${r.symbol.padEnd(13)}` +
      `${DIM}${r.family.padEnd(13)}${RESET}` +
      pad(`${bc}${r.bias}${RESET}`, r.bias, 9) +
      `${confStr.padEnd(7)}` +
      pad(alignedStr, alignedText, 9) +
      pad(phaseStr, phaseText, 16) +
      tfArrows +
      pad(regimeStr, regimeText, 12) +
      btcCorrStr
    );
  }

  console.log(DIM + '─'.repeat(W) + RESET);
  console.log(`${DIM}Scored ${totalSymbols} assets in ${(elapsed / 1000).toFixed(1)}s  (${skipped} skipped — no data)${RESET}\n`);
}

async function commandScorecard(args) {
  const isJson       = hasFlag(args, '--json');
  const familyFilter = optionValue(args, '--family', null);
  const dirFilter    = optionValue(args, '--direction', null);
  const tfArg        = optionValue(args, '--tf', '1h,4h,1d');
  const minConf      = parseFloat(optionValue(args, '--min-conf', '0.3'));
  const topN         = parseInt(optionValue(args, '--top', '50'), 10);

  const tfKeys   = tfArg.split(',').map(s => s.trim()).filter(Boolean);
  const tfConfigs = tfKeys.map(key => TF_CONFIG.find(c => c.tf === key)).filter(Boolean);
  if (tfConfigs.length === 0) {
    process.stderr.write(`[scorecard] No valid TFs in --tf "${tfArg}". Valid: ${TF_CONFIG.map(c => c.tf).join(',')}\n`);
    return 1;
  }

  if (!isJson) process.stdout.write(`\x1b[90m⌛ loading universe...\x1b[0m\r`);

  // Load market context + BTC bars once (shared across all symbol analyses)
  const marketCtx = isJson ? null : loadMarketContext();
  const btcBars = readTsIndexSince(STORAGE_TS_DIR, 'BTCUSDT', '1d', Date.now() - 35 * 24 * 60 * 60 * 1000);

  const universe = await get_Full_Universe_Symbols();
  const filtered = familyFilter
    ? universe.filter(s => s.family === familyFilter)
    : universe;

  if (filtered.length === 0) {
    process.stderr.write(`[scorecard] No symbols found${familyFilter ? ` for family "${familyFilter}"` : ''}.\n`);
    return 1;
  }

  if (!isJson) process.stdout.write(`\x1b[90m⌛ analyzing ${filtered.length} assets across ${tfKeys.join('/')}...\x1b[0m\r`);

  const t0 = Date.now();
  const scorecard = [];

  for (const chunk of chunks(filtered, 8)) {
    const results = await Promise.allSettled(chunk.map(s => analyzeSymbol(s, tfConfigs, btcBars)));
    for (const r of results) {
      if (r.status === 'fulfilled') scorecard.push(r.value);
      // rejected: silently skip (symbol with no data at all)
    }
  }

  const elapsed = Date.now() - t0;

  // Filter
  let rows = scorecard.filter(r => r.confidence >= minConf);
  if (dirFilter) rows = rows.filter(r => r.bias === dirFilter);

  // Sort: highest score (LONG) → 0 (neutral) → lowest (SHORT)
  rows.sort((a, b) => b.score - a.score);
  if (topN > 0) rows = rows.slice(0, topN);

  const skipped = filtered.length - scorecard.length;

  if (isJson) {
    printPayload(rows, args);
  } else {
    if (!isJson) process.stdout.write(' '.repeat(60) + '\r'); // clear spinner line
    renderScorecard(rows, tfKeys, elapsed, filtered.length, skipped, marketCtx);
  }

  return 0;
}

module.exports = { commandScorecard };
