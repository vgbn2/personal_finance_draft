const path = require('node:path');
const os = require('node:os');
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');

const utils = require('../../lib/utils.js');
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

// Child modules
const {
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
} = require('./backend_correlation.js');

const { reportSnapshotIntegrity, runBackendIntegrity } = require('./backend_integrity.js');

const { sigmaPrediction, computeSigmaState, renderSigmaFrame, visualLineCount, runBackendVisualize } = require('./backend_visualize.js');

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
  // Expose async runner for child modules that lazy-require it
  runBackendCommandAsync,
  _test: {
    buildFocusedSnapshot,
    renderCorrelationPreflightError,
    summarizeCoverage,
    noOverlapBlockers,
  }
};
