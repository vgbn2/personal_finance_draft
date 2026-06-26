'use strict';

const { optionValue, hasFlag, printPayload, get_Full_Universe_Symbols } = require('../../lib/utils.js');
const { analyzeTimeframe, aggregateBias, TF_CONFIG } = require('./bias.js');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[90m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';

const ARROW = { long: '↑', short: '↓', neutral: '→', null: '.' };
const PHASE_ORDER = ['1d', '4h', '1h', '1w', '15m', '5m', '1m'];

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function analyzeSymbol({ symbol, family }, tfConfigs) {
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

function renderScorecard(rows, tfKeys, elapsed, totalSymbols, skipped) {
  const date = new Date().toUTCString();
  const families = [...new Set(rows.map(r => r.family))].join(', ') || 'all';
  const tfLabel  = tfKeys.join('/');

  console.log(`\n${BOLD}${CYAN}SOVEREIGN SCORECARD${RESET}  ${DIM}${date}${RESET}`);
  console.log(`${DIM}Families: ${families} · TFs: ${tfLabel} · ${rows.length} assets scored${RESET}`);
  console.log(DIM + '─'.repeat(90) + RESET);

  const hdr =
    '#'.padEnd(4) +
    'Symbol'.padEnd(13) +
    'Family'.padEnd(13) +
    'Bias'.padEnd(9) +
    'Conf'.padEnd(7) +
    'Aligned'.padEnd(9) +
    'Phase'.padEnd(16) +
    tfKeys.map(t => t.padEnd(5)).join('') +
    'Regime';
  console.log(BOLD + hdr + RESET);
  console.log(DIM + '─'.repeat(90) + RESET);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const bc   = biasColor(r.bias);
    const pc   = phaseColor(r.phase);
    const rc   = r.regime === 'trending' ? GREEN : r.regime === 'choppy' ? YELLOW : DIM;
    const confStr = `${(r.confidence * 100).toFixed(0)}%`;
    const alignedStr = r.aligned ? `${GREEN}✔${RESET}` : ' ';
    const phaseStr = r.phase ? `${pc}${r.phase.slice(0, 14)}${RESET}` : `${DIM}n/a${RESET}`;
    const regimeStr = r.regime ? `${rc}${r.regime}${RESET}` : `${DIM}n/a${RESET}`;

    const tfArrows = tfKeys.map(tf => {
      const b = r.tfs[tf];
      const c = b ? biasColor(b) : DIM;
      return `${c}${ARROW[b] || '.'}${RESET}    `;
    }).join('');

    console.log(
      `${CYAN}${String(i + 1).padEnd(4)}${RESET}` +
      `${r.symbol.padEnd(13)}` +
      `${DIM}${r.family.padEnd(13)}${RESET}` +
      `${bc}${r.bias.padEnd(9)}${RESET}` +
      `${confStr.padEnd(7)}` +
      `${alignedStr.padEnd(9 + GREEN.length + RESET.length - 1)}` +
      `${phaseStr.padEnd(16 + pc.length + RESET.length)}` +
      tfArrows +
      regimeStr
    );
  }

  console.log(DIM + '─'.repeat(90) + RESET);
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
    const results = await Promise.allSettled(chunk.map(s => analyzeSymbol(s, tfConfigs)));
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
    renderScorecard(rows, tfKeys, elapsed, filtered.length, skipped);
  }

  return 0;
}

module.exports = { commandScorecard };
