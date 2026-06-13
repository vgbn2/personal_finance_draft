const path = require('node:path');
const os = require('node:os');
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');

// Session-scoped timing record: last actual correlation duration per symbol count.
// Used to calibrate the progress bar estimate on repeated runs.
const _correlationTimingMs = new Map();
const utils = require('../../lib/utils.js');

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
const {
  printPayload,
  optionValue,
  numericOption,
  hasFlag,
  pageText,
  DEFAULT_SNAPSHOT,
  DEFAULT_QUALITY_REPORT,
  DEFAULT_HISTORY,
  DEFAULT_BACKTEST,
  BACKEND_CANDIDATES,
  currentPhaseLabel,
  get_Current_Universe_Symbols,
  get_Full_Universe_Symbols,
  isRichTerminal
} = utils;

const { readSnapshot, readTsIndex, validateSnapshot } = require('../../../../shared/lib/market/validation.js');
const DEFAULT_TS_INDEX = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');

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
    vwarn(`[VISIBILITY] Not enough symbols with sufficient data for correlation (need ≥ 2, got ${eligibleSyms.length})`);
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
 * Locates the C++ backend binary among known candidate paths.
 */
function locateBackendBinary() {
  return BACKEND_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

/**
 * Runs a command against the C++ backend binary.
 */
function runBackendCommand(commandArgs) {
  const binary = locateBackendBinary();
  if (!binary) {
    return {
      available: false,
      ok: false,
      error: 'C++ backend executable not found',
      searched: BACKEND_CANDIDATES,
    };
  }

  const passedArgs = [...commandArgs];
  if (process.argv.includes('--verbose') && !passedArgs.includes('--verbose')) {
    passedArgs.push('--verbose');
  }

  const result = spawnSync(binary, passedArgs, {
    cwd: utils.REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });

  if (process.argv.includes('--verbose') && result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    return {
      available: true,
      ok: false,
      path: binary,
      error: result.error.message,
    };
  }

  try {
    return {
      available: true,
      path: binary,
      exit_code: result.status,
      ...JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      available: true,
      ok: false,
      path: binary,
      exit_code: result.status,
      error: `Unable to parse backend JSON: ${error.message}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}

/**
 * Runs a backend command asynchronously, showing a spinner + progress bar while it executes.
 *
 * Progress math for correlation (N symbols):
 *   totalPairs = N(N-1)/2            — exact pair count (upper triangle only)
 *   Row i completes (N-1-i) pairs    — rows are front-loaded (most work first)
 *   Progress(row i) = Σⱼ₌₀ⁱ(N-1-j) / totalPairs
 *
 * The animation uses this triangular accumulation shape: fast early rows (many pairs),
 * slower late rows (fewer pairs) — matches the actual computation pattern.
 *
 * estimatedMs: total expected duration.
 * symCount: number of symbols (drives the triangular easing curve). 0 = generic linear ease.
 * onDuration: optional callback(actualMs) for adaptive timing calibration.
 */
async function runBackendCommandAsync(commandArgs, label = 'Calculating', estimatedMs = 3000, symCount = 0, onDuration = null) {
  const binary = locateBackendBinary();
  if (!binary) {
    return { available: false, ok: false, error: 'C++ backend executable not found', searched: BACKEND_CANDIDATES };
  }

  const passedArgs = [...commandArgs];
  if (process.argv.includes('--verbose') && !passedArgs.includes('--verbose')) passedArgs.push('--verbose');

  const BAR_WIDTH = 20;
  const FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let frame = 0;
  let intervalId = null;
  const isTTY = process.stdout.isTTY;
  const startWall = Date.now();

  // Linear progress mapping: matches the O(N^2) work pattern of the C++ backend.
  // We assume constant pair-processing speed. Since estimatedMs is pair-calibrated,
  // this provides an accurate and efficient simulation of progress.
  const triangularRatio = (elapsed) => {
    return Math.min(0.95, elapsed / estimatedMs);
  };

  const renderBar = (ratio) => {
    const filled = Math.round(ratio * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const pct = Math.round(ratio * 100);
    const bar = '\x1b[32m' + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(empty) + '\x1b[0m';
    return `[${bar}] \x1b[1m${pct}%\x1b[0m`;
  };

  if (isTTY) {
    process.stdout.write('\x1b[?25l');
    const tick = () => {
      const elapsed = Date.now() - startWall;
      const ratio = triangularRatio(elapsed);
      const spinner = `\x1b[36m${FRAMES[frame % FRAMES.length]}\x1b[0m`;
      process.stdout.write(`\r${spinner} \x1b[1m${label}\x1b[0m ${renderBar(ratio)}\x1b[K`);
      frame++;
    };
    tick();
    intervalId = setInterval(tick, 50);
  }

  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    const child = spawn(binary, passedArgs, { cwd: utils.REPO_ROOT, shell: false });
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    const finish = (code, errObj) => {
      const actualMs = Date.now() - startWall;
      if (onDuration) onDuration(actualMs);
      if (process.argv.includes('--verbose') && stderr) process.stderr.write(stderr);

      const emit = () => {
        if (errObj) return resolve({ available: true, ok: false, path: binary, error: errObj.message });
        try {
          resolve({ available: true, path: binary, exit_code: code, ...JSON.parse(stdout) });
        } catch (e) {
          resolve({ available: true, ok: false, path: binary, exit_code: code, error: `Unable to parse backend JSON: ${e.message}`, stdout, stderr });
        }
      };

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        if (isTTY) {
          // Determine success: no spawn error, exit code 0, and JSON ok !== false
          let success = !errObj && code === 0;
          if (success) {
            try { success = JSON.parse(stdout).ok !== false; } catch { /* unparseable = treat as fail */ success = false; }
          }
          const icon = success ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
          const barStr = success ? renderBar(1) : renderBar(1).replace(/\x1b\[32m/g, '\x1b[31m');
          process.stdout.write(`\r${icon} \x1b[1m${label}\x1b[0m ${barStr}`);
          setTimeout(() => { process.stdout.write('\r\x1b[K\x1b[?25h'); emit(); }, 120);
          return;
        }
      }
      emit();
    };

    child.on('close', code => finish(code, null));
    child.on('error', err => finish(null, err));
  });
}

function runBackendStatus(args = []) {
  return runBackendCommand([
    'status',
    '--snapshot',
    optionValue(args, '--input', DEFAULT_SNAPSHOT),
    '--quality',
    optionValue(args, '--quality-report', DEFAULT_QUALITY_REPORT),
    '--json',
  ]);
}

function runBackendStats(args = []) {
  let equityCsv = optionValue(args, '--equity', null);
  let equitySource = equityCsv ? 'argument' : null;
  if (!equityCsv) {
    const inputPath = optionValue(args, '--input', DEFAULT_BACKTEST);
    try {
      const backtest = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      if (backtest && backtest.equity_curve && Array.isArray(backtest.equity_curve)) {
        equityCsv = backtest.equity_curve.map(point => (point.equity * 100).toFixed(2)).join(',');
        equitySource = inputPath;
      }
    } catch (e) {
      // Ignored
    }
  }
  if (!equityCsv) {
    return {
      available: Boolean(locateBackendBinary()),
      ok: false,
      type: 'backend_stats',
      engine: 'sovereign_cli_frontend',
      schema_version: 1,
      error: 'No equity curve found. Run a backtest first or pass --equity explicitly.',
    };
  }

  const payload = runBackendCommand([
    'stats',
    '--equity',
    equityCsv,
    '--json',
  ]);
  return {
    equity_source: equitySource,
    ...payload,
  };
}

function runBackendPortfolio(args = []) {
  return runBackendCommand([
    'portfolio',
    '--cash',
    optionValue(args, '--cash', '10000.0'),
    '--positions',
    optionValue(args, '--positions', ''),
    '--json',
  ]);
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

async function runBackendDataSummary(args = []) {
  let symbol = optionValue(args, '--symbol', null);

  if (!symbol && utils.isRichTerminal()) {
    const { promptSelect } = require('../../tui/engine/engine.js');
    const rawUniverse = await get_Full_Universe_Symbols();
    const groups = groupUniverseHierarchically(rawUniverse);

    const choices = [];
    Object.keys(groups).sort().forEach(category => {
      const sectors = groups[category];
      Object.keys(sectors).sort().forEach(sector => {
        choices.push({
          label: `Sector: ${sector.charAt(0).toUpperCase() + sector.slice(1).replace(/_/g, ' ')}`,
          value: `__SECTOR_HEADER:${category}:${sector}`,
          category
        });

        sectors[sector].sort().forEach(symEntry => {
          choices.push({
            label: `  ${symEntry.symbol}`,
            value: symEntry.symbol,
            category
          });
        });
      });
    });

    console.log(`\n\x1b[1;36mData Summary\x1b[0m`);
    const selected = await promptSelect('Select asset to inspect:', choices);
    if (!selected || selected.startsWith('__SECTOR_HEADER:')) {
      return { ok: false, error: 'User cancelled or selected a header' };
    }
    symbol = selected;
  }

  const timeframe = optionValue(args, '--timeframe', '1d');
  const universe = await get_Full_Universe_Symbols();
  const resolved = utils.resolveSymbols([symbol || 'AAPL'], universe)[0];
  
  const userInput = optionValue(args, '--input', null);
  let inputPath = userInput || DEFAULT_HISTORY;
  let tmpSnapshot = null;

  if (!userInput) {
    const focused = buildFocusedSnapshot(new Set([resolved]), timeframe, universe, process.argv.includes('--verbose'));
    if (focused) {
      tmpSnapshot = focused.tmpPath;
      inputPath = tmpSnapshot;
    }
  }

  const result = runBackendCommand([
    'data',
    'summary',
    '--symbol',
    resolved,
    '--timeframe',
    timeframe,
    '--input',
    inputPath,
    '--max-bars',
    optionValue(args, '--max-bars', '0'),
    '--json',
  ]);

  if (tmpSnapshot) try { fs.unlinkSync(tmpSnapshot); } catch (_) {}
  return result;
}

async function runBackendCorrelation(args = [], preSelectedSymbol = null) {
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
    return { ok: false, error: `Need ≥2 symbols with cached data. ${available.length} available, ${unavailable.length} skipped.` };
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

  const result = await runBackendCommandAsync(backendArgs, `Computing ${symCount}×${symCount} correlation matrix`, estimatedMs, symCount,
    (actualMs) => { _correlationTimingMs.set(symCount, actualMs); });
  if (tmpSnapshot) try { fs.unlinkSync(tmpSnapshot); } catch (_) {}
  if (result && Object.keys(lastPrices).length > 0) result._lastPrices = lastPrices;
  if (result && droppedSymbols.length > 0) result._droppedSymbols = droppedSymbols;
  if (result && correlationMethod === 'fx-returns' && resolveCorrelationMethod(available, cachedUniverse) === 'fx-returns') {
    result._fxNote = 'FX pairs are directional: BASE up / QUOTE down; matrix uses log returns.';
  }
  return result;
}

function runBackendUniverse(args = []) {
  return runBackendCommand([
    'universe',
    '--input',
    optionValue(args, '--input', DEFAULT_HISTORY),
    '--max-entries',
    optionValue(args, '--max-entries', '0'),
    '--json',
  ]);
}

function summarizeUniverseTimeframes(entries = []) {
  const counts = new Map();
  entries.forEach((entry) => {
    (entry.timeframes || []).forEach((timeframe) => {
      counts.set(timeframe, (counts.get(timeframe) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([timeframe, count]) => `${timeframe}:${count}`);
}

function renderBackendUniverse(payload = {}) {
  if (!payload || payload.available === false) {
    return `Backend universe unavailable: ${payload?.error || 'backend executable not found'}`;
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const timeframeSummary = summarizeUniverseTimeframes(entries);
  const totalRecords = entries.reduce((sum, entry) => sum + Number(entry.records || 0), 0);
  const lines = [
    '\x1b[1;36mBackend Universe\x1b[0m',
    '\x1b[90m' + '='.repeat(80) + '\x1b[0m',
    `  Source: ${payload.input || 'unknown'}`,
    `  Symbols: ${entries.length} | Records: ${totalRecords} | Rejected: ${payload.quality?.rejected_records ?? 0}`,
    `  Timeframes: ${timeframeSummary.length > 0 ? timeframeSummary.join('  ') : 'none detected'}`,
    '',
    '  Inventory',
  ];

  entries.slice(0, 12).forEach((entry, index) => {
    const tfLabel = (entry.timeframes || []).join(', ') || 'n/a';
    lines.push(`    ${String(index + 1).padStart(2)}. ${String(entry.symbol || 'unknown').padEnd(12)} ${String(entry.records || 0).padStart(7)} records   [${tfLabel}]`);
  });

  if (entries.length > 12) {
    lines.push(`    ... ${entries.length - 12} more symbols`);
  }

  lines.push('');
  lines.push('\x1b[90mUse `backend integrity` for freshness and readiness; universe is inventory only.\x1b[0m');
  return lines.join('\n');
}

function runBackendIndicators(args = []) {
  const symbol = optionValue(args, '--symbol', 'AAPL');
  const timeframe = optionValue(args, '--timeframe', '1d');
  const input = optionValue(args, '--input', DEFAULT_HISTORY);
  const maxBars = optionValue(args, '--max-bars', '0');
  const showLast = optionValue(args, '--show-last', '5');

  const indicatorArgs = [
    'indicators',
    '--symbol', symbol,
    '--timeframe', timeframe,
    '--input', input,
    '--max-bars', maxBars,
    '--show-last', showLast,
    '--json'
  ];

  // Load params from config/trading/indicator_config.yaml
  try {
    const configPath = path.join(utils.REPO_ROOT, 'config', 'trading', 'indicator_config.yaml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      
      const mapping = {
        'kalman_q': /process_noise:\s*([\d.]+)/,
        'kalman_r': /measurement_noise:\s*([\d.]+)/,
        'rsi_period': /rsi:[\s\S]*?period:\s*(\d+)/,
        'macd_fast': /macd:[\s\S]*?fast:\s*(\d+)/,
        'macd_slow': /macd:[\s\S]*?slow:\s*(\d+)/,
        'vol_period': /volatility:[\s\S]*?period:\s*(\d+)/,
        'bb_period': /bollinger:[\s\S]*?period:\s*(\d+)/,
        'atr_period': /atr:[\s\S]*?period:\s*(\d+)/,
        'stoch_period': /stochastic:[\s\S]*?period:\s*(\d+)/,
        'stoch_signal': /stochastic:[\s\S]*?signal:\s*(\d+)/,
        'ret_fast': /returns:[\s\S]*?fast:\s*(\d+)/,
        'ret_slow': /returns:[\s\S]*?slow:\s*(\d+)/,
        'sma_slow': /sma:[\s\S]*?slow:\s*(\d+)/
      };

      for (const [key, regex] of Object.entries(mapping)) {
        const match = content.match(regex);
        if (match) {
          const flag = '--' + key.replace(/_/g, '-');
          if (!args.includes(flag)) {
            indicatorArgs.push(flag, match[1]);
          }
        }
      }
    }
  } catch (e) {
    // Fallback to defaults in C++ if YAML read fails
  }

  // Add any explicit overrides from CLI
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && !['--symbol', '--timeframe', '--input', '--max-bars', '--show-last'].includes(args[i])) {
      if (i + 1 < args.length && !args[i+1].startsWith('--')) {
         indicatorArgs.push(args[i], args[i+1]);
         i++;
      }
    }
  }

  return runBackendCommand(indicatorArgs);
}

function reportSnapshotIntegrity(inputPath, rejectStale = true) {
  try {
    const snapshot = readSnapshot(inputPath);
    const { report, usableSources } = validateSnapshot(snapshot, { rejectStale });
    return {
      ok: report.ok,
      input: inputPath,
      mode: snapshot.mode || 'unknown',
      fetched_at: snapshot.fetched_at || null,
      total_records: report.total_records,
      usable_records: (usableSources || []).length,
      rejected_records: report.rejected_records,
      stale_records: (report.freshness || {}).stale_records || 0,
      provider_errors: (report.provider_errors || []).length,
      issues: (report.issues || []).slice(0, 8),
    };
  } catch (error) {
    return {
      ok: false,
      input: inputPath,
      error: error.message,
    };
  }
}

async function runBackendIntegrity(args = []) {
  const { readTsIndex } = require('../../../../shared/lib/market/validation.js');
  const { loadMarketConfig } = require('../../../../shared/lib/runtime/config_loader.js');
  const TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');
  const CONFIG_PATH = path.join(utils.REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
  const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'fx']);
  const now = Date.now();
  const STALE_MS = { '5m': 1*60*60*1000, '15m': 2*60*60*1000, '30m': 4*60*60*1000,
    '1h': 6*60*60*1000, '4h': 12*60*60*1000, '1d': 96*60*60*1000, '1w': 14*24*60*60*1000 };
  const CALENDAR_EXEMPT_FAMILIES = new Set(['equities', 'indices', 'commodities']);
  function weekendHoursElapsed(fromTs, toTs) {
    let ms = 0;
    const cursor = new Date(fromTs);
    cursor.setUTCHours(0, 0, 0, 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor.getTime() <= toTs) {
      const day = cursor.getUTCDay();
      if (day === 0 || day === 6) ms += 24 * 60 * 60 * 1000;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return ms;
  }

  let config = {};
  try { config = await loadMarketConfig(CONFIG_PATH); } catch (_) {}
  const requiredTimeframes = Array.isArray(config?.quality?.integrity_timeframes) && config.quality.integrity_timeframes.length > 0
    ? config.quality.integrity_timeframes
    : ['1d'];
  const integrityExceptions = new Set(
    Array.isArray(config?.quality?.integrity_exceptions) ? config.quality.integrity_exceptions.filter(Boolean) : []
  );

  // Read the last ingest snapshot's errors so we can distinguish "stale" (old data,
  // provider still reachable) from "provider_unreachable" (every provider errored on
  // the most recent attempt). The ingest loop writes an aggregate-failure marker as
  // { provider: <family>, symbol, message: 'No <family> provider resolved successfully' }.
  const unreachableSymbols = new Set();
  try {
    const lastFetch = JSON.parse(
      fs.readFileSync(path.join(utils.REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json'), 'utf8')
    );
    for (const err of (lastFetch.errors || [])) {
      if (err && err.symbol && typeof err.message === 'string'
          && /no .*provider resolved successfully/i.test(err.message)) {
        unreachableSymbols.add(err.symbol);
      }
    }
  } catch (_) { /* no snapshot yet — treat nothing as unreachable */ }

  const TIMEFRAMES = [...new Set([
    ...requiredTimeframes,
    '5m', '15m', '30m', '1h', '4h', '1d', '1w',
  ])];

  const familyReport = {};
  const allSymbols = [];

  for (const [family, data] of Object.entries(config)) {
    if (!OHLCV_FAMILIES.has(family) || !data.enabled) continue;
    const configSymbols = [...new Set([
      ...(data.symbols || []),
      ...(data.series || []),
    ])];
    if (configSymbols.length === 0) continue;

    const fReport = { family, config_count: configSymbols.length, cached: [], missing: [], stale: [], exceptions: [] };

    for (const sym of configSymbols) {
      const tfData = {};
      let hasSomething = false;
      for (const tf of TIMEFRAMES) {
        const records = readTsIndex(TS_DIR, sym, tf);
        if (!records || records.length === 0) continue;
        hasSomething = true;
        const lastTs = new Date(records[records.length - 1].timestamp).getTime();
        const firstTs = new Date(records[0].timestamp).getTime();
        const staleThresh = STALE_MS[tf] || 72 * 60 * 60 * 1000;
        const ageMs = now - lastTs;
        const effectiveAge = (CALENDAR_EXEMPT_FAMILIES.has(family) && tf === '1d')
          ? Math.max(0, ageMs - weekendHoursElapsed(lastTs, now))
          : ageMs;
        tfData[tf] = {
          bars: records.length,
          from: records[0].timestamp.slice(0, 10),
          to: records[records.length - 1].timestamp.slice(0, 10),
          stale: effectiveAge > staleThresh,
          age_h: Math.round(ageMs / 3600000),
        };
      }
      const symInfo = { symbol: sym, family, timeframes: tfData };
      if (hasSomething) {
        fReport.cached.push(symInfo);
        // Check only the policy-required timeframes for blocking freshness.
        const configTfs = requiredTimeframes;
        const staleOrMissing = configTfs.filter(tf => !tfData[tf] || tfData[tf].stale);
        if (staleOrMissing.length > 0) {
          if (integrityExceptions.has(sym)) {
            fReport.exceptions.push({ symbol: sym, issues: staleOrMissing });
          } else {
            const staleEntry = { symbol: sym, issues: staleOrMissing };
            if (unreachableSymbols.has(sym)) {
              staleEntry.provider_unreachable = true;
              symInfo.provider_unreachable = true;
            }
            fReport.stale.push(staleEntry);
          }
        }
      } else {
        fReport.missing.push(sym);
      }
      allSymbols.push(symInfo);
    }
    familyReport[family] = fReport;
  }

  // Render to console (non-JSON mode)
  if (!hasFlag(args, '--json')) {
    const line = '-'.repeat(72);
    const totalCached = Object.values(familyReport).reduce((s, r) => s + r.cached.length, 0);
    const totalConfig = Object.values(familyReport).reduce((s, r) => s + r.config_count, 0);
    const totalMissing = Object.values(familyReport).reduce((s, r) => s + r.missing.length, 0);
    const totalStale = Object.values(familyReport).reduce((s, r) => s + r.stale.length, 0);

    console.log(`\n[DATA AVAILABILITY REPORT] ${new Date().toISOString()}`);
    console.log(`Coverage: ${totalCached}/${totalConfig} cached | missing: ${totalMissing} | stale: ${totalStale}`);
    console.log(`Policy: required timeframes = ${requiredTimeframes.join(', ')}`);
    if (integrityExceptions.size > 0) {
      console.log(`Policy: stale exceptions = ${Array.from(integrityExceptions).join(', ')}`);
    }
    console.log(line);

    for (const [family, r] of Object.entries(familyReport)) {
      const pct = r.config_count > 0 ? Math.round(r.cached.length / r.config_count * 100) : 0;
      const statusLabel = pct === 100 ? 'OK' : pct >= 50 ? 'WARN' : 'FAIL';
      console.log(`\n${family.toUpperCase()}  ${statusLabel}  ${r.cached.length}/${r.config_count} cached (${pct}%)`);

      if (r.missing.length > 0) {
        console.log(`  Missing: ${r.missing.join(', ')}`);
      }
      if (r.stale.length > 0) {
        r.stale.forEach(s => {
          const tag = s.provider_unreachable ? ' (provider unreachable — all providers failed last fetch)' : '';
          console.log(`  Stale: ${s.symbol} [${s.issues.join(', ')}]${tag}`);
        });
      }
      if (r.exceptions.length > 0) {
        r.exceptions.forEach(s => console.log(`  Exception: ${s.symbol} [${s.issues.join(', ')}]`));
      }

      // Show cached symbols with their history range and bar counts per timeframe
      r.cached.forEach(s => {
        const tf1d = s.timeframes['1d'];
        const tf1h = s.timeframes['1h'];
        const primary = tf1d || tf1h || Object.values(s.timeframes)[0];
        if (!primary) return;
        const staleTag = primary.stale ? ` [stale ${primary.age_h}h]` : '';
        
        // Build timeframe:count strings for a clear breakdown
        const tfDetails = Object.entries(s.timeframes)
          .map(([tf, meta]) => `${tf}:${meta.bars}`)
          .join(' ');

        console.log(`  OK ${s.symbol.padEnd(12)} ${primary.from} -> ${primary.to}  [${tfDetails}]${staleTag}`);
      });
    }

    console.log(`\n${line}`);
    console.log(`SUMMARY: ${totalCached}/${totalConfig} symbols cached | ${totalMissing} missing | ${totalStale} stale`);
    if (totalMissing > 0) {
      console.log('Next step: backfill the missing symbols first.');
    }
    if (totalStale > 0) {
      console.log('Next step: refresh stale symbols or re-run ingestion for the affected timeframes.');
    }
    console.log('');
    return { ok: totalMissing === 0, type: 'data_availability' };
  }

  // JSON mode: return structured data
  return {
    ok: Object.values(familyReport).every(r => r.missing.length === 0 && r.stale.length === 0),
    type: 'data_availability',
    policy: {
      required_timeframes: requiredTimeframes,
      integrity_exceptions: Array.from(integrityExceptions),
    },
    families: familyReport,
    summary: {
      total_config: Object.values(familyReport).reduce((s, r) => s + r.config_count, 0),
      total_cached: Object.values(familyReport).reduce((s, r) => s + r.cached.length, 0),
      total_missing: Object.values(familyReport).reduce((s, r) => s + r.missing.length, 0),
      total_stale: Object.values(familyReport).reduce((s, r) => s + r.stale.length, 0),
      total_exceptions: Object.values(familyReport).reduce((s, r) => s + r.exceptions.length, 0),
      total_unreachable: Object.values(familyReport)
        .reduce((s, r) => s + r.stale.filter(e => e.provider_unreachable).length, 0),
    },
  };
}

/**
 * Runs a performance benchmark on the backend.
 */
function runBackendBenchmark(args = []) {
  const iterations = numericOption(args, '--iterations', 10);
  const cmd = args[0] || 'status';
  
  const availability = backendAvailability();
  if (!availability.available) {
    return {
      ok: false,
      error: 'Backend binary not found. Cannot run benchmark.',
      searched: BACKEND_CANDIDATES
    };
  }

  console.log(`[BENCHMARK] Running ${iterations} iterations of backend '${cmd}'...`);
  
  const startTotal = process.hrtime.bigint();
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    runBackendCommand([cmd, '--json']);
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000); // Convert to ms
  }
  
  const endTotal = process.hrtime.bigint();
  const totalDuration = Number(endTotal - startTotal) / 1000000;
  const avg = times.reduce((a, b) => a + b, 0) / iterations;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return {
    ok: true,
    type: 'backend_benchmark',
    path: availability.path,
    command: cmd,
    iterations,
    total_ms: totalDuration.toFixed(2),
    average_ms: avg.toFixed(2),
    min_ms: min.toFixed(2),
    max_ms: max.toFixed(2),
    samples: times.map(t => t.toFixed(2))
  };
}

function backendAvailability() {
  for (const candidate of BACKEND_CANDIDATES) {
    if (fs.existsSync(candidate)) return { available: true, path: candidate };
  }
  return { available: false, path: null };
}

function sigmaPrediction(sigmas, bandwidth, currentPrice) {
  const absS = Math.abs(sigmas);
  const bwPct = bandwidth / (currentPrice || 1);

  let direction, confidence, reason;
  if (sigmas > 2.0) {
    direction = 'SHORT'; confidence = Math.min(0.90, 0.65 + (sigmas - 2.0) * 0.10); reason = 'extreme overbought — mean reversion expected';
  } else if (sigmas < -2.0) {
    direction = 'LONG';  confidence = Math.min(0.90, 0.65 + (-sigmas - 2.0) * 0.10); reason = 'extreme oversold — mean reversion expected';
  } else if (sigmas > 1.0) {
    direction = 'SHORT'; confidence = 0.40 + (sigmas - 1.0) * 0.10; reason = 'above mean — mild overbought pressure';
  } else if (sigmas < -1.0) {
    direction = 'LONG';  confidence = 0.40 + (-sigmas - 1.0) * 0.10; reason = 'below mean — mild oversold pressure';
  } else {
    direction = 'NEUTRAL'; confidence = 0.30; reason = `within 1σ — indeterminate (bandwidth ${(bwPct * 100).toFixed(1)}%)`;
  }

  // Low bandwidth = squeeze, reduces conviction
  if (bwPct < 0.015) { confidence *= 0.75; reason += ' [squeeze — low conviction]'; }

  return { direction, confidence: Number(confidence.toFixed(3)), reason, sigmas: Number(sigmas.toFixed(4)) };
}

function computeSigmaState(symbol, timeframe, windowSize) {
  const snapshot = readSnapshot(DEFAULT_HISTORY);
  if (!snapshot) return null;

  const bars = (snapshot.sources || []).filter(s =>
    s.symbol === symbol &&
    (!s.timeframe || s.timeframe === timeframe) &&
    typeof s.close === 'number' && isFinite(s.close)
  ).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  if (bars.length < windowSize) return null;

  const recent = bars.slice(-windowSize);
  const closes = recent.map(s => s.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const stddev = Math.sqrt(closes.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / closes.length);
  const currentPrice = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2] ?? currentPrice;
  const sigmas = (currentPrice - mean) / (stddev || 1);
  const upper = mean + 2 * stddev;
  const lower = mean - 2 * stddev;
  const bandwidth = upper - lower;
  const position = bandwidth > 0 ? (currentPrice - lower) / bandwidth : 0.5;

  return {
    bars: bars.length, closes, mean, stddev, currentPrice, prevPrice,
    sigmas, upper, lower, bandwidth, position,
    lastTimestamp: bars[bars.length - 1].timestamp,
    prediction: sigmaPrediction(sigmas, bandwidth, currentPrice),
  };
}

function renderSigmaFrame(symbol, timeframe, windowSize, state, pollIntervalSec, nextRefreshIn, tickCount) {
  const A_ESC = '\x1b';
  const CYAN = `${A_ESC}[1;36m`;
  const BOLD = `${A_ESC}[1m`;
  const GRAY = `${A_ESC}[90m`;
  const YELLOW = `${A_ESC}[33m`;
  const GREEN = `${A_ESC}[32m`;
  const RED = `${A_ESC}[31m`;
  const B_GREEN = `${A_ESC}[1;32m`;
  const B_RED = `${A_ESC}[1;31m`;
  const B_YELLOW = `${A_ESC}[1;33m`;
  const RESET = `${A_ESC}[0m`;
  const { renderSigmaSparkline } = require('../../tui/index.js');
  const { currentPrice, prevPrice, mean, stddev, sigmas, upper, lower, bandwidth, position, lastTimestamp, prediction } = state;

  const changePct = prevPrice !== 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
  const changeColor = changePct >= 0 ? GREEN : RED;
  const changeSign = changePct >= 0 ? '+' : '';

  const positionBar = (() => {
    const w = 30;
    const p = Math.round(position * (w - 1));
    const bar = Array(w).fill('─');
    bar[0] = '└'; bar[w - 1] = '┘';
    bar[Math.floor(w / 2)] = '┼';
    if (p >= 0 && p < w) bar[p] = `${B_YELLOW}●${RESET}`;
    return bar.join('');
  })();

  const predColor = prediction.direction === 'LONG' ? B_GREEN :
                    prediction.direction === 'SHORT' ? B_RED : GRAY;
  const confBar = (() => {
    const filled = Math.round(prediction.confidence * 10);
    return `[${GREEN}${'█'.repeat(filled)}${GRAY}${'░'.repeat(10 - filled)}${RESET}]`;
  })();

  const spinner = ['◐', '◓', '◑', '◒'][tickCount % 4];
  const nextSec = Math.max(0, Math.ceil(nextRefreshIn / 1000));

  let buf = '';
  buf += `\n${CYAN}${BOLD}Sigma Band Live${RESET}  ${GRAY}${symbol} · ${timeframe} · BB${windowSize}${RESET}`;
  buf += `  ${GRAY}${spinner} next poll ${nextSec}s${RESET}\n`;
  buf += `${GRAY}${'─'.repeat(72)}${RESET}\n`;

  // Price row
  buf += `  ${BOLD}Price${RESET}  ${YELLOW}${currentPrice.toFixed(currentPrice < 1 ? 6 : 4)}${RESET}`;
  buf += `  ${changeColor}${changeSign}${changePct.toFixed(3)}%${RESET}`;
  buf += `  ${GRAY}·  ${RESET}`;
  buf += `  ${BOLD}Mean${RESET} ${mean.toFixed(currentPrice < 1 ? 6 : 4)}`;
  buf += `  ${BOLD}σ${RESET} ${stddev.toFixed(currentPrice < 1 ? 6 : 4)}`;
  buf += `  ${GRAY}·  ${RESET}`;
  buf += `  Pos ${GRAY}${(position * 100).toFixed(1)}%${RESET}\n`;

  // Band rows
  buf += `  ${GRAY}Upper${RESET} ${RED}${upper.toFixed(currentPrice < 1 ? 6 : 4)}${RESET}`;
  buf += `   ${GRAY}Lower${RESET} ${GREEN}${lower.toFixed(currentPrice < 1 ? 6 : 4)}${RESET}`;
  buf += `   ${GRAY}BW${RESET} ${(bandwidth / (currentPrice || 1) * 100).toFixed(2)}%\n`;

  // Position bar
  buf += `  ${GRAY}low ─────────────────────────────── high${RESET}\n`;
  buf += `       ${positionBar}\n`;

  // Sigma chart
  buf += renderSigmaSparkline(mean, stddev, currentPrice);

  // Prediction box
  buf += `\n${GRAY}${'─'.repeat(72)}${RESET}\n`;
  buf += `  ${BOLD}Prediction${RESET}  ${predColor}${prediction.direction}${RESET}`;
  buf += `  ${GRAY}confidence${RESET} ${confBar} ${Math.round(prediction.confidence * 100)}%\n`;
  buf += `  ${GRAY}${prediction.reason}${RESET}`;
  buf += `  ${GRAY}·  ${sigmas >= 0 ? '+' : ''}${sigmas.toFixed(3)}σ from mean${RESET}\n`;
  buf += `  ${GRAY}Last bar: ${lastTimestamp ?? 'n/a'}  ·  ${state.bars} bars loaded${RESET}\n`;

  buf += `\n${GRAY}  q: quit   r: refresh now   polling every ${pollIntervalSec}s${RESET}\n`;

  return buf;
}

function visualLineCount(buf) {
  const cols = process.stdout.columns || 80;
  const stripped = buf.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const lines = stripped.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let count = 0;
  for (const line of lines) {
    count += Math.max(1, Math.ceil((line.length || 0) / cols));
  }
  return count;
}

async function runBackendVisualize(args = []) {
  let symbol = optionValue(args, '--symbol', null);
  let timeframe = optionValue(args, '--timeframe', '1d');
  let windowSize = parseInt(optionValue(args, '--window', '20'), 10) || 20;
  const pollSec = Math.max(5, parseInt(optionValue(args, '--interval', '30'), 10) || 30);
  const noPoll = hasFlag(args, '--no-poll');

  if (!symbol && utils.isRichTerminal()) {
    const { pickAssets } = require('../../tui/asset_picker');
    symbol = await pickAssets({ label: 'Sigma Band Visualizer', multi: false });
    if (!symbol) return { ok: false, error: 'No symbol selected' };
  }

  if (!symbol) return { ok: false, error: 'No symbol provided. Use --symbol or the interactive picker.' };

  // Initial compute
  let state = computeSigmaState(symbol, timeframe, windowSize);
  if (!state) {
    const snap = readSnapshot(DEFAULT_HISTORY);
    if (!snap) return { ok: false, error: 'No cache data found. Run a backfill first.' };
    return { ok: false, error: `Insufficient data for ${symbol} on ${timeframe} (need ${windowSize}+ bars).` };
  }

  // One-shot mode (no TTY or --no-poll)
  if (noPoll || !utils.isRichTerminal()) {
    const { renderSigmaSparkline } = require('../../tui/index.js');
    const { currentPrice, mean, stddev, sigmas, prediction } = state;
    console.log(`\n\x1b[1;36mSigma Bands — ${symbol} (${timeframe}, BB${windowSize})\x1b[0m`);
    console.log(`  Price: \x1b[33m${currentPrice.toFixed(4)}\x1b[0m  Mean: ${mean.toFixed(4)}  σ: ${stddev.toFixed(4)}  Position: \x1b[${Math.abs(sigmas) > 2 ? '31' : '32'}m${sigmas >= 0 ? '+' : ''}${sigmas.toFixed(3)}σ\x1b[0m`);
    console.log(renderSigmaSparkline(mean, stddev, currentPrice));
    console.log(`\n  Prediction: \x1b[1m${prediction.direction}\x1b[0m  ${Math.round(prediction.confidence * 100)}% — ${prediction.reason}`);
    return { ok: true, symbol, timeframe, window: windowSize, ...state };
  }

  // Live poll mode — raw stdin for q/r keys, periodic redraw
  process.stdin.removeAllListeners('data');
  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let prevLineCount = 0;
  let nextRefreshAt = Date.now() + pollSec * 1000;
  let tickCount = 0;
  let stopped = false;

  function redraw() {
    const buf = renderSigmaFrame(symbol, timeframe, windowSize, state, pollSec, nextRefreshAt - Date.now(), tickCount);
    if (prevLineCount > 0) process.stdout.write(`\x1b[${prevLineCount}A\x1b[J`);
    process.stdout.write(buf);
    prevLineCount = visualLineCount(buf);
    tickCount++;
  }

  // Key handler: q exits, r refreshes immediately
  const onKey = (chunk) => {
    const key = String(chunk);
    if (key === 'q' || key === 'Q' || key === '\x03') {
      stopped = true;
      clearInterval(tickTimer);
      clearInterval(pollTimer);
      process.stdin.removeListener('data', onKey);
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
      process.stdout.write('\n\x1b[90mSigma Band live view stopped.\x1b[0m\n');
      return;
    }
    if (key === 'r' || key === 'R') {
      const fresh = computeSigmaState(symbol, timeframe, windowSize);
      if (fresh) state = fresh;
      nextRefreshAt = Date.now() + pollSec * 1000;
      redraw();
    }
  };
  process.stdin.on('data', onKey);

  // Draw immediately
  redraw();

  // Spinner tick every second
  const tickTimer = setInterval(() => {
    if (stopped) return;
    redraw();
  }, 1000);

  // Poll: re-read snapshot and redraw
  const pollTimer = setInterval(() => {
    if (stopped) return;
    const fresh = computeSigmaState(symbol, timeframe, windowSize);
    if (fresh) state = fresh;
    nextRefreshAt = Date.now() + pollSec * 1000;
    redraw();
  }, pollSec * 1000);

  // Wait until stopped
  return new Promise(resolve => {
    const check = setInterval(() => {
      if (stopped) {
        clearInterval(check);
        resolve({ ok: true, symbol, timeframe, window: windowSize });
      }
    }, 200);
  });
}

async function commandBackend(args) {
  const subcommand = args[0] || 'status';

  const subcommands = {
    status: (a) => runBackendStatus(a),
    stats: (a) => runBackendStats(a),
    portfolio: (a) => runBackendPortfolio(a),
    correlation: (a) => runBackendCorrelation(a),
    visualize: (a) => runBackendVisualize(a),
    universe: (a) => runBackendUniverse(a),
    integrity: (a) => runBackendIntegrity(a),
    benchmark: (a) => runBackendBenchmark(a),
    indicators: (a) => runBackendIndicators(a),
    data: (a) => {
      const nested = a[0] || 'summary';
      if (nested !== 'summary') throw new Error(`Unsupported backend data command: ${nested}`);
      return runBackendDataSummary(a.slice(1));
    }
  };

  const handler = subcommands[subcommand];
  if (!handler) {
    printPayload({ error: `Unsupported backend command: ${subcommand}` }, args);
    return 1;
  }

  try {
    const payload = await handler(args.slice(1));
    
    if (subcommand === 'correlation' && payload.ok && !hasFlag(args, '--json')) {
        const { renderCorrelationHeatmap } = require('../../tui/index.js');
        if (Array.isArray(payload._droppedSymbols) && payload._droppedSymbols.length > 0) {
          console.log(renderDroppedCorrelationSymbols(payload._droppedSymbols));
        }
        console.log('\n' + renderCorrelationHeatmap(payload.labels, payload.values, payload._lastPrices || {}, {
          method: payload.method,
          transform: payload.transform,
          note: payload._fxNote
        }));
        return 0;
    }

    if (subcommand === 'correlation' && !payload.ok && payload.engine === 'sovereign_cli_preflight' && !hasFlag(args, '--json')) {
        console.error(renderCorrelationPreflightError(payload));
        return 1;
    }

    if (subcommand === 'integrity' && !hasFlag(args, '--json')) {
        return payload.ok ? 0 : 1; // report already printed inside runBackendIntegrity
    }

    if (subcommand === 'universe' && !hasFlag(args, '--json')) {
        pageText(renderBackendUniverse(payload), args);
        return payload.available !== false && payload.ok ? 0 : 1;
    }

    if (subcommand === 'visualize' && !hasFlag(args, '--json')) {
        if (!payload.ok) console.error(`\x1b[1;31m[ERROR] ${payload.error}\x1b[0m`);
        return payload.ok ? 0 : 1;
    }

    printPayload(payload, args);

    // Extend data summary into correlation analysis
    if (subcommand === 'data' && payload.ok && !hasFlag(args, '--json') && utils.isRichTerminal()) {
      const { promptConfirm } = require('../../tui/engine/engine.js');
      const extend = await promptConfirm('Extend to correlation analysis?');
      if (extend) {
        // Backend nests it: { type:'market_data_summary', summary:{ symbol, ... } }
        const primarySymbol = payload.summary?.symbol || optionValue(args, '--symbol', null);
        // Mirror data summary's window so both commands analyse the same quote range.
        // payload.summary.bars is the actual bar count C++ used — use that as max-bars.
        const corrArgs = [];
        const tf = optionValue(args, '--timeframe', null);
        const inp = optionValue(args, '--input', null);
        const mb = optionValue(args, '--max-bars', null);
        if (tf) corrArgs.push('--timeframe', tf);
        if (inp) corrArgs.push('--input', inp);
        // Prefer the resolved bar count from the summary response; fall back to the CLI arg.
        const summaryBars = payload.summary?.bars;
        const effectiveBars = summaryBars != null ? String(summaryBars) : (mb || '0');
        corrArgs.push('--max-bars', effectiveBars);
        const corrPayload = await runBackendCorrelation(corrArgs, primarySymbol);
        if (corrPayload.ok) {
          const { renderCorrelationHeatmap } = require('../../tui/index.js');
          console.log('\n' + renderCorrelationHeatmap(corrPayload.labels, corrPayload.values, corrPayload._lastPrices || {}, {
            method: corrPayload.method,
            transform: corrPayload.transform,
            note: corrPayload._fxNote
          }));
        } else {
          printPayload(corrPayload, args);
        }
      }
    }

    return payload.available !== false && payload.ok ? 0 : 1;
  } catch (e) {
    printPayload({ error: e.message }, args);
    return 1;
  }
}

module.exports = {
  locateBackendBinary, 
  runBackendCommand, 
  runBackendStatus, 
  runBackendStats, 
  runBackendPortfolio, 
  runBackendDataSummary, 
  runBackendCorrelation,
  defaultCorrelationMethod,
  resolveCorrelationMethod,
  renderBackendUniverse,
  runBackendUniverse,
  runBackendIndicators,
  reportSnapshotIntegrity, 
  runBackendIntegrity, 
  backendAvailability, 
  commandBackend,
  _test: {
    buildFocusedSnapshot,
    renderCorrelationPreflightError,
    summarizeCoverage,
    noOverlapBlockers,
  }
};
