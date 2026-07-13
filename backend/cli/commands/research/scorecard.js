'use strict';

const { optionValue, hasFlag, printPayload, get_Full_Universe_Symbols } = require('../../lib/utils.js');
const { analyzeTimeframe, aggregateBias, TF_CONFIG } = require('./bias.js');
const { STORAGE_TS_DIR } = require('../../../../shared/lib/runtime/paths.js');
const { readTsIndexSince } = require('../../../../shared/lib/market/validation.js');
const { buildRecordedAppleShadow, RECORDED_AAPL_FIXTURE_ID } = require('../../../../shared/lib/analysis/services/equity_3m_shadow.js');
const { buildAllRecordedShadowCatalog, ALL_RECORDED_FIXTURE_ID, filterShadowCatalog } = require('../../../../shared/lib/analysis/services/shadow_catalog.js');
const { visibleLength, padVisibleRight, clipVisible } = require('./research_render.js');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[90m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';

const ARROW = { long: '↑', short: '↓', neutral: '→', null: '.' };
const PHASE_ORDER = ['1d', '4h', '1h', '1w', '15m', '5m', '1m'];
const SCORECARD_FAMILIES = new Set(['equities', 'indices', 'commodities', 'fx', 'crypto']);
const SCORECARD_REFRESH_DAYS = '30';
const SCORECARD_REFRESH_CONCURRENCY = '3';

function canColorize() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function tint(text, color, enabled = canColorize()) {
  return enabled ? `${color}${text}${RESET}` : text;
}

function stateBadge(state, enabled = canColorize()) {
  if (state === 'degraded') return tint('degraded', YELLOW, enabled);
  if (state === 'excluded') return tint('excluded', RED, enabled);
  return tint('eligible', GREEN, enabled);
}

function coverageText(row) {
  if (!Number.isFinite(row.coverage)) return 'n/a';
  return `${(row.coverage * 100).toFixed(0)}%`;
}

function joinSummaryParts(parts, colorize = canColorize()) {
  return parts.filter(Boolean).join(colorize ? `  ${DIM}·${RESET}  ` : '  ·  ');
}

function wrapSegmentList(segments, width, indent, separator = ', ') {
  const lines = [];
  const continuation = ' '.repeat(visibleLength(indent));
  let line = indent;
  for (const segment of segments) {
    const token = segment.trim();
    if (!token) continue;
    const next = line === indent ? `${indent}${token}` : `${line}${separator}${token}`;
    if (visibleLength(next) > width && line !== indent) {
      lines.push(line);
      line = `${continuation}${token}`;
    } else {
      line = next;
    }
  }
  if (line !== indent) lines.push(clipVisible(line, width));
  return lines.length ? lines : [indent];
}

function summarizeShadowRows(rows) {
  const counts = { eligible: 0, degraded: 0, excluded: 0 };
  for (const row of rows) {
    const state = row.decision_state || 'eligible';
    counts[state] = (counts[state] || 0) + 1;
  }
  return counts;
}

// Load VIX + SPY + AUDUSD from ts-index to produce a single risk-on/off regime label.
function loadMarketContext({ tsDir = STORAGE_TS_DIR, now = Date.now() } = {}) {
  const since = now - 60 * 24 * 60 * 60 * 1000;

  const vixBars = readTsIndexSince(tsDir, 'VIX', '1d', since) || [];
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

  const spyBias = sma20bias(readTsIndexSince(tsDir, 'SPY', '1d', since) || []);
  const audBias = sma20bias(readTsIndexSince(tsDir, 'AUDUSD', '1d', since) || []);

  let regime = 'MIXED';
  if ((vixLabel === 'elevated' || vixLabel === 'extreme') && spyBias === 'down') regime = 'RISK-OFF';
  else if ((vixLabel === 'low' || vixLabel === 'normal') && spyBias !== 'down') regime = 'RISK-ON';

  return { regime, vix: vixLast, vixLabel, spyBias, audBias };
}

// Pearson correlation of 30d log-returns between symbol and BTCUSDT.
// btcBars: pre-fetched 1d bars for BTCUSDT (pass once, reuse per symbol).
function computeBtcCorr(symbol, btcBars, { tsDir = STORAGE_TS_DIR, now = Date.now() } = {}) {
  if (symbol === 'BTCUSDT' || btcBars.length < 10) return null;
  const since = now - 35 * 24 * 60 * 60 * 1000;
  const symBars = readTsIndexSince(tsDir, symbol, '1d', since) || [];
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

async function analyzeSymbol({ symbol, family }, tfConfigs, btcBars, options = {}) {
  const tfs = tfConfigs.map(cfg => analyzeTimeframe(cfg, symbol, { ...options, family }));
  const valid = tfs.filter((timeframe) => !timeframe.error);
  const invalid = tfs.filter((timeframe) => timeframe.error);
  if (valid.length === 0) {
    return {
      eligible: false,
      exclusion: {
        symbol,
        family,
        reasons: invalid.map((timeframe) => ({
          timeframe: timeframe.tf,
          reason: timeframe.error,
          bars: timeframe.bars,
          last_bar_at: timeframe.last_bar_at || null,
          age_ms: timeframe.age_ms ?? null,
          freshness_limit_ms: timeframe.freshness_limit_ms ?? null,
        })),
      },
    };
  }
  if (invalid.length > 0 && !options.allowDegraded) {
    return {
      eligible: false,
      exclusion: {
        symbol,
        family,
        reasons: invalid.map((timeframe) => ({
          timeframe: timeframe.tf,
          reason: timeframe.error,
          bars: timeframe.bars,
          last_bar_at: timeframe.last_bar_at || null,
          age_ms: timeframe.age_ms ?? null,
          freshness_limit_ms: timeframe.freshness_limit_ms ?? null,
        })),
      },
    };
  }
  const agg = aggregateBias(tfs);
  const coverage = +(valid.length / tfs.length).toFixed(2);
  const decisionState = invalid.length > 0 ? 'degraded' : 'eligible';

  // Phase + regime: take from highest-priority TF that has a value
  let phase = null;
  let regime = null;
  for (const key of PHASE_ORDER) {
    const t = valid.find(x => x.tf === key);
    if (t) {
      if (phase === null && t.phase != null) phase = t.phase;
      if (regime === null && t.regime != null) regime = t.regime;
      if (phase !== null && regime !== null) break;
    }
  }

  const tfMap = {};
  const timeframeDetails = {};
  for (const t of tfs) {
    tfMap[t.tf] = t.error ? null : t.bias;
    timeframeDetails[t.tf] = {
      bias: t.bias,
      last_bar_at: t.last_bar_at,
      age_ms: t.age_ms,
      valid_until: t.valid_until,
      bars: t.bars,
    };
  }

  const lastBarTimes = valid.map((timeframe) => Date.parse(timeframe.last_bar_at)).filter((value) => Number.isFinite(value));
  const validUntilTimes = valid.map((timeframe) => Date.parse(timeframe.valid_until)).filter((value) => Number.isFinite(value));

  return {
    eligible: true,
    symbol, family,
    bias: agg.bias,
    confidence: agg.confidence,
    aligned: agg.aligned,
    score: agg.score,
    phase,
    regime,
    decision_state: decisionState,
    coverage,
    degraded_reasons: invalid.map((timeframe) => ({
      timeframe: timeframe.tf,
      reason: timeframe.error,
      bars: timeframe.bars,
      last_bar_at: timeframe.last_bar_at || null,
      age_ms: timeframe.age_ms ?? null,
      freshness_limit_ms: timeframe.freshness_limit_ms ?? null,
    })),
    tfs: tfMap,
    timeframe_details: timeframeDetails,
    data_as_of: new Date(Math.min(...lastBarTimes)).toISOString(),
    latest_bar_at: new Date(Math.max(...lastBarTimes)).toISOString(),
    valid_until: validUntilTimes.length ? new Date(Math.min(...validUntilTimes)).toISOString() : null,
    complete: decisionState === 'eligible',
    confidence_kind: 'heuristic_vote_strength',
    btcCorr: computeBtcCorr(symbol, btcBars, options),
  };
}

function biasColor(b) {
  return b === 'long' ? GREEN : b === 'short' ? RED : YELLOW;
}

function renderMarketContext(ctx, colorize = canColorize()) {
  if (!ctx) return null;
  const { regime, vix, vixLabel, spyBias, audBias } = ctx;
  const rc = regime === 'RISK-OFF' ? RED : regime === 'RISK-ON' ? GREEN : YELLOW;
  const parts = [`Market ${tint(regime, rc, colorize)}`];
  if (vix !== null) parts.push(`VIX ${vix.toFixed(1)} (${vixLabel})`);
  if (spyBias) parts.push(`SPY ${spyBias}`);
  if (audBias) parts.push(`AUD/USD ${audBias === 'up' ? 'risk-on' : 'risk-off'}`);
  return joinSummaryParts(parts, colorize);
}

function renderExclusionSummary(summary, colorize = canColorize(), width = 100) {
  if (!summary || summary.total === 0) return [];
  const reasons = Object.entries(summary.by_reason)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(' · ');
  const timeframes = Object.entries(summary.by_timeframe)
    .map(([timeframe, counts]) => `${timeframe}: ${Object.entries(counts).map(([reason, count]) => `${reason} ${count}`).join(', ')}`);
  return [
    tint(`Data checks  ${reasons}`, DIM, colorize),
    ...wrapSegmentList(timeframes, width, 'By timeframe  ', ' · ').map((line) => tint(line, DIM, colorize)),
  ];
}

function renderNoRows(counts, filters) {
  if (counts.confidence_filtered > 0) {
    const noun = counts.confidence_filtered === 1 ? 'candidate' : 'candidates';
    return `No rows shown: ${counts.confidence_filtered} ${noun} below the ${(filters.min_confidence * 100).toFixed(0)}% confidence floor.`;
  }
  if (counts.direction_filtered > 0) {
    const noun = counts.direction_filtered === 1 ? 'candidate' : 'candidates';
    return `No rows shown: ${counts.direction_filtered} ${noun} did not match direction ${filters.direction}.`;
  }
  if (counts.excluded_symbols > 0) return 'No usable rows: all evaluated assets failed the requested data checks.';
  return 'No rows match the current filters.';
}

function timeframeCell(row, timeframes, colorize) {
  return timeframes.map((timeframe) => {
    const bias = row.tfs[timeframe];
    return tint(ARROW[bias] || '.', bias ? biasColor(bias) : DIM, colorize);
  }).join('/');
}

function renderScorecard(rows, filters, elapsed, counts, ctx, options = {}) {
  const width = Math.max(60, options.width || process.stdout.columns || 100);
  const colorize = options.colorize ?? canColorize();
  const compact = width < 100;
  const date = new Date().toUTCString();
  const families = filters.family || 'all price families';
  const tfLabel  = filters.timeframes.join('/');
  const status = joinSummaryParts([
    `${counts.eligible_symbols ?? 0} eligible`,
    `${counts.degraded_symbols ?? 0} degraded`,
    `${counts.excluded_symbols ?? 0} excluded`,
    counts.confidence_filtered ? `${counts.confidence_filtered} below confidence` : null,
    counts.direction_filtered ? `${counts.direction_filtered} direction-filtered` : null,
    counts.truncated_symbols ? `${counts.truncated_symbols} beyond top limit` : null,
    `${rows.length} shown`,
  ], colorize);
  const lines = [
    '',
    `${tint('SOVEREIGN SCORECARD', `${BOLD}${CYAN}`, colorize)}  ${tint(date, DIM, colorize)}`,
    tint(`${counts.total_symbols} evaluated in ${(elapsed / 1000).toFixed(1)}s  ·  ${families}  ·  ${tfLabel}  ·  floor ${(filters.min_confidence * 100).toFixed(0)}%`, DIM, colorize),
    `Status  ${status}`,
  ];
  const market = renderMarketContext(ctx, colorize);
  if (market) lines.push(market);

  if (rows.length === 0) {
    lines.push('', renderNoRows(counts, filters));
  } else {
    const header = compact
      ? `${'#'.padEnd(3)}${'ASSET'.padEnd(14)}${'DIR'.padEnd(8)}${'CONF'.padEnd(6)}${'COV'.padEnd(6)}${'STATE'.padEnd(11)}TF ${tfLabel}`
      : `${'#'.padEnd(3)}${'ASSET'.padEnd(14)}${'FAMILY'.padEnd(13)}${'DIR'.padEnd(8)}${'CONF'.padEnd(6)}${'COV'.padEnd(6)}${'STATE'.padEnd(11)}${'TF'.padEnd(12)}PHASE`;
    lines.push('', tint(header, BOLD, colorize));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const confidence = `${(row.confidence * 100).toFixed(0)}%`;
      const coverage = coverageText(row);
      const state = row.decision_state || 'eligible';
      const prefix = `${String(i + 1).padEnd(3)}${row.symbol.padEnd(14)}`;
      const core = `${padVisibleRight(tint(row.bias, biasColor(row.bias), colorize), 8)}${confidence.padEnd(6)}${coverage.padEnd(6)}${padVisibleRight(stateBadge(state, colorize), 11)}`;
      if (compact) lines.push(`${prefix}${core}${timeframeCell(row, filters.timeframes, colorize)}`);
      else lines.push(`${prefix}${row.family.padEnd(13)}${core}${padVisibleRight(timeframeCell(row, filters.timeframes, colorize), 12)}${row.phase || 'n/a'}`);
    }
  }

  const exclusionLines = renderExclusionSummary(counts.exclusion_summary, colorize, width);
  if (exclusionLines.length) lines.push('', ...exclusionLines);
  return `${lines.map((line) => clipVisible(line, width)).join('\n')}\n`;
}

function summarizeExclusions(exclusions) {
  const summary = { total: exclusions.length, by_reason: {}, by_timeframe: {} };
  for (const exclusion of exclusions) {
    for (const detail of exclusion.reasons || []) {
      const reason = detail.reason || 'analysis failed';
      const timeframe = detail.timeframe || 'unknown';
      summary.by_reason[reason] = (summary.by_reason[reason] || 0) + 1;
      summary.by_timeframe[timeframe] = summary.by_timeframe[timeframe] || {};
      summary.by_timeframe[timeframe][reason] = (summary.by_timeframe[timeframe][reason] || 0) + 1;
    }
  }
  return summary;
}

function buildScorecardRefreshArgs(filters) {
  return [
    '--families', filters.family || [...SCORECARD_FAMILIES].join(','),
    '--timeframes', filters.timeframes.join(','),
    '--days', SCORECARD_REFRESH_DAYS,
    '--concurrency', SCORECARD_REFRESH_CONCURRENCY,
  ];
}

async function refreshScorecardData(filters, runner = null) {
  const { commandMassBackfill } = require('../data/data.js');
  return (runner || commandMassBackfill)(buildScorecardRefreshArgs(filters));
}

function parseScorecardOptions(args) {
  const familyFilter = optionValue(args, '--family', null);
  const dirFilter    = optionValue(args, '--direction', null);
  const tfArg        = optionValue(args, '--tf', '1h,4h,1d');
  const minConf      = parseFloat(optionValue(args, '--min-conf', '0.3'));
  const topN         = parseInt(optionValue(args, '--top', '50'), 10);
  const allowDegraded = hasFlag(args, '--allow-degraded');

  const tfKeys   = tfArg.split(',').map(s => s.trim()).filter(Boolean);
  const tfConfigs = tfKeys.map(key => TF_CONFIG.find(c => c.tf === key)).filter(Boolean);
  if (tfConfigs.length === 0 || tfConfigs.length !== tfKeys.length) {
    return {
      ok: false,
      error: `No valid TFs in --tf "${tfArg}". Valid: ${TF_CONFIG.map(c => c.tf).join(',')}`,
    };
  }

  return {
    ok: true,
    familyFilter,
    dirFilter,
    tfArg,
    tfKeys,
    tfConfigs,
    minConf: Number.isFinite(minConf) ? minConf : 0.3,
    topN: Number.isFinite(topN) ? topN : 50,
    allowDegraded,
  };
}

async function buildScorecard(args, runtime = {}) {
  const requestedSchema = optionValue(args, '--schema');
  if (requestedSchema === '3') {
    const fixture = optionValue(args, '--fixture');
    if (fixture === RECORDED_AAPL_FIXTURE_ID) return buildRecordedAppleShadow();
    if (fixture === ALL_RECORDED_FIXTURE_ID) return filterShadowCatalog(buildAllRecordedShadowCatalog(), { family: optionValue(args, '--family', ''), symbol: optionValue(args, '--symbol', ''), state: optionValue(args, '--state', '') });
    return { ok: false, error: `schema 3 shadow requires --fixture ${RECORDED_AAPL_FIXTURE_ID} or ${ALL_RECORDED_FIXTURE_ID}` };
  }
  const {
    progressEnabled = false,
    tsDir = STORAGE_TS_DIR,
    now = Date.now(),
    universeLoader = get_Full_Universe_Symbols,
  } = runtime;
  const options = parseScorecardOptions(args);
  if (!options.ok) return options;

  const {
    familyFilter, dirFilter, tfKeys, tfConfigs, minConf, topN, allowDegraded,
  } = options;

  if (progressEnabled) process.stdout.write(`\x1b[90m⌛ loading universe...\x1b[0m\r`);

  // Load market context + BTC bars once (shared across all symbol analyses)
  const marketCtx = loadMarketContext({ tsDir, now });
  const btcBars = readTsIndexSince(tsDir, 'BTCUSDT', '1d', now - 35 * 24 * 60 * 60 * 1000) || [];

  const universe = await universeLoader();
  if (familyFilter && !SCORECARD_FAMILIES.has(familyFilter)) {
    return { ok: false, error: `Family "${familyFilter}" is not supported by schema-2 technical scorecard.` };
  }
  const filtered = universe.filter((entry) => SCORECARD_FAMILIES.has(entry.family) && (!familyFilter || entry.family === familyFilter));

  if (filtered.length === 0) {
    return {
      ok: false,
      error: `No symbols found${familyFilter ? ` for family "${familyFilter}"` : ''}.`,
    };
  }

  if (progressEnabled) process.stdout.write(`\x1b[90m⌛ analyzing ${filtered.length} assets across ${tfKeys.join('/')}...\x1b[0m\r`);

  const t0 = Date.now();
  const scorecard = [];
  const exclusions = [];

  for (const chunk of chunks(filtered, 8)) {
    const results = await Promise.allSettled(chunk.map(s => analyzeSymbol(
      s,
      tfConfigs,
      btcBars,
      { tsDir, now, allowDegraded },
    )));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.eligible) {
        const { eligible, ...row } = r.value;
        scorecard.push(row);
      }
      else if (r.status === 'fulfilled') exclusions.push(r.value.exclusion);
      else exclusions.push({ symbol: null, family: null, reasons: [{ reason: r.reason?.message || 'analysis failed' }] });
    }
  }

  const elapsed = Date.now() - t0;

  // Filter
  let rows = scorecard.filter(r => r.confidence >= minConf);
  const confidenceFiltered = scorecard.length - rows.length;
  const beforeDirection = rows.length;
  if (dirFilter) rows = rows.filter(r => r.bias === dirFilter);
  const directionFiltered = beforeDirection - rows.length;

  // Sort: highest score (LONG) → 0 (neutral) → lowest (SHORT)
  rows.sort((a, b) => b.score - a.score);
  const beforeTopLimit = rows.length;
  if (topN > 0) rows = rows.slice(0, topN);
  const truncatedSymbols = beforeTopLimit - rows.length;

  const eligibleSymbols = scorecard.filter((row) => row.decision_state === 'eligible').length;
  const degradedSymbols = scorecard.filter((row) => row.decision_state === 'degraded').length;
  const candidateSymbols = scorecard.length;
  const excludedSymbols = exclusions.length;

  return {
    ok: true,
    type: 'scorecard',
    schema_version: 2,
    generated_at: new Date(now).toISOString(),
    elapsed_ms: elapsed,
    total_symbols: filtered.length,
    // analyzed_symbols/skipped are retained for schema-2 compatibility.
    analyzed_symbols: candidateSymbols,
    skipped: excludedSymbols,
    eligible_symbols: eligibleSymbols,
    degraded_symbols: degradedSymbols,
    excluded_symbols: excludedSymbols,
    confidence_filtered: confidenceFiltered,
    direction_filtered: directionFiltered,
    truncated_symbols: truncatedSymbols,
    exclusion_summary: summarizeExclusions(exclusions),
    exclusions,
    filters: {
      family: familyFilter,
      direction: dirFilter,
      timeframes: tfKeys,
      min_confidence: minConf,
      top: topN,
    },
    market_context: marketCtx,
    rows,
  };
}

