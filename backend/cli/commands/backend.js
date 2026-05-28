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
  currentPhaseLabel
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

function runBackendDataSummary(args = []) {
  return runBackendCommand([
    'data',
    'summary',
    '--symbol',
    optionValue(args, '--symbol', 'AAPL'),
    '--timeframe',
    optionValue(args, '--timeframe', '1d'),
    '--input',
    optionValue(args, '--input', DEFAULT_HISTORY),
    '--max-bars',
    optionValue(args, '--max-bars', '0'),
    '--json',
  ]);
}

function runBackendCorrelation(args = []) {
  return runBackendCommand([
    'correlation',
    '--symbols',
    optionValue(args, '--symbols', 'AAPL,MSFT,SPX'),
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

function commandBackend(args) {
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
    const payload = handler(args.slice(1));
    printPayload(payload, args);
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
