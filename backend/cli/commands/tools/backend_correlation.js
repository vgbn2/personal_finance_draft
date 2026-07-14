'use strict';
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const utils = require('../../lib/utils.js');
const {
  optionValue,
  hasFlag,
  DEFAULT_HISTORY,
} = utils;
const { readTsIndex } = require('../../../../shared/lib/market/validation.js');
const DEFAULT_TS_INDEX = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');

// Session-scoped timing record: last actual correlation duration per symbol count.
// Used to calibrate the progress bar estimate on repeated runs.
const _correlationTimingMs = new Map();

// Load equity symbols from data sources config
function getDefaultEquitySymbols() {
  try {
    const configPath = path.join(utils.REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    // Parse YAML section: equities.symbols: [...]
    const match = content.match(/equities:\s*[\s\S]*?symbols:\s*\[([\s\S]*?)\]/);
    if (!match) return 'AAPL,MSFT,SPY';
    const symbolsStr = match[1];
    const symbols = symbolsStr
      .split(',')
      .map(s => s.trim().replace(/"/g, '').replace(/'/g, ''))
      .filter(s => s && s.length > 0);
    return symbols.slice(0, 10).join(','); // Default to first 10 equities
  } catch (e) {
    return 'AAPL,MSFT,SPY'; // Fallback
  }
}

/**
 * Synthesizes daily OHLC bars for macro/pmi series that typically only
 * report monthly or quarterly. Uses forward-filling to create a daily
 * step-function series that the C++ correlation engine can process.
 */
//
function synthesizeDailyMacroBars(allSources, symbolSet, timeframe) {
  if (timeframe !== '1d') return allSources;

  const scalarFamilies = new Set(['macro', 'pmi', 'macro_alt', 'sentiment']);
  const macroRecords = allSources.filter(s => {
    const sym = s.symbol || s.series || s.series_id;
    return symbolSet.has(sym) && (scalarFamilies.has(s.family) || (!s.open && !s.close && typeof s.value === 'number'));
  });

  if (macroRecords.length === 0) return allSources;

  const nonMacroRecords = allSources.filter(s => !macroRecords.includes(s));
  const bySymbol = {};
  for (const s of macroRecords) {
    const sym = s.symbol || s.series || s.series_id;
    if (!bySymbol[sym]) bySymbol[sym] = [];
    bySymbol[sym].push(s);
  }

  const synthesized = [...nonMacroRecords];
  const now = new Date();

  for (const [sym, records] of Object.entries(bySymbol)) {
    // Dedup by timestamp to avoid double-synthesis
    const seen = new Set();
    const uniqueRecords = records.filter(r => {
      const ts = new Date(r.timestamp).getTime();
      if (seen.has(ts)) return false;
      seen.add(ts);
      return true;
    });

    uniqueRecords.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (let i = 0; i < uniqueRecords.length; i++) {
      const current = uniqueRecords[i];
      const next = uniqueRecords[i+1];
      const val = typeof current.value === 'number' ? current.value : (current.close || 0);

      const startDate = new Date(current.timestamp);
      // Fill until next record OR today (max 31 days to avoid runaway for stale series)
      let endDate = next ? new Date(next.timestamp) : now;

      // Limit forward fill to avoid extreme extrapolation if series is stale
      const maxFillMs = 45 * 24 * 60 * 60 * 1000; // 45 days
      if (!next && (now - startDate) > maxFillMs) {
          endDate = new Date(startDate.getTime() + maxFillMs);
      }

      let d = new Date(startDate);
      while (d < endDate) {
        synthesized.push({
          ...current,
          symbol: sym,
          family: current.family || 'macro',
          timeframe: '1d',
          timestamp: d.toISOString(),
          open: val,
          high: val,
          low: val,
          close: val,
          volume: 0,
          source: (current.source || 'fred') + '-synthesized'
        });
        d.setDate(d.getDate() + 1);
      }
    }
  }
  return synthesized;
}

/**
 * Registry of synthetic formula-based series.
 * Components must exist in the standard universe or be other formulas.
 */
const FORMULA_REGISTRY = {
  'DXY': {
    components: ['EURUSD', 'USDJPY', 'GBPUSD', 'USDCAD', 'USDSEK', 'USDCHF'],
    calculate: (c) => 50.14348112 *
      Math.pow(c.EURUSD, -0.576) *
      Math.pow(c.USDJPY, 0.136) *
      Math.pow(c.GBPUSD, -0.119) *
      Math.pow(c.USDCAD, 0.091) *
      Math.pow(c.USDSEK, 0.042) *
      Math.pow(c.USDCHF, 0.036)
  },
  'EURJPY': {
    components: ['EURUSD', 'USDJPY'],
    calculate: (c) => c.EURUSD * c.USDJPY
  },
  'GBPJPY': {
    components: ['GBPUSD', 'USDJPY'],
    calculate: (c) => c.GBPUSD * c.USDJPY
  },
  'EURGBP': {
    components: ['EURUSD', 'GBPUSD'],
    calculate: (c) => c.EURUSD / c.GBPUSD
  },
  'AUDJPY': {
    components: ['AUDUSD', 'USDJPY'],
    calculate: (c) => c.AUDUSD * c.USDJPY
  },
  'GOLDSILVER': {
    components: ['XAUUSD', 'XAGUSD'],
    calculate: (c) => c.XAUUSD / c.XAGUSD
  },
  'GOLD_OIL': {
    components: ['XAUUSD', 'USOIL'],
    calculate: (c) => c.XAUUSD / c.USOIL
  },
  'EXY': {
    // Euro Index: Weighted geometric mean of EUR against 5 major currencies
    components: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDSEK'],
    calculate: (c) => 34.38805726 *
      Math.pow(c.EURUSD, 0.3155) *
      Math.pow(c.EURUSD / c.GBPUSD, 0.3056) *
      Math.pow(c.EURUSD * c.USDJPY, 0.1891) *
      Math.pow(c.EURUSD * c.USDCHF, 0.1113) *
      Math.pow(c.EURUSD * c.USDSEK, 0.0785)
  },
  'JXY': {
    // JPY Index: Simple inverse of USDJPY, EURJPY, GBPJPY weights
    components: ['USDJPY', 'EURUSD', 'GBPUSD'],
    calculate: (c) => 10000 / (
      Math.pow(c.USDJPY, 0.4) *
      Math.pow(c.EURUSD * c.USDJPY, 0.3) *
      Math.pow(c.GBPUSD * c.USDJPY, 0.3)
    )
  }
};

/**
 * Synthesizes series based on mathematical formulas (e.g. DXY, Cross-rates).
 * Aligns component timestamps and computes daily OHLC bars.
 */
function synthesizeFormulaSeries(allSources, symbolSet, timeframe) {
  const requestedFormulas = [...symbolSet].filter(s => FORMULA_REGISTRY[s]);
  if (requestedFormulas.length === 0) return allSources;

  const synthesized = [...allSources];

  // Group available data by symbol then timestamp for fast lookup
  // Use YYYY-MM-DD as key for daily alignment to avoid string format micro-mismatches
  const dataMap = {};
  for (const s of allSources) {
    const sym = s.symbol || s.series || s.series_id;
    if (!dataMap[sym]) dataMap[sym] = {};
    const dateKey = s.timestamp.split('T')[0];
    dataMap[sym][dateKey] = {
        val: s.close || s.price || s.value || 0,
        fullTs: s.timestamp
    };
  }

  for (const formulaSym of requestedFormulas) {
    const config = FORMULA_REGISTRY[formulaSym];
    const components = config.components;

    // Find common dates across all components
    const componentData = components.map(c => dataMap[c] || {});
    const firstComp = componentData[0] || {};
    const commonDates = Object.keys(firstComp).filter(dateKey =>
      components.every(c => dataMap[c] && dataMap[c][dateKey] !== undefined)
    ).sort();

    for (const dateKey of commonDates) {
      const values = {};
      components.forEach(c => { values[c] = dataMap[c][dateKey].val; });
      const fullTs = dataMap[components[0]][dateKey].fullTs;

      try {
        const result = config.calculate(values);
        if (Number.isFinite(result)) {
          synthesized.push({
            symbol: formulaSym,
            family: 'synthetic',
            timeframe: timeframe || '1d',
            timestamp: fullTs,
            open: result,
            high: result,
            low: result,
            close: result,
            price: result,
            volume: 0,
            source: 'formula-synthesis'
          });
        }
      } catch (e) {}
    }
  }

  return synthesized;
}

function summarizeCoverage(symbols, bySym) {
  const coverage = {};
  for (const sym of symbols) {
    const dates = [...(bySym[sym] || new Set())].sort();
    coverage[sym] = {
      dates: dates.length,
      first: dates[0] || null,
      last: dates[dates.length - 1] || null,
    };
  }
  return coverage;
}

function commonDateCount(symbols, bySym) {
  let common = null;
  for (const sym of symbols) {
    const dates = bySym[sym] || new Set();
    if (common === null) {
      common = new Set(dates);
      continue;
    }
    for (const d of common) {
      if (!dates.has(d)) common.delete(d);
    }
  }
  return common ? common.size : 0;
}

function noOverlapBlockers(symbols, bySym) {
  if (symbols.length <= 2) return symbols;
  return symbols.filter((sym) => commonDateCount(symbols.filter((s) => s !== sym), bySym) > 0);
}

function commonDatesFor(symbols, bySym) {
  let common = null;
  for (const sym of symbols) {
    const dates = bySym[sym] || new Set();
    if (common === null) {
      common = new Set(dates);
      continue;
    }
    for (const d of common) {
      if (!dates.has(d)) common.delete(d);
    }
  }
  return common;
}

function focusedCorrelationError(code, error, symbols, timeframe, bySym, extra = {}) {
  return {
    ok: false,
    type: 'correlation_matrix',
    engine: 'sovereign_cli_preflight',
    schema_version: 1,
    code,
    error,
    timeframe,
    symbols,
    quality: {
      ok: false,
      coverage: summarizeCoverage(symbols, bySym),
      ...extra,
    },
  };
}

function renderCorrelationPreflightError(payload) {
  const lines = [];
  lines.push('Correlation preflight failed');
  lines.push(`Reason: ${payload.error || payload.code || 'unknown'}`);
  if (payload.quality?.hint) lines.push(`Hint: ${payload.quality.hint}`);
  if (Array.isArray(payload.quality?.blockers) && payload.quality.blockers.length > 0) {
    lines.push(`Blockers: ${payload.quality.blockers.join(', ')}`);
  }
  const coverage = payload.quality?.coverage || {};
  const symbols = payload.symbols || Object.keys(coverage);
  if (symbols.length > 0) {
    lines.push('');
    lines.push('Coverage:');
    lines.push('symbol           dates  first        last');
    for (const sym of symbols) {
      const c = coverage[sym] || {};
      lines.push(`${sym.padEnd(15)} ${String(c.dates || 0).padStart(5)}  ${c.first || '-'}  ${c.last || '-'}`);
    }
  }
  lines.push('');
  lines.push('Next: remove blockers, pass --drop-non-overlap, or choose a broader timeframe.');
  return lines.join('\n');
}

function renderDroppedCorrelationSymbols(symbols = []) {
  if (!symbols.length) return '';
  return `Dropped non-overlapping symbols: ${symbols.join(', ')}`;
}

/**
 * Builds a focused temp snapshot for the C++ engine containing only the
 * requested symbols+timeframe. Read strategy (fastest first):
 *   1. Binary ts index (storage/data/ts/<sym>_<tf>.bin) — microseconds per symbol
 *   2. Family JSON partition fallback — for symbols not yet indexed
 * Returns { tmpPath, lastPrices } or null if no data found.
 */
function buildFocusedSnapshot(symbolSet, timeframe, universe = [], verbose = false, options = {}) {
  const vlog = (...a) => { if (verbose) console.log(...a); };
  const vwarn = (...a) => { if (verbose) console.warn(...a); };
  const tsIndexPath = options.tsIndexPath || DEFAULT_TS_INDEX;
  const historyPath = options.historyPath || DEFAULT_HISTORY;
  const dropNonOverlap = Boolean(options.dropNonOverlap);
  let sources = [];
  const missingFromIndex = new Set();
  const droppedSymbols = [];

  // A. Expand symbolSet to include formula components
  const expandedSet = new Set(symbolSet);
  for (const sym of symbolSet) {
    if (FORMULA_REGISTRY[sym]) {
      FORMULA_REGISTRY[sym].components.forEach(c => expandedSet.add(c));
    }
  }

  // 1. Try binary ts index first (fast path)
  if (fs.existsSync(tsIndexPath)) {
    for (const sym of expandedSet) {
      const records = readTsIndex(tsIndexPath, sym, timeframe);
      if (records && records.length > 0) {
        for (const r of records) sources.push(r);
      } else {
        missingFromIndex.add(sym);
      }
    }
  } else {
    for (const sym of expandedSet) missingFromIndex.add(sym);
  }

  // 2. Family JSON fallback for symbols not in ts index
  if (missingFromIndex.size > 0 && fs.existsSync(historyPath) && fs.statSync(historyPath).isDirectory()) {
    const neededFamilies = new Set();
    for (const u of universe) {
      if (missingFromIndex.has(u.symbol) && u.family) neededFamilies.add(u.family);
    }
    // Always include macro/fx for formulas
    neededFamilies.add('fx');
    neededFamilies.add('macro');

    const familiesToScan = neededFamilies.size > 0 ? [...neededFamilies] : fs.readdirSync(historyPath);

    for (const family of familiesToScan) {
      const histPath = path.join(historyPath, family, 'backtest_history.json');
      if (!fs.existsSync(histPath)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(histPath, 'utf8'));
        for (const s of (data.sources || [])) {
          const sym = s.symbol || s.series || s.series_id;
          if (expandedSet.has(sym) && (!timeframe || !s.timeframe || s.timeframe === timeframe || s.timeframe === 'point')) {
            sources.push(s);
          }
        }
      } catch (_) {}
    }
  }

  vlog(`[VISIBILITY] Loaded ${sources.length} total records from ${expandedSet.size} potential series`);

  // 3. Synthesize daily bars for macro data
  sources = synthesizeDailyMacroBars(sources, expandedSet, timeframe);

  // 4. Synthesize formula-based series (DXY, EURJPY, etc.)
  sources = synthesizeFormulaSeries(sources, expandedSet, timeframe);

  // 5. TIMESTAMP ALIGNMENT (CRITICAL for Correlation)
  // Identify dates (YYYY-MM-DD) present for ALL requested symbols (original symbolSet)
  const bySym = {};
  for (const sym of symbolSet) bySym[sym] = new Set();

  for (const s of sources) {
      const sym = s.symbol || s.series || s.series_id;
      if (symbolSet.has(sym)) {
          bySym[sym].add(s.timestamp.split('T')[0]);
      }
  }

  // Drop symbols with too few dates — they collapse the intersection for everyone else.
  // Threshold: at least 30 dates required. Symbols below this are logged and excluded.
  const MIN_DATES_FOR_CORRELATION = 30;
  const thinSyms = [...symbolSet].filter(sym => bySym[sym].size < MIN_DATES_FOR_CORRELATION);
  let eligibleSyms = [...symbolSet].filter(sym => bySym[sym].size >= MIN_DATES_FOR_CORRELATION);

  if (thinSyms.length > 0) {
    vwarn(`[VISIBILITY] Excluded ${thinSyms.length} symbols with < ${MIN_DATES_FOR_CORRELATION} dates: ${thinSyms.join(', ')}`);
  }

  if (eligibleSyms.length < 2) {
    vwarn(`[VISIBILITY] Not enough symbols with sufficient data for correlation (need >= 2, got ${eligibleSyms.length})`);
    if (symbolSet.size >= 2) {
      return focusedCorrelationError(
        'insufficient_correlation_coverage',
        `Need at least 2 symbols with >= ${MIN_DATES_FOR_CORRELATION} ${timeframe} dates for correlation.`,
        [...symbolSet],
        timeframe,
        bySym,
        {
          minimum_dates: MIN_DATES_FOR_CORRELATION,
          thin_symbols: thinSyms,
          eligible_symbols: eligibleSyms,
        },
      );
    }
    return null;
  }

  // Find intersection across eligible symbols only
  let commonDates = null;
  for (const sym of eligibleSyms) {
      if (commonDates === null) {
          commonDates = new Set(bySym[sym]);
      } else {
          for (const d of commonDates) {
              if (!bySym[sym].has(d)) commonDates.delete(d);
          }
      }
      vlog(`[VISIBILITY] Aligned ${sym}: ${bySym[sym].size} dates, Intersection so far: ${commonDates.size}`);
  }

  if (!commonDates || commonDates.size === 0) {
      vwarn(`[VISIBILITY] Intersection failed! No common dates among eligible symbols: ${eligibleSyms.join(', ')}`);
      const blockers = noOverlapBlockers(eligibleSyms, bySym);
      const retained = eligibleSyms.filter((sym) => !blockers.includes(sym));
      const retainedCommonDates = retained.length >= 2 ? commonDatesFor(retained, bySym) : null;
      if (dropNonOverlap && blockers.length > 0 && retained.length >= 2 && retainedCommonDates && retainedCommonDates.size > 0) {
        for (const blocker of blockers) {
          symbolSet.delete(blocker);
          droppedSymbols.push(blocker);
        }
        eligibleSyms = retained;
        commonDates = retainedCommonDates;
      } else {
      return focusedCorrelationError(
        'no_common_correlation_dates',
        `No common ${timeframe} dates across selected symbols. Remove stale/non-overlapping symbols or choose a broader timeframe.`,
        eligibleSyms,
        timeframe,
        bySym,
        {
          blockers,
          hint: blockers.length > 0
            ? `Try removing: ${blockers.slice(0, 6).join(', ')}${blockers.length > 6 ? ' +' + (blockers.length - 6) + ' more' : ''}`
            : 'Try a smaller symbol set or a broader timeframe.',
        },
      );
      }
  }

  // Restrict symbolSet to eligible symbols only
  for (const sym of thinSyms) symbolSet.delete(sym);

  // Filter sources to only common dates and DEDUPLICATE by symbol+date
  const finalMap = {}; // key: sym:date, val: record

  for (const s of sources) {
      const sym = s.symbol || s.series || s.series_id;
      const date = s.timestamp.split('T')[0];
      if (symbolSet.has(sym) && commonDates.has(date)) {
          const key = `${sym}:${date}`;
          // Priority: Synthetic > Macro > Market (simple provider priority)
          if (!finalMap[key] || s.family === 'synthetic' || (s.family === 'macro' && finalMap[key].family !== 'synthetic')) {
              finalMap[key] = s;
          }
      }
  }

  const alignedSources = Object.values(finalMap);
  vlog(`[VISIBILITY] Final aligned snapshot: ${alignedSources.length} records (${commonDates.size} unique dates per symbol)`);

  if (alignedSources.length === 0) {
    if (symbolSet.size >= 2) {
      return focusedCorrelationError(
        'empty_aligned_correlation_snapshot',
        `No aligned ${timeframe} records remained after correlation prefiltering.`,
        [...symbolSet],
        timeframe,
        bySym,
      );
    }
    return null;
  }

  const tmpPath = path.join(os.tmpdir(), `sovereign_corr_${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify({ sources: alignedSources, mode: 'focused_correlation' }), 'utf8');

  // Extract last close per symbol for price header display (only for original symbolSet)
  const lastPrices = {};
  for (const sym of symbolSet) {
    const bars = alignedSources.filter(s => s.symbol === sym && typeof s.close === 'number' && isFinite(s.close));
    if (bars.length > 0) {
      bars.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
      lastPrices[sym] = bars[bars.length - 1].close;
    }
  }

  return {
    tmpPath,
    lastPrices,
    symbols: [...symbolSet],
    droppedSymbols,
    coverage: summarizeCoverage([...symbolSet, ...droppedSymbols], bySym),
  };
}

function familyForSymbol(symbol, universe = []) {
  const match = universe.find(u => u.symbol === symbol);
  return match ? match.family : null;
}

function defaultCorrelationMethod(symbols, universe = []) {
  if (symbols.length > 0 && symbols.every(symbol => familyForSymbol(symbol, universe) === 'fx')) {
    return 'fx-returns';
  }
  return 'pearson-returns';
}

function resolveCorrelationMethod(symbols, universe = [], requestedMethod = null) {
  const allFx = symbols.length > 0 && symbols.every(symbol => familyForSymbol(symbol, universe) === 'fx');
  if (requestedMethod === 'fx-returns' && !allFx) {
    return 'pearson-returns';
  }
  return requestedMethod || defaultCorrelationMethod(symbols, universe);
}

/**
 * Internal helper to group symbols hierarchically (Family: Market -> Sector).
 */
function groupUniverseHierarchically(rawUniverse, selectedFamilies = [], filterFamilies = false) {
  const groups = {};
  rawUniverse.forEach(u => {
    if (filterFamilies && !selectedFamilies.includes(u.family)) return;
    if (u.symbol.includes('_CALL') || u.symbol.includes('_PUT')) return;

    const familyKey = u.family.toUpperCase();
    const marketKey = u.market || 'GLOBAL';
    const category = `${familyKey}: ${marketKey}`;
    const sector = u.sector || u.family || 'Uncategorized';

    if (!groups[category]) groups[category] = {};
    if (!groups[category][sector]) groups[category][sector] = [];
    groups[category][sector].push(u);
  });
  return groups;
}

async function runBackendCorrelation(args = [], preSelectedSymbol = null) {
  // Lazy-require parent to get runBackendCommandAsync and backendAvailability
  // without a circular dependency at module load time.
  const parent = require('./backend.js');
  const { runBackendCommandAsync, backendAvailability } = parent;

  let symbols = optionValue(args, '--symbols', null);

  if (!symbols && utils.isRichTerminal()) {
    const { pickAssets } = require('../../tui/asset_picker');
    if (preSelectedSymbol) {
      console.log(`\x1b[90mPrimary from data summary: \x1b[36m${preSelectedSymbol}\x1b[90m (auto-included)\x1b[0m`);
    }
    const picked = await pickAssets({ multi: true, label: 'Correlation', min: 2, prompt: 'Select assets to correlate (min 2):' });
    if (!picked) return { ok: false, error: 'User cancelled selection' };
    if (picked.length < 2) {
      console.error('\n\x1b[31mError: Correlation requires at least 2 symbols.\x1b[0m');
      return { ok: false, error: 'Insufficient symbols selected' };
    }
    const allSelected = preSelectedSymbol
      ? [preSelectedSymbol, ...picked.filter(s => s !== preSelectedSymbol)]
      : picked;
    symbols = allSelected.join(',');
  }
  if (!symbols) symbols = getDefaultEquitySymbols();

  // Load universe once — reused for both symbol resolution and availability check
  const cachedUniverse = utils.get_Current_Universe_Symbols();
  const resolvedArr = [...new Set(utils.resolveSymbols(symbols, cachedUniverse))];

  // Pre-filter: drop symbols with no data in the cache before hitting C++
  const cachedSet = new Set(cachedUniverse.map(u => u.symbol));
  const requestedTimeframe = optionValue(args, '--timeframe', '1d');

  // Allow symbols if they are in cache OR in the formula registry
  const available = resolvedArr.filter(s => cachedSet.has(s) || FORMULA_REGISTRY[s]);
  const unavailable = resolvedArr.filter(s => !cachedSet.has(s) && !FORMULA_REGISTRY[s]);
  if (unavailable.length > 0) {
    console.log(`\x1b[33m⚠ No cached data — skipped (${unavailable.length}): ${unavailable.slice(0, 8).join(', ')}${unavailable.length > 8 ? ` +${unavailable.length - 8} more` : ''}\x1b[0m`);
  }
  if (available.length < 2) {
    return { ok: false, error: `Need >=2 symbols with cached data. ${available.length} available, ${unavailable.length} skipped.` };
  }

  let effectiveSymbols = [...available];
  const requestedMethodRaw = optionValue(args, '--method', null);
  const requestedMethod = requestedMethodRaw === 'auto' ? null : requestedMethodRaw;

  // Build a focused temp snapshot: only requested symbols+timeframe.
  // Reduces C++ I/O from ~186MB full archive to a few MB of relevant records.
  const userInput = optionValue(args, '--input', null);
  let inputPath = userInput || DEFAULT_HISTORY;
  let tmpSnapshot = null;
  let lastPrices = {};
  let droppedSymbols = [];
  if (!userInput) {
    const focused = buildFocusedSnapshot(new Set(available), requestedTimeframe, cachedUniverse, process.argv.includes('--verbose'), {
      dropNonOverlap: hasFlag(args, '--drop-non-overlap'),
    });
    if (focused && focused.error) {
      return {
        ...backendAvailability(),
        exit_code: 1,
        input: DEFAULT_TS_INDEX,
        ...focused,
      };
    }
    if (focused) {
      tmpSnapshot = focused.tmpPath;
      lastPrices = focused.lastPrices;
      inputPath = tmpSnapshot;
      effectiveSymbols = focused.symbols || effectiveSymbols;
      droppedSymbols = focused.droppedSymbols || [];
    }
  }

  const resolved = effectiveSymbols.join(',');
  const symCount = effectiveSymbols.length;
  const correlationMethod = resolveCorrelationMethod(effectiveSymbols, cachedUniverse, requestedMethod);

  const backendArgs = [
    'correlation',
    '--symbols',
    resolved,
    '--timeframe',
    requestedTimeframe,
    '--input',
    inputPath,
    '--max-bars',
    optionValue(args, '--max-bars', '252'),
    '--method',
    correlationMethod,
    '--json',
  ];

  if (hasFlag(args, '--divergence')) {
    backendArgs.push('--divergence');
    const sw = optionValue(args, '--short-window');
    if (sw) backendArgs.push('--short-window', sw);
    const th = optionValue(args, '--threshold');
    if (th) backendArgs.push('--threshold', th);
  }

  // Estimate total duration using pair-count math: Work = N(N-1)/2 pairs (upper triangle only).
  // Per-pair cost baseline: 30ms (user-calibrated). Adaptive timing refines this after each run.
  const pairCount = (symCount * (symCount - 1)) / 2;
  const prevMs = _correlationTimingMs.get(symCount);
  const estimatedMs = prevMs != null
    ? Math.round(prevMs * 1.1)            // 10% buffer after real measurement
    : Math.max(1200, pairCount * 30);     // first-run: N(N-1)/2 * 30ms per pair

  const result = await runBackendCommandAsync(backendArgs, `Computing ${symCount}x${symCount} correlation matrix`, estimatedMs, symCount,
    (actualMs) => { _correlationTimingMs.set(symCount, actualMs); });
  if (tmpSnapshot) try { fs.unlinkSync(tmpSnapshot); } catch (_) {}
  if (result && Object.keys(lastPrices).length > 0) result._lastPrices = lastPrices;
  if (result && droppedSymbols.length > 0) result._droppedSymbols = droppedSymbols;
  if (result && correlationMethod === 'fx-returns' && resolveCorrelationMethod(available, cachedUniverse) === 'fx-returns') {
    result._fxNote = 'FX pairs are directional: BASE up / QUOTE down; matrix uses log returns.';
  }
  return result;
}

module.exports = {
  synthesizeDailyMacroBars,
  synthesizeFormulaSeries,
  summarizeCoverage,
  commonDateCount,
  noOverlapBlockers,
  commonDatesFor,
  focusedCorrelationError,
  renderCorrelationPreflightError,
  renderDroppedCorrelationSymbols,
  buildFocusedSnapshot,
  groupUniverseHierarchically,
  familyForSymbol,
  defaultCorrelationMethod,
  resolveCorrelationMethod,
  runBackendCorrelation,
  _correlationTimingMs,
};