async function commandScorecard(args) {
  const isJson = hasFlag(args, '--json');
  const requestedSchema = optionValue(args, '--schema');
  if (requestedSchema !== '3' && !hasFlag(args, '--no-backfill')) {
    const options = parseScorecardOptions(args);
    if (!options.ok) {
      process.stderr.write(`[scorecard] ${options.error}\n`);
      return 1;
    }
    if (!isJson) process.stdout.write('\x1b[90m⌛ refreshing scorecard data...\x1b[0m\n');
    const refreshExitCode = await refreshScorecardData({ family: options.familyFilter, timeframes: options.tfKeys });
    if (refreshExitCode !== 0) {
      process.stderr.write('[scorecard] refresh failed; refusing to score potentially stale data. Re-run with --no-backfill only for cache diagnostics.\n');
      return 1;
    }
  }
  const result = await buildScorecard(args, {
    progressEnabled: !isJson && process.stdout.isTTY,
  });

  if (!result.ok) {
    process.stderr.write(`[scorecard] ${result.error}\n`);
    return 1;
  }

  if (isJson) {
    // Schema v2 keeps its established row-array contract; v3 emits its research envelope.
    printPayload(result.schema_version === 3 ? result : result.rows, args);
  } else {
    if (process.stdout.isTTY) process.stdout.write(' '.repeat(60) + '\r'); // clear spinner line
    if (result.schema_version === 3) {
      process.stdout.write(renderShadowCatalog(result));
      return 0;
    }
    process.stdout.write(renderScorecard(
      result.rows,
      result.filters,
      result.elapsed_ms,
      result,
      result.market_context,
    ));
  }

  return 0;
}

