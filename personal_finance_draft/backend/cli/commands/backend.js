const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const utils = require('../lib/utils.js');
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
  isRichTerminal
} = utils;

const { readSnapshot, validateSnapshot } = require('../../../shared/lib/market_validation');

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

async function runBackendDataSummary(args = []) {
  let symbol = optionValue(args, '--symbol', null);

  if (!symbol && utils.isRichTerminal()) {
    const { promptSelect } = require('../tui/engine');

    const categoryMap = {
      equities: 'Market Equities', indices: 'Market Indices', commodities: 'Commodities',
      crypto: 'Crypto Assets', fx: 'Foreign Exchange', macro: 'Economic Data (Macro)',
      pmi: 'Economic Data (Macro)', sentiment: 'Market Sentiment', reserves: 'Global Reserves',
      holdings: 'Institutional Holdings', equities_options: 'Derivatives (Options)',
      stock_options: 'Derivatives (Options)'
    };

    const seen = new Set();
    const choices = [];
    utils.get_Current_Universe_Symbols().forEach(u => {
      if (!u.symbol || seen.has(u.symbol)) return;
      seen.add(u.symbol);
      choices.push({ label: u.symbol, value: u.symbol, category: categoryMap[u.family] || 'Other Assets' });
    });
    choices.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

    console.log(`\n\x1b[1;36mData Summary\x1b[0m`);
    const selected = await promptSelect('Select asset to inspect:', choices);
    if (!selected) return { ok: false, error: 'User cancelled selection' };
    symbol = selected;
  }

  const resolved = utils.resolveSymbols([symbol || 'AAPL'])[0];

  return runBackendCommand([
    'data',
    'summary',
    '--symbol',
    resolved,
    '--timeframe',
    optionValue(args, '--timeframe', '1d'),
    '--input',
    optionValue(args, '--input', DEFAULT_HISTORY),
    '--max-bars',
    optionValue(args, '--max-bars', '0'),
    '--json',
  ]);
}

async function runBackendCorrelation(args = [], preSelectedSymbol = null) {
  let symbols = optionValue(args, '--symbols', null);

  if (!symbols && utils.isRichTerminal()) {
    const { promptMultiSelect } = require('../tui/engine');
    const rawUniverse = utils.get_Current_Universe_Symbols();

    const categoryMap = {
      equities: 'Market Equities', indices: 'Market Indices', commodities: 'Commodities',
      crypto: 'Crypto Assets', fx: 'Foreign Exchange', macro: 'Economic Data (Macro)',
      pmi: 'Economic Data (Macro)', sentiment: 'Market Sentiment', reserves: 'Global Reserves',
      holdings: 'Institutional Holdings', equities_options: 'Derivatives (Options)',
      stock_options: 'Derivatives (Options)'
    };

    // Step 1: Family filter
    const availableFamilies = [...new Set(rawUniverse.map(u => u.family).filter(Boolean))].sort();
    const familyChoices = availableFamilies.map(f => ({
      label: f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' '),
      value: f,
      category: ''
    }));

    console.log(`\n\x1b[1;36mCorrelation Analysis\x1b[0m \x1b[90m— Step 1 of 2: filter by family (Enter with none = include all)\x1b[0m`);
    const selectedFamilies = await promptMultiSelect('Include families:', familyChoices);
    if (selectedFamilies === null) return { ok: false, error: 'User cancelled selection' };
    const filterFamilies = selectedFamilies.length > 0;

    // Step 2: Symbol picker filtered by chosen families
    const seen = new Set();
    const choices = [];
    rawUniverse.forEach(u => {
      const s = u.symbol;
      if (!s || seen.has(s)) return;
      if (filterFamilies && !selectedFamilies.includes(u.family)) return;
      if (s.includes('_CALL') || s.includes('_PUT')) return;
      seen.add(s);
      choices.push({ label: s, value: s, category: categoryMap[u.family] || 'Other Assets' });
    });
    choices.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

    if (preSelectedSymbol) {
      console.log(`\n\x1b[90mPrimary from data summary: \x1b[36m${preSelectedSymbol}\x1b[90m (auto-included)\x1b[0m`);
    }
    console.log(`\x1b[1;36mCorrelation Analysis\x1b[0m \x1b[90m— Step 2 of 2: select assets\x1b[0m`);
    const selected = await promptMultiSelect('Select assets to correlate (min 2):', choices);
    if (selected === null) return { ok: false, error: 'User cancelled selection' };

    const allSelected = preSelectedSymbol
      ? [preSelectedSymbol, ...selected.filter(s => s !== preSelectedSymbol)]
      : selected;

    if (allSelected.length < 2) {
      console.error('\n\x1b[31mError: Correlation requires at least 2 symbols.\x1b[0m');
      return { ok: false, error: 'Insufficient symbols selected' };
    }
    symbols = allSelected.join(',');
  }

  if (!symbols) symbols = 'AAPL,MSFT,SPY';

  const resolved = utils.resolveSymbols(symbols).join(',');

  return runBackendCommand([
    'correlation',
    '--symbols',
    resolved,
    '--timeframe',
    optionValue(args, '--timeframe', '1d'),
    '--input',
    optionValue(args, '--input', DEFAULT_HISTORY),
    '--max-bars',
    optionValue(args, '--max-bars', '252'),
    '--json',
  ]);
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