function renderShadowCatalog(result, { width = process.stdout.columns || 100 } = {}) {
  width = Math.max(60, width);
  const colorize = canColorize();
  const summary = summarizeShadowRows(result.rows);
  const showDetails = result.rows.length === 1;
  const rowLabel = result.rows.length === 1 ? 'row' : 'rows';
  const lines = [
    `Research shadow v3  ${colorize ? `${DIM}|${RESET}` : '|'}  ${result.fixture_id}  ${colorize ? `${DIM}|${RESET}` : '|'}  NOT DECISION-READY`,
    `Summary  ${joinSummaryParts([
      `${result.rows.length} ${rowLabel}`,
      `${summary.eligible} eligible`,
      `${summary.degraded} degraded`,
      `${summary.excluded} excluded`,
    ], colorize)}`,
  ];
  if (result.rows.length === 0) {
    lines.push('', 'No rows match the current research filters.');
    return `${lines.map((line) => clipVisible(line, width)).join('\n')}\n`;
  }

  lines.push('', `${'ASSET'.padEnd(10)} ${'FAMILY'.padEnd(12)} ${'DIR'.padEnd(7)} ${'STR'.padEnd(5)} ${'COV'.padEnd(5)} ${'STATE'.padEnd(10)} WHY`);
  for (const row of result.rows) {
    const asset = row.asset_descriptor.symbol.padEnd(10);
    const state = stateBadge(row.decision_state, colorize);
    const coverage = coverageText(row).padEnd(5);
    const reason = row.exclusion_reasons[0] || '-';
    lines.push(`${asset} ${row.asset_descriptor.family.padEnd(12)} ${row.direction.padEnd(7)} ${row.composite_strength.toFixed(2).padEnd(5)} ${coverage} ${padVisibleRight(state, 10)} ${reason}`);
    if (!showDetails) continue;

    const detailWidth = Math.max(32, width - 4);
    const factorSegments = row.factor_results.map((factor) => `${factor.domain}=${factor.score.toFixed(2)}[${factor.quality}]`);
    const evidenceSegments = row.factor_results.flatMap((factor) => factor.evidence_ids).slice(0, 4);
    lines.push(...wrapSegmentList(factorSegments, detailWidth, `  ${colorize ? `${DIM}factors${RESET}` : 'factors'}  `));
    if (row.exclusion_reasons.length) {
      lines.push(...wrapSegmentList(row.exclusion_reasons, detailWidth, `  ${colorize ? `${DIM}reasons${RESET}` : 'reasons'}  `));
    }
    lines.push(...wrapSegmentList(evidenceSegments, detailWidth, `  ${colorize ? `${DIM}evidence${RESET}` : 'evidence'}  `));
  }
  if (!showDetails) lines.push('', 'Use --symbol <asset> to inspect factors, reasons, and evidence.');
  return `${lines.map((line) => clipVisible(line, width)).join('\n')}\n`;
}

module.exports = { commandScorecard, buildScorecard, parseScorecardOptions, renderShadowCatalog, renderScorecard, summarizeExclusions, buildScorecardRefreshArgs, refreshScorecardData, SCORECARD_FAMILIES };