function runBackendIntegrity(args = []) {
  const liveInput = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const historyInput = optionValue(args, '--history', DEFAULT_HISTORY);
  const universe = runBackendUniverse(args);
  const liveCache = reportSnapshotIntegrity(liveInput, true);
  const historicalCache = reportSnapshotIntegrity(historyInput, false);
  const ok = Boolean(universe.available && universe.ok && liveCache.ok && historicalCache.ok);
  return {
    available: universe.available,
    ok,
    engine: 'sovereign_cli_frontend',
    type: 'backend_integrity',
    schema_version: 1,
    live_cache: liveCache,
    historical_cache: historicalCache,
    universe: universe.available ? {
      ok: universe.ok,
      input: universe.input || historyInput,
      entries: Array.isArray(universe.entries) ? universe.entries.length : 0,
      top_symbols: Array.isArray(universe.entries) ? universe.entries.slice(0, 5).map((entry) => entry.symbol) : [],
    } : universe,
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

async function commandBackend(args) {
  const subcommand = args[0] || 'status';

  const subcommands = {
    status: (a) => runBackendStatus(a),
    stats: (a) => runBackendStats(a),
    portfolio: (a) => runBackendPortfolio(a),
    correlation: (a) => runBackendCorrelation(a),
    universe: (a) => runBackendUniverse(a),
    integrity: (a) => runBackendIntegrity(a),
    benchmark: (a) => runBackendBenchmark(a),
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
        const { renderCorrelationHeatmap } = require('../tui');
        console.log('\n' + renderCorrelationHeatmap(payload.labels, payload.values));
        return 0;
    }

    printPayload(payload, args);

    // Extend data summary into correlation analysis
    if (subcommand === 'data' && payload.ok && !hasFlag(args, '--json') && utils.isRichTerminal()) {
      const { promptConfirm } = require('../tui/engine');
      const extend = await promptConfirm('Extend to correlation analysis?');
      if (extend) {
        // Backend nests it: { type:'market_data_summary', summary:{ symbol, ... } }
        const primarySymbol = payload.summary?.symbol || optionValue(args, '--symbol', null);
        // Pass only timeframe + input — not --max-bars (data summary default 0 ≠ correlation default 252)
        const corrArgs = [];
        const tf = optionValue(args, '--timeframe', null);
        const inp = optionValue(args, '--input', null);
        if (tf) corrArgs.push('--timeframe', tf);
        if (inp) corrArgs.push('--input', inp);
        const corrPayload = await runBackendCorrelation(corrArgs, primarySymbol);
        if (corrPayload.ok) {
          const { renderCorrelationHeatmap } = require('../tui');
          console.log('\n' + renderCorrelationHeatmap(corrPayload.labels, corrPayload.values));
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
  runBackendUniverse, 
  reportSnapshotIntegrity, 
  runBackendIntegrity, 
  backendAvailability, 
  commandBackend
};
