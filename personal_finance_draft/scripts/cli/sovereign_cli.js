#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('../lib/env');

const {
  fetchBinanceBaseCandles,
  fetchCoinbaseBaseCandles,
  fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets,
  fetchStooqDailyHistory,
  fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles,
  fetchPaginated,
  fetchParallelBackfill,
  ingestMarketData,
  dedupePreferredMarketQuotes,
  loadConfig,
  loadExternalQuoteInputs,
  resolveCommoditySymbol,
  resolveEquityOrIndexSymbol,
  resolveStooqSymbol,
} = require('../data_ops/ingest_market_data');
const { DEFAULT_PROVIDER_PRIORITY } = require('../lib/quote_router');
const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../lib/backtest');
const {
  calculateFeatureFrame,
  calculateRollingFeatureFrame,
  DEFAULT_PERIODS,
  generateSampleBars,
} = require('../lib/indicators');
const { compareModels } = require('../lib/models');
const fs = require('node:fs');
const {
  mergeSnapshots,
  readSnapshot,
  validateSnapshot,
  writeJson,
} = require('../lib/market_validation');

const {
  runInteractiveMenu,
  handleIntersection,
  promptSelect,
  promptText,
  promptConfirm,
  isRichTerminal,
} = require('../tui_cli');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SNAPSHOT = path.join(REPO_ROOT, 'data', 'cache', 'last_fetch.json');
const DEFAULT_QUALITY_REPORT = path.join(REPO_ROOT, 'data', 'cache', 'data_quality_report.json');
const DEFAULT_HISTORY = path.join(REPO_ROOT, 'data', 'cache', 'backtest_history.json');
const DEFAULT_FEATURES = path.join(REPO_ROOT, 'data', 'features', 'latest_features.json');
const DEFAULT_MODEL_REPORT = path.join(REPO_ROOT, 'data', 'models', 'latest_model_comparison.json');
const DEFAULT_BACKTEST = path.join(REPO_ROOT, 'data', 'backtests', 'latest_backtest.json');
const DEFAULT_STATE_PATH = path.join(REPO_ROOT, 'workspace', 'STATE.md');
const BACKEND_CANDIDATES = [
  path.join(REPO_ROOT, 'cpp_core', 'build', 'manual', process.platform === 'win32' ? 'sovereign_wealth.exe' : 'sovereign_wealth'),
  path.join(REPO_ROOT, 'build', 'cpp_core', process.platform === 'win32' ? 'sovereign_wealth.exe' : 'sovereign_wealth'),
  path.join(REPO_ROOT, 'cpp_core', 'src', process.platform === 'win32' ? 'sovereign_wealth.exe' : 'sovereign_wealth'),
];

function usage() {
  pageText(helpText('overview'), []);
}

const HELP_TOPICS = {
  overview: [
    'Sovereign CLI',
    '',
    'Daily commands',
    '  status        Show phase, cache, and data-quality status',
    '  cockpit       Open the terminal dashboard',
    '  backend       Show C++ backend runtime, stats, data, correlation, and integrity',
    '  quotes        Show configured Headway MT5/MT5/Webull quote imports and dedup status',
    '  strategy new  Create a validated strategy plan file',
    '  backfill      Build a historical cache for real-data backtests',
    '  demo          Run sample features, models, backtest, and period optimization',
    '  check         Validate the current live cache',
    '  bt            Run the live-cache backtest',
    '  bt --sample   Run the deterministic validation backtest',
    '  optimize      Test indicator periods against backtest metrics',
    '  trade         Place trades and check balances (Alpaca)',
    '  watch         Periodically synchronize market data in the background',
    '',
    'Navigation',
    '  help                 Show this guide',
    '  help commands        Command map',
    '  help backtest        Backtest options and metrics',
    '  help indicators      Indicator period options',
    '  help examples        Copyable command examples',
    '',
    'Tip: use --json for machine-readable output.',
  ],
  commands: [
    'Command Map',
    '',
    'Operational',
    '  status',
    '  backend status | backend stats [--equity 100,110,105]',
    '  backend data summary [--symbol AAPL] [--timeframe 1d] [--input path]',
    '  backend correlation [--symbols AAPL,MSFT,SPX] [--timeframe 1d] [--input path]',
    '  backend universe [--input path] [--max-entries 0]',
    '  backend integrity [--json]',
    '  quotes status [--json]',
    '  strategy new <name> [--kind momentum] [--model cnn_v3] [--output path]',
    '  strategy list | strategy validate',
    '  ingest [--full]',
    '  backfill [--timeframe 1d] [--days 365] [--include-prediction]',
    '  check | validate [--input path] [--strict]',
    '  trade balance | trade <buy|sell> <symbol> <qty> [type] [price] [--live]',
    '  watch [--family crypto|fx|all] [--interval 15]',
    '',
    'Research',
    '  features | indicators [--sample] [--timeframe 1d]',
    '  models | model compare [--sample] [--timeframe 1d] [--horizon 5]',
    '  bt | backtest [--sample] [--timeframe 1d] [--from YYYY-MM-DD] [--to YYYY-MM-DD]',
    '  optimize [--sample] [--timeframe 1d]',
    '',
    'Output files',
    `  quality:  ${DEFAULT_QUALITY_REPORT}`,
    `  history:  ${DEFAULT_HISTORY}`,
    `  features: ${DEFAULT_FEATURES}`,
    `  models:   ${DEFAULT_MODEL_REPORT}`,
    `  backtest: ${DEFAULT_BACKTEST}`,
  ],
  backtest: [
    'Backtest Help',
    '',
    'Basic',
    '  node scripts/cli/sovereign_cli.js bt',
    '',
    'Useful options',
    '  --timeframe 1d          Use one timeframe only',
    '  --from YYYY-MM-DD       Start date filter',
    '  --to YYYY-MM-DD         End date filter',
    '  --sample-size 1000      Deterministic sample bars per symbol',
    '  --train-ratio 0.70      First slice used for period selection',
    '  --horizon 5             Holding period in bars',
    '  --threshold 0.55        Minimum model confidence',
    '  --fee-bps 2             Commission or exchange fee per side',
    '  --slippage-bps 3        Slippage per side',
    '  --cost-bps 5            Backward-compatible total cost hint',
    '  --tail-alpha 0.05       Tail risk confidence level',
    '  --monte-carlo-runs 1000 Bootstrap stress runs',
    '  --relevance-floor 0.30  Filter backfilled data by reliability score',
    '  --model cnn_window_v0   Model candidate to backtest; run `models --json` to compare candidates per asset',
    '  --allow-degraded       Permit backtest despite data-quality errors',
    '',
    'Metrics',
    '  max_drawdown            Peak-to-trough equity decline',
    '  sharpe_ratio            Annualized by timeframe and holding horizon',
    '  sortino_ratio           Annualized downside-risk version of Sharpe',
    '  win_rate                Winning trades / total trades',
    '  expectancy / EV         Average net return per trade',
    '  tail_risk               Historical VaR and expected shortfall',
    '  monte_carlo             Deterministic bootstrap stress test',
    '  oos_expected_value      Test-slice expectancy after train-slice selection',
  ],
  watch: [
    'Sovereign Watch Mode',
    '',
    'Description',
    '  Periodically synchronizes market data in the background.',
    '',
    'Usage',
    '  node scripts/cli/sovereign_cli.js watch [--family crypto|fx|all] [--interval 15]',
    '',
    'Options',
    '  --family    The data family to monitor (default: crypto)',
    '  --interval  The refresh interval in minutes (default: 15)',
  ],
  indicators: [
    'Indicator Period Help',
    '',
    'Single run',
    '  node scripts/cli/sovereign_cli.js bt --sample --rsi 7 --atr 7 --bollinger 10 --volatility 10',
    '',
    'Grid search',
    '  node scripts/cli/sovereign_cli.js optimize --sample',
    '',
    'Period options',
    '  --return-fast N',
    '  --return-slow N',
    '  --volatility N',
    '  --rsi N',
    '  --atr N',
    '  --bollinger N',
    '',
    'Default optimization grid',
    '  RSI: 7, 14, 21',
    '  ATR: 7, 14, 21',
    '  Bollinger: 10, 20, 30',
    '  Volatility: 10, 20, 60',
  ],
  examples: [
    'Examples',
    '',
    'Check the live cache',
    '  node scripts/cli/sovereign_cli.js status',
    '  node scripts/cli/sovereign_cli.js check',
    '',
    'Run an end-to-end deterministic research demo',
    '  node scripts/cli/sovereign_cli.js demo',
    '',
    'Run a timeframe-aware live backtest',
    '  node scripts/cli/sovereign_cli.js backfill --timeframe 1d --days 365 --include-prediction --relevance-floor 0.30',
    '  node scripts/cli/sovereign_cli.js bt --input data/cache/backtest_history.json --timeframe 1d',
    '  node scripts/cli/sovereign_cli.js bt --timeframe 1d --from 2025-02-01 --to 2025-04-30',
    '  node scripts/cli/sovereign_cli.js bt --timeframe 1d --fee-bps 2 --slippage-bps 3 --tail-alpha 0.05 --monte-carlo-runs 2000',
    '  node scripts/cli/sovereign_cli.js optimize --sample --sample-size 1000 --train-ratio 0.7',
    '',
    'Try a specific indicator configuration',
    '  node scripts/cli/sovereign_cli.js bt --sample --rsi 7 --atr 7 --bollinger 10 --volatility 10',
    '  node scripts/cli/sovereign_cli.js bt --sample --sample-size 1000 --train-ratio 0.7',
    '',
    'Get JSON for another tool',
    '  node scripts/cli/sovereign_cli.js bt --json',
  ],
};

function helpText(topic) {
  return (HELP_TOPICS[topic] || HELP_TOPICS.overview).join('\n');
}

function pageText(text, args) {
  if (process.platform === 'win32' || hasFlag(args, '--no-pager') || hasFlag(args, '--json') || !process.stdout.isTTY) {
    console.log(text);
    return;
  }
  const pager = process.platform === 'win32' ? 'more.com' : 'less';
  const result = spawnSync(pager, process.platform === 'win32' ? [] : ['-R'], {
    input: text,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: false,
  });
  if (result.error) {
    console.log(text);
  }
}

function optionValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function printPayload(payload, args) {
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (const [key, value] of Object.entries(payload)) {
    const rendered = renderHumanValue(value);
    console.log(`${key}: ${rendered}`);
  }
}

function currentPhaseLabel() {
  try {
    const text = fs.readFileSync(DEFAULT_STATE_PATH, 'utf8');
    const match = text.match(/^## Current Phase\r?\n([^\r\n]+)/m);
    return match ? match[1].trim() : 'Unknown phase';
  } catch {
    return 'Unknown phase';
  }
}

function slugifyStrategyName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function get_Current_Universe_Symbols() {
  try {
    if (!fs.existsSync(DEFAULT_HISTORY)) return ['BTCUSDT', 'ETHUSDT'];
    const data = JSON.parse(fs.readFileSync(DEFAULT_HISTORY, 'utf8'));
    const symbols = [...new Set(data.sources.map(s => s.symbol))].filter(Boolean);
    return symbols.length > 0 ? symbols : ['BTCUSDT', 'ETHUSDT'];
  } catch (e) {
    return ['BTCUSDT', 'ETHUSDT'];
  }
}

function buildStrategyPlan(name, options = {}) {
  const strategyName = slugifyStrategyName(name);
  if (!strategyName) {
    throw new Error('strategy name is required');
  }
  const kind = String(options.kind || 'momentum').toLowerCase();
  const model = String(options.model || 'cnn_v3');
  
  // Dynamic Universe: Use provided options or fetch real symbols from cache
  const universe = Array.isArray(options.universe) && options.universe.length > 0 
    ? options.universe 
    : get_Current_Universe_Symbols().slice(0, 5); // Default to top 5 symbols
    
  const threshold = Number.isFinite(Number(options.signalThreshold)) ? Number(options.signalThreshold) : 0.65;
  const maxHoldingDays = Number.isFinite(Number(options.maxHoldingDays)) ? Number(options.maxHoldingDays) : 5;
  const riskWeight = Number.isFinite(Number(options.riskWeight)) ? Number(options.riskWeight) : 0.4;
  return [
    `name: ${strategyName}`,
    `kind: ${kind}`,
    'status: draft',
    'enabled: false',
    `model: ${model}`,
    'sections:',
    `  hypothesis: "Replace this with the market edge thesis for ${strategyName}."`,
    '  universe:',
    ...universe.map((symbol) => `    - ${symbol}`),
    '  signals:',
    '    entry: "Define the trigger conditions here."',
    '    exit: "Define the exit conditions here."',
    '  data:',
    '    required_sources:',
    '      - price_volume',
    '      - sentiment',
    '    validation: strict',
    '  risk:',
    `    signal_threshold: ${threshold}`,
    `    max_holding_days: ${maxHoldingDays}`,
    `    risk_weight: ${riskWeight}`,
    '    fail_closed: true',
    '  promotion:',
    '    require_backtest: true',
    '    require_walk_forward: true',
    '    require_paper_trade: true',
    '    review_required: true',
    '  notes: []',
    '',
  ].join('\n');
}

function readStrategyRegistry() {
  const registryPath = path.join(REPO_ROOT, 'config', 'strategies.yaml');
  if (!fs.existsSync(registryPath)) {
    return [];
  }
  const text = fs.readFileSync(registryPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const files = [];
  let inRegistry = false;
  let inFiles = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'registry:') {
      inRegistry = true;
      inFiles = false;
      continue;
    }
    if (inRegistry && line === 'files:') {
      inFiles = true;
      continue;
    }
    if (inFiles) {
      const match = line.match(/^-\s+"?([^"]+)"?$/);
      if (match) {
        files.push(match[1]);
        continue;
      }
      if (line && !line.startsWith('-')) {
        break;
      }
    }
  }
  return files;
}

function parseScalarFromYaml(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) return null;
  return match[1].replace(/^["']|["']$/g, '').trim();
}

function strategySectionPresent(text, section) {
  if (section === 'notes') return /^(?:notes|  notes):/m.test(text);
  return new RegExp(`^  ${section}:`, 'm').test(text);
}

function inspectStrategyFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  const exists = fs.existsSync(absolutePath);
  if (!exists) {
    return {
      path: filePath,
      exists: false,
      ok: false,
      issues: ['missing_file'],
    };
  }

  const text = fs.readFileSync(absolutePath, 'utf8');
  const requiredTop = ['name', 'kind', 'status', 'enabled', 'model'];
  const requiredSections = ['hypothesis', 'universe', 'signals', 'data', 'risk', 'promotion', 'notes'];
  const issues = [];
  for (const key of requiredTop) {
    if (!new RegExp(`^${key}:`, 'm').test(text)) issues.push(`missing_${key}`);
  }
  for (const section of requiredSections) {
    if (!strategySectionPresent(text, section)) issues.push(`missing_section_${section}`);
  }

  return {
    path: filePath,
    exists: true,
    ok: issues.length === 0,
    name: parseScalarFromYaml(text, 'name'),
    kind: parseScalarFromYaml(text, 'kind'),
    status: parseScalarFromYaml(text, 'status'),
    enabled: parseScalarFromYaml(text, 'enabled') === 'true',
    model: parseScalarFromYaml(text, 'model'),
    issues,
  };
}

function strategyRegistryReport() {
  const files = readStrategyRegistry();
  const strategies = files.map(inspectStrategyFile);
  return {
    count: strategies.length,
    ok: strategies.every((strategy) => strategy.ok),
    strategies,
  };
}

function writeStrategyRegistry(files) {
  const registryPath = path.join(REPO_ROOT, 'config', 'strategies.yaml');
  const text = fs.readFileSync(registryPath, 'utf8');
  const base = text.replace(/\nregistry:\n(?:  .*\n?)*/m, '\n');
  const uniqueFiles = [...new Set(files)].sort();
  const registryBlock = [
    'registry:',
    '  files:',
    ...uniqueFiles.map((file) => `    - "${file}"`),
    '',
  ].join('\n');
  fs.writeFileSync(registryPath, `${base.trimEnd()}\n\n${registryBlock}`, 'utf8');
}

function locateBackendBinary() {
  const fs = require('node:fs');
  return BACKEND_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

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
    cwd: REPO_ROOT,
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
      const fs = require('node:fs');
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
      usable_records: usableSources.length,
      rejected_records: report.rejected_records,
      stale_records: report.freshness.stale_records,
      provider_errors: report.provider_errors.length,
      issues: report.issues.slice(0, 8),
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

function formatHumanNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (Number.isInteger(value)) return value;
  
  // High-precision formatting for crypto/FX pairs
  const absVal = Math.abs(value);
  if (absVal < 0.001 && absVal > 0) {
    return Number(value.toFixed(8));
  }
  if (absVal < 1) {
    return Number(value.toFixed(5));
  }
  return Number(value.toFixed(3));
}

function formatHumanPayload(payload) {
  if (Array.isArray(payload)) return payload.map(formatHumanPayload);
  if (payload && typeof payload === 'object') {
    return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, formatHumanPayload(value)]));
  }
  return formatHumanNumber(payload);
}

function renderHumanValue(value) {
  if (value && typeof value === 'object') {
    return '\n' + JSON.stringify(formatHumanPayload(value), null, 2)
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
  }
  return formatHumanNumber(value);
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { error: error.message, file_path: filePath };
  }
}

function labelState(ok, warn = false) {
  if (ok === false) return 'error';
  if (warn) return 'warn';
  return 'ok';
}

function summarizeModelCard(report) {
  const winner = report && report.winner ? report.winner : null;
  const top = winner || (report && Array.isArray(report.models) && report.models[0]) || null;
  return {
    source: DEFAULT_MODEL_REPORT,
    last_checked: report && report.generated_at ? report.generated_at : null,
    state: top ? labelState(true, Boolean((top.oos_expected_value != null && top.oos_expected_value < 0) || (top.expected_value != null && top.expected_value < 0))) : 'warn',
    title: top ? top.name || top.model || 'model_candidate' : 'no_model_report',
    subtitle: top ? top.description || `trades=${top.trades || 0}` : 'model comparison cache missing',
    metrics: top ? {
      expected_value: top.expected_value ?? top.oos_expected_value ?? null,
      net_return: top.net_return ?? null,
      oos_expected_value: top.oos_expected_value ?? null,
      sharpe_like: top.sharpe_like ?? null,
    } : {},
    payload: report,
  };
}

function summarizeBacktestCard(report) {
  return {
    source: DEFAULT_BACKTEST,
    last_checked: report && report.generated_at ? report.generated_at : null,
    state: report ? labelState(true, Boolean(report.metrics && report.metrics.expected_value < 0)) : 'warn',
    title: report ? `${report.model || 'model'} / ${report.timeframe || 'all'}` : 'no_backtest_report',
    subtitle: report ? `trades=${report.metrics ? report.metrics.trades : 0}` : 'backtest cache missing',
    metrics: report ? {
      net_return: report.metrics ? report.metrics.net_return : null,
      max_drawdown: report.metrics ? report.metrics.max_drawdown : null,
      win_rate: report.metrics ? report.metrics.win_rate : null,
      expected_value: report.metrics ? report.metrics.expected_value : null,
      oos_expected_value: report.oos_expected_value ?? null,
    } : {},
    payload: report,
  };
}

function summarizeStatusCard(snapshot, quality) {
  const report = quality || {};
  const ok = Boolean(report.ok);
  const state = ok ? 'ok' : 'warn';
  const freshness = report.freshness || {};
  return {
    source: DEFAULT_SNAPSHOT,
    last_checked: snapshot && snapshot.fetched_at ? snapshot.fetched_at : null,
    state,
    title: snapshot && snapshot.mode ? snapshot.mode : 'unknown',
    subtitle: ok ? 'data cache healthy' : 'data cache needs attention',
    metrics: {
      usable_records: report.usable_records ?? 0,
      rejected_records: report.rejected_records ?? 0,
      stale_records: freshness.stale_records ?? 0,
      provider_errors: (report.provider_errors || []).length || 0,
    },
    payload: { snapshot, report },
  };
}

function summarizeFeaturesCard(features) {
  const featureFrame = features || {};
  const count = featureFrame.feature_count ?? (Array.isArray(featureFrame.features) ? featureFrame.features.length : 0);
  return {
    source: DEFAULT_FEATURES,
    last_checked: featureFrame.generated_at || null,
    state: count > 0 ? 'ok' : 'warn',
    title: `${count} feature rows`,
    subtitle: featureFrame.timeframe ? `timeframe=${featureFrame.timeframe}` : 'feature cache',
    metrics: {
      feature_count: count,
      symbols: Array.isArray(featureFrame.symbols) ? featureFrame.symbols.length : null,
    },
    payload: featureFrame,
  };
}

function summarizePortfolioCard(portfolio) {
  const equity = portfolio && Number.isFinite(Number(portfolio.equity)) ? Number(portfolio.equity) : null;
  const exposure = portfolio && Number.isFinite(Number(portfolio.exposure)) ? Number(portfolio.exposure) : null;
  return {
    source: path.join(REPO_ROOT, 'data', 'portfolio.json'),
    last_checked: portfolio && portfolio.generated_at ? portfolio.generated_at : null,
    state: equity != null ? 'ok' : 'warn',
    title: equity != null ? `equity ${equity}` : 'portfolio unavailable',
    subtitle: exposure != null ? `exposure=${exposure}` : 'no portfolio metrics',
    metrics: {
      equity,
      exposure,
      drawdown: portfolio ? portfolio.drawdown ?? null : null,
      readiness: portfolio ? portfolio.readiness ?? null : null,
    },
    payload: portfolio,
  };
}

function buildCockpitModel() {
  const snapshot = safeReadJson(DEFAULT_SNAPSHOT);
  const quality = safeReadJson(DEFAULT_QUALITY_REPORT);
  const features = safeReadJson(DEFAULT_FEATURES);
  const modelReport = safeReadJson(DEFAULT_MODEL_REPORT);
  const backtestReport = safeReadJson(DEFAULT_BACKTEST);
  const portfolio = safeReadJson(path.join(REPO_ROOT, 'data', 'portfolio.json'));
  const statusCard = summarizeStatusCard(snapshot, quality);
  const modelCard = summarizeModelCard(modelReport);
  const backtestCard = summarizeBacktestCard(backtestReport);
  const featuresCard = summarizeFeaturesCard(features);
  const portfolioCard = summarizePortfolioCard(portfolio);
  const cards = [
    statusCard,
    featuresCard,
    modelCard,
    backtestCard,
    portfolioCard,
  ];
  return {
    generated_at: new Date().toISOString(),
    time: new Date().toLocaleTimeString(),
    title: 'Sovereign CLI Cockpit',
    status: {
      backend: backendAvailability().available ? 'available' : 'unavailable',
      cache: statusCard.state,
      quote_provider: (quality && quality.provider_errors && quality.provider_errors.length > 0) ? 'warn' : 'ok',
    },
    cards,
  };
}

async function quoteProviderHeaderState() {
  try {
    const config = await loadConfig();
    const imported = await loadExternalQuoteInputs(config);
    const report = validateSnapshot({
      mode: 'live',
      fetched_at: new Date().toISOString(),
      sources: imported.records,
      errors: imported.errors,
    }, { rejectStale: true }).report;
    return imported.errors.length === 0 && report.ok ? 'ok' : 'warn';
  } catch {
    return 'warn';
  }
}

function renderCockpit(model) {
  const lines = [];
  const header = `\x1b[1;36m${model.title}\x1b[0m \x1b[90m| ${model.time}\x1b[0m`;
  lines.push(header);
  lines.push('\x1b[90m' + '═'.repeat(80) + '\x1b[0m');
  
  const statusColor = (s) => s === 'ok' || s === 'available' ? '\x1b[32m' : (s === 'warn' ? '\x1b[33m' : '\x1b[31m');
  const backendStatus = `${statusColor(model.status.backend)}${model.status.backend}\x1b[0m`;
  const cacheStatus = `${statusColor(model.status.cache)}${model.status.cache}\x1b[0m`;
  const quoteStatus = `${statusColor(model.status.quote_provider)}${model.status.quote_provider}\x1b[0m`;

  lines.push(`  \x1b[1mSystem:\x1b[0m backend=${backendStatus}  cache=${cacheStatus}  quotes=${quoteStatus}`);
  lines.push('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');

  for (const card of model.cards) {
    const cardColor = statusColor(card.state);
    lines.push(`  ${cardColor}■\x1b[0m \x1b[1m${card.title.toUpperCase()}\x1b[0m \x1b[90m(${card.subtitle})\x1b[0m`);
    
    const metrics = Object.entries(card.metrics || {}).filter(([, value]) => value != null);
    if (metrics.length) {
      const metricLine = metrics.map(([key, value]) => `\x1b[90m${key}=\x1b[0m\x1b[37m${String(renderHumanValue(value)).trim()}\x1b[0m`).join('  ');
      lines.push(`    ${metricLine}`);
    }
    lines.push('');
  }
  
  lines.push('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
  lines.push('  \x1b[1mCommands:\x1b[0m status | backend status | quotes status | models | bt | \x1b[36mtrade balance\x1b[0m');
  lines.push('  \x1b[90mTip: use --inspect <status|features|model|backtest|portfolio> for raw JSON.\x1b[0m');
  return lines.join('\n');
}

function cockpitInspectPayload(name) {
  const model = buildCockpitModel();
  const lookup = {
    status: model.cards[0],
    features: model.cards[1],
    model: model.cards[2],
    backtest: model.cards[3],
    portfolio: model.cards[4],
  };
  return lookup[name] || null;
}

function renderCockpit(model) {
  const resolvedPhase = model.phase || currentPhaseLabel();
  const lines = [];
  const header = `\x1b[1;36m${model.title}\x1b[0m \x1b[90m| ${model.time}\x1b[0m`;
  lines.push(header);
  lines.push('\x1b[90m' + '='.repeat(80) + '\x1b[0m');
  lines.push(`  \x1b[1mPhase:\x1b[0m ${resolvedPhase}`);

  const statusColor = (s) => s === 'ok' || s === 'available' ? '\x1b[32m' : (s === 'warn' ? '\x1b[33m' : '\x1b[31m');
  const backendStatus = `${statusColor(model.status.backend)}${model.status.backend}\x1b[0m`;
  const cacheStatus = `${statusColor(model.status.cache)}${model.status.cache}\x1b[0m`;
  const quoteStatus = `${statusColor(model.status.quote_provider)}${model.status.quote_provider}\x1b[0m`;

  lines.push(`  \x1b[1mSystem:\x1b[0m backend=${backendStatus}  cache=${cacheStatus}  quotes=${quoteStatus}`);
  lines.push('\x1b[90m' + '-'.repeat(80) + '\x1b[0m');

  for (const card of model.cards) {
    const cardColor = statusColor(card.state);
    lines.push(`  ${cardColor}*\x1b[0m \x1b[1m${card.title.toUpperCase()}\x1b[0m \x1b[90m(${card.subtitle})\x1b[0m`);

    const metrics = Object.entries(card.metrics || {}).filter(([, value]) => value != null);
    if (metrics.length) {
      const metricLine = metrics.map(([key, value]) => `\x1b[90m${key}=\x1b[0m\x1b[37m${String(renderHumanValue(value)).trim()}\x1b[0m`).join('  ');
      lines.push(`    ${metricLine}`);
    }
    lines.push('');
  }

  lines.push('\x1b[90m' + '-'.repeat(80) + '\x1b[0m');
  lines.push('  \x1b[1mCommands:\x1b[0m status | backend status | quotes status | models | bt | \x1b[36mtrade balance\x1b[0m');
  lines.push('  \x1b[90mTip: use --inspect <status|features|model|backtest|portfolio> for raw JSON.\x1b[0m');
  return lines.join('\n');
}

function backendAvailability() {
  for (const candidate of BACKEND_CANDIDATES) {
    if (fs.existsSync(candidate)) return { available: true, path: candidate };
  }
  return { available: false, path: null };
}

function numericOption(args, name, fallback) {
  const raw = optionValue(args, name, null);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function periodOptionsFromArgs(args) {
  return {
    returnFast: numericOption(args, '--return-fast', DEFAULT_PERIODS.returnFast),
    returnSlow: numericOption(args, '--return-slow', DEFAULT_PERIODS.returnSlow),
    volatility: numericOption(args, '--volatility', DEFAULT_PERIODS.volatility),
    rsi: numericOption(args, '--rsi', DEFAULT_PERIODS.rsi),
    atr: numericOption(args, '--atr', DEFAULT_PERIODS.atr),
    bollinger: numericOption(args, '--bollinger', DEFAULT_PERIODS.bollinger),
  };
}

function historicalWindowFromArgs(args, fallbackDays = 365) {
  const days = Math.max(1, Math.floor(numericOption(args, '--days', fallbackDays)));
  const endTs = Math.floor(Date.now() / 1000);
  return {
    days,
    endTs,
    startTs: endTs - days * 24 * 60 * 60,
  };
}

function filterCandlesByWindow(candles, window) {
  const startMs = window.startTs * 1000;
  const endMs = window.endTs * 1000;
  return candles.filter((candle) => {
    const timestamp = Number(candle.openTime);
    return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs;
  });
}

function cryptoLimitForWindow(timeframe, days, provider) {
  const barsPerDay = {
    '5m': 288,
    '15m': 96,
    '30m': 48,
    '1h': 24,
    '4h': 6,
    '1d': 1,
  }[timeframe] || 1;
  const requested = Math.max(1, Math.ceil(days * barsPerDay));
  const maxLimit = provider === 'coinbase' ? 300 : 1000;
  return Math.min(requested, maxLimit);
}

function loadUsableSources(args) {
  const timeframe = optionValue(args, '--timeframe', '1d');
  const sampleSize = Math.max(30, Math.floor(numericOption(args, '--sample-size', 120)));
  if (hasFlag(args, '--sample')) {
    return {
      snapshot: {
        mode: 'sample',
        fetched_at: new Date().toISOString(),
        sources: generateSampleBars('SPY', sampleSize, timeframe).concat(generateSampleBars('BTCUSDT', sampleSize, timeframe)),
        errors: [],
      },
      quality: null,
    };
  }

  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const snapshot = readSnapshot(input);
  const { report, usableSources } = validateSnapshot(snapshot);
  return { snapshot: { ...snapshot, sources: usableSources }, quality: report };
}

function candlesToSources(candles, family, provider, symbol, timeframe) {
  return candles.map((candle) => ({
    family,
    provider,
    symbol,
    timeframe,
    timestamp: new Date(candle.openTime).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    source: `${provider}-${timeframe}-history`,
  }));
}
function recordBackfillSummary(summaries, candles, family, provider, symbol, timeframe) {
  const meta = candles && candles.backfillMeta;
  if (!meta) return;
  summaries.push({
    family,
    symbol,
    provider: meta.provider || provider,
    timeframe,
    requested_window: meta.requested_window,
    actual_window: meta.actual_window,
    max_bars: meta.provider_max_bars,
    fetched_bars: meta.fetched_bars ?? candles.length,
    workers: meta.workers || null,
    chunks: Array.isArray(meta.chunks) ? meta.chunks.length : null,
    worker_windows: Array.isArray(meta.worker_windows)
      ? meta.worker_windows.map((worker) => ({
        worker: worker.worker,
        requested_window: worker.requested_window,
        actual_window: worker.actual_window,
        max_bars: worker.provider_max_bars,
        fetched_bars: worker.fetched_bars,
        chunks: Array.isArray(worker.chunks) ? worker.chunks.length : null,
      }))
      : null,
  });
}
async function loadHistoricalSources(args) {
  const timeframe = optionValue(args, '--timeframe', '1d');
  const window = historicalWindowFromArgs(args);
  const config = await loadConfig();
  const sources = [];
  const backfillWindows = [];
  const chosenTimeframe = ['5m', '15m', '30m', '1h', '4h', '1d'].includes(timeframe) ? timeframe : '1d';
  const symbolsByFamily = {
    equities: (config.equities.symbols || []).slice(0, 2),
    indices: (config.indices.symbols || []).slice(0, 2),
    commodities: (config.commodities.symbols || []).slice(0, 2),
    crypto: (config.crypto.symbols || []).slice(0, 2),
  };
//line 950-1104 can be optimize, 
  //line 950-1104 can be optimize, 
  for (const symbol of symbolsByFamily.equities) {
    const providers = (config.equities.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 2) {
      const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'equities', providers);
      recordBackfillSummary(backfillWindows, candles, 'equities', providers[0], symbol, chosenTimeframe);
      sources.push(...candlesToSources(candles, 'equities', providers[0], symbol, chosenTimeframe));
    } else {
      let resolved = false;
      for (const provider of providers) {
        try {
          if (provider === 'stooq') {
            if (chosenTimeframe !== '1d') continue;
            const mapped = resolveStooqSymbol('equities', symbol);
            if (!mapped) continue;
            const candles = filterCandlesByWindow(await fetchStooqDailyHistory(mapped), window);
            sources.push(...candlesToSources(candles, 'equities', provider, symbol, '1d'));
            resolved = true;
            break;
          }
          if (provider === 'yahoo') {
            const mapped = resolveEquityOrIndexSymbol('equities', symbol, provider) || symbol;
            let candles;
            if (chosenTimeframe !== '1d' && window.days > 5) {
              candles = await fetchPaginated(mapped, chosenTimeframe, window.days, 'equities', fetchYahooBaseCandles);
            } else {
              candles = await fetchYahooBaseCandles(mapped, chosenTimeframe, window.days);
            }
            recordBackfillSummary(backfillWindows, candles, 'equities', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'equities', provider, symbol, chosenTimeframe));
            resolved = true;
            break;
          }
        } catch { continue; }
      }
    }
  }

  for (const symbol of symbolsByFamily.indices) {
    const providers = (config.indices.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 2) {
       const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'equities', providers);
       recordBackfillSummary(backfillWindows, candles, 'indices', providers[0], symbol, chosenTimeframe);
       sources.push(...candlesToSources(candles, 'indices', providers[0], symbol, chosenTimeframe));
    } else {
      let resolved = false;
      for (const provider of providers) {
        try {
          if (provider === 'stooq') {
            if (chosenTimeframe !== '1d') continue;
            const mapped = resolveStooqSymbol('indices', symbol);
            if (!mapped) continue;
            const candles = filterCandlesByWindow(await fetchStooqDailyHistory(mapped), window);
            sources.push(...candlesToSources(candles, 'indices', provider, symbol, '1d'));
            resolved = true;
            break;
          }
          if (provider === 'yahoo') {
            const mapped = resolveEquityOrIndexSymbol('indices', symbol, provider) || symbol;
            let candles;
            if (chosenTimeframe !== '1d' && window.days > 5) {
              candles = await fetchPaginated(mapped, chosenTimeframe, window.days, 'equities', fetchYahooBaseCandles);
            } else {
              candles = await fetchYahooBaseCandles(mapped, chosenTimeframe, window.days);
            }
            recordBackfillSummary(backfillWindows, candles, 'indices', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'indices', provider, symbol, chosenTimeframe));
            resolved = true;
            break;
          }
          if (provider === 'fred') {
            const seriesId = resolveFredSeries('indices', symbol);
            if (!seriesId) continue;
            sources.push({
              ...(await fetchFredLatest(seriesId)),
              family: 'indices',
              symbol,
            });
            resolved = true;
            break;
          }
        } catch { continue; }
      }
    }
  }

  for (const symbol of symbolsByFamily.commodities) {
    const providers = (config.commodities.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 2) {
       const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'equities', providers);
       recordBackfillSummary(backfillWindows, candles, 'commodities', providers[0], symbol, chosenTimeframe);
       sources.push(...candlesToSources(candles, 'commodities', providers[0], symbol, chosenTimeframe));
    } else {
      let resolved = false;
      for (const provider of providers) {
        try {
          if (provider === 'stooq') {
            if (chosenTimeframe !== '1d') continue;
            const mapped = resolveStooqSymbol('commodities', symbol);
            if (!mapped) continue;
            const candles = filterCandlesByWindow(await fetchStooqDailyHistory(mapped), window);
            sources.push(...candlesToSources(candles, 'commodities', provider, symbol, '1d'));
            resolved = true;
            break;
          }
          if (provider === 'yahoo') {
            const mapped = resolveCommoditySymbol(provider, symbol) || symbol;
            let candles;
            if (chosenTimeframe !== '1d' && window.days > 5) {
              candles = await fetchPaginated(mapped, chosenTimeframe, window.days, 'equities', fetchYahooBaseCandles);
            } else {
              candles = await fetchYahooBaseCandles(mapped, chosenTimeframe, window.days);
            }
            recordBackfillSummary(backfillWindows, candles, 'commodities', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'commodities', provider, symbol, chosenTimeframe));
            resolved = true;
            break;
          }
        } catch { continue; }
      }
    }
  }

  for (const symbol of symbolsByFamily.crypto) {
    const providers = (config.crypto.providers || []).filter(provider => typeof provider === 'string' && provider.trim().length > 0);
    if (providers.length > 1 && chosenTimeframe !== '1d' && window.days > 1) {
      const candles = await fetchParallelBackfill(symbol, chosenTimeframe, window.days, 'crypto', providers);
      recordBackfillSummary(backfillWindows, candles, 'crypto', providers[0], symbol, chosenTimeframe);
      sources.push(...candlesToSources(candles, 'crypto', providers[0], symbol, chosenTimeframe));
    } else {
      for (const provider of providers.slice(0, 2)) {
        let candles = null;
        try {
          if (provider === 'binance') {
            if (window.days > 3 || (chosenTimeframe !== '1d' && window.days > 1)) {
               candles = await fetchPaginated(symbol, chosenTimeframe, window.days, 'crypto', fetchBinanceBaseCandles);
            } else {
               candles = await fetchBinanceBaseCandles(symbol, cryptoLimitForWindow(chosenTimeframe, window.days, provider), chosenTimeframe);
            }
          } else if (provider === 'coinbase') {
            candles = await fetchCoinbaseBaseCandles(symbol, cryptoLimitForWindow(chosenTimeframe, window.days, provider), chosenTimeframe);
          }
          if (candles && candles.length > 0) {
            recordBackfillSummary(backfillWindows, candles, 'crypto', provider, symbol, chosenTimeframe);
            sources.push(...candlesToSources(candles, 'crypto', provider, symbol, chosenTimeframe));
          }
        } catch { continue; }
      }
    }
  }

  return {
    snapshot: {
      mode: 'provider_history',
      fetched_at: new Date().toISOString(),
      sources,
      errors: [],
      backfill_windows: backfillWindows,
    },
    quality: null,
  };
}

async function loadPredictionMarketHistory(args) {
  const config = await loadConfig();
  const provider = optionValue(args, '--prediction-provider', 'all');
  const marketLimit = Math.max(1, Math.floor(numericOption(args, '--prediction-market-limit', 3)));
  const periodInterval = Math.floor(numericOption(args, '--prediction-period-minutes', 1440));
  const { startTs, endTs } = historicalWindowFromArgs(args);
  const sources = [];
  const errors = [];

  for (const eventName of config.prediction_market.events || []) {
    if (provider === 'all' || provider === 'kalshi') {
      try {
        const { records } = await fetchKalshiHistoricalMarkets(eventName, { limit: 1000 });
        sources.push(...records);
        for (const market of records.slice(0, marketLimit)) {
          if (!market.market_ticker) continue;
          sources.push(...await fetchKalshiHistoricalCandlesticks(market.market_ticker, { startTs, endTs, periodInterval }));
        }
      } catch (error) {
        errors.push({ family: 'prediction_market', provider: 'kalshi', symbol: eventName, message: error.message });
      }
    }

    if (provider === 'all' || provider === 'polymarket') {
      try {
        sources.push(...await fetchPolymarketHistoricalPrices(eventName, {
          marketLimit,
          startTs,
          endTs,
          interval: periodInterval >= 1440 ? '1d' : 'max',
          fidelity: periodInterval >= 1440 ? 1440 : Math.max(1, periodInterval),
        }));
      } catch (error) {
        errors.push({ family: 'prediction_market', provider: 'polymarket', symbol: eventName, message: error.message });
      }
    }

    try {
      sources.push(await fetchPredictionInterestSignal(eventName));
    } catch (error) {
      errors.push({ family: 'sentiment', provider: 'google_custom_search', symbol: eventName, message: error.message });
    }
  }

  return { sources, errors };
}

function dateFilterOptionsFromArgs(args) {
  return {
    timeframe: optionValue(args, '--timeframe', null),
    from: optionValue(args, '--from', null),
    to: optionValue(args, '--to', null),
  };
}

async function commandIngest(args) {
  const snapshot = await ingestMarketData();
  if (hasFlag(args, '--full')) {
    console.log(JSON.stringify(snapshot, null, 2));
    return 0;
  }
  printPayload({
    mode: snapshot.mode,
    fetched_at: snapshot.fetched_at,
    sources: snapshot.sources.length,
    errors: snapshot.errors.length,
    provider_checks: snapshot.provider_checks.length,
  }, args);
  return snapshot.errors.length === 0 ? 0 : 1;
}

async function commandBackfill(args) {
  const output = optionValue(args, '--output', DEFAULT_HISTORY);
  const relevanceFloor = numericOption(args, '--relevance-floor', 0);
  let marketHistory = null;
  try {
    marketHistory = await loadHistoricalSources(args);
  } catch (error) {
    console.error(`[BACKFILL] Critical Failure: ${error.stack || error.message}`);
    marketHistory = {
      snapshot: {
        mode: 'provider_history',
        fetched_at: new Date().toISOString(),
        sources: [],
        errors: [{ family: 'market_history', provider: 'mixed', symbol: 'configured_universe', message: error.message }],
      },
      quality: null,
    };
  }
  const predictionHistory = hasFlag(args, '--include-prediction')
    ? await loadPredictionMarketHistory(args)
    : { sources: [], errors: [] };
  const snapshot = {
    mode: 'backtest_history',
    fetched_at: new Date().toISOString(),
    sources: [...marketHistory.snapshot.sources, ...predictionHistory.sources],
    errors: [...(marketHistory.snapshot.errors || []), ...predictionHistory.errors],
    backfill_windows: [...(marketHistory.snapshot.backfill_windows || [])],
  };
  const { report } = validateSnapshot(snapshot, { rejectStale: false });
  const byKeyScore = new Map(report.reliability.samples.map((sample) => [sample.key, sample.score]));
  const filteredSources = relevanceFloor > 0
    ? snapshot.sources.filter((record, index) => {
      const key = `${record.family || 'unknown'}:${record.provider || 'unknown'}:${record.symbol || record.underlying || record.series || record.location || record.region || record.country || record.chain || record.metric || 'unknown'}:${record.timeframe || record.component || record.metric || record.option_type || 'point'}:${record.timestamp || `index_${index}`}`;
      const score = byKeyScore.get(key);
      return Number.isFinite(score) ? score >= relevanceFloor : true;
    })
    : snapshot.sources;
  const filteredSnapshot = { ...snapshot, sources: filteredSources };
  const filteredReport = validateSnapshot(filteredSnapshot, { rejectStale: false }).report;

  const existing = readSnapshot(output);
  const preservedSnapshot = mergeSnapshots(existing, filteredSnapshot);

  writeJson(output, preservedSnapshot);
  writeJson(DEFAULT_QUALITY_REPORT, filteredReport);
  printPayload({
    mode: filteredSnapshot.mode,
    records: filteredSnapshot.sources.length,
    errors: filteredSnapshot.errors.length,
    stale_records: filteredReport.freshness.stale_records,
    reliability_samples: filteredReport.reliability.samples.length,
    relevance_floor: relevanceFloor,
    backfill_windows: filteredSnapshot.backfill_windows || [],
    output,
    quality_report: DEFAULT_QUALITY_REPORT,
  }, args);
  return filteredSnapshot.errors.length === 0 ? 0 : 1;
}

function commandValidate(args) {
  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const output = optionValue(args, '--output', DEFAULT_QUALITY_REPORT);
  const snapshot = readSnapshot(input);
  const { report } = validateSnapshot(snapshot);
  writeJson(output, report);
  printPayload({
    ok: report.ok,
    total_records: report.total_records,
    usable_records: report.usable_records,
    rejected_records: report.rejected_records,
    errors: report.counts.error,
    warnings: report.counts.warning,
    stale_records: report.freshness.stale_records,
    freshness_issues: report.freshness.issues,
    provider_errors: report.provider_errors.length,
    output,
  }, args);
  return hasFlag(args, '--strict') && !report.ok ? 1 : 0;
}

function backtestDataQualityError(quality, args) {
  if (!quality || quality.ok || hasFlag(args, '--allow-degraded')) return null;
  return [
    'Backtest input failed data-quality validation.',
    `errors=${quality.counts.error}`,
    `provider_errors=${quality.provider_errors.length}`,
    `stale_records=${quality.freshness.stale_records}`,
    'Run `check --strict`, refresh with `ingest`/`backfill`, or pass `--sample` for deterministic validation.',
  ].join(' ');
}

function rejectDegradedResearchInput(quality, args, label) {
  const message = backtestDataQualityError(quality, args);
  if (!message) return false;
  const error = `${label} input failed data-quality validation. ${message.replace(/^Backtest input failed data-quality validation\.\s*/, '')}`;
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ error }, null, 2));
  } else {
    console.error(error);
  }
  return true;
}

function commandIndicators(args) {
  const output = optionValue(args, '--output', DEFAULT_FEATURES);
  const { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (rejectDegradedResearchInput(quality, args, 'Feature generation')) return 1;
  const periods = periodOptionsFromArgs(args);
  const features = hasFlag(args, '--sample')
    ? calculateRollingFeatureFrame(snapshot.sources, 2, periods)
    : calculateFeatureFrame(snapshot.sources, periods);
  const payload = {
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_report: quality ? DEFAULT_QUALITY_REPORT : null,
    ...features,
  };
  writeJson(output, payload);
  printPayload({
    feature_count: payload.feature_count,
    skipped: payload.skipped.length,
    periods: payload.indicator_periods,
    output,
  }, args);
  return 0;
}

function commandModelCompare(args) {
  const output = optionValue(args, '--output', DEFAULT_MODEL_REPORT);
  const { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (rejectDegradedResearchInput(quality, args, 'Model comparison')) return 1;
  const featureFrame = filterFeatureFrame(calculateRollingFeatureFrame(snapshot.sources, 2, periodOptionsFromArgs(args)), dateFilterOptionsFromArgs(args));
  const report = {
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_report: quality ? DEFAULT_QUALITY_REPORT : null,
    ...compareModels(featureFrame, {
      horizon: numericOption(args, '--horizon', 5),
      threshold: numericOption(args, '--threshold', 0.55),
    }),
  };
  writeJson(output, report);
  printPayload({
    winner: report.winner,
    models: report.models.length,
    families: report.families,
    per_symbol_winners: report.per_symbol_winners,
    feature_count: report.feature_count,
    output,
  }, args);
  return 0;
}

async function commandBacktest(args) {
  const output = optionValue(args, '--output', DEFAULT_BACKTEST);
  const model = optionValue(args, '--model', 'cnn_window_v0');
  const timeframe = optionValue(args, '--timeframe', null);
  const from = optionValue(args, '--from', null);
  const to = optionValue(args, '--to', null);
  const horizon = numericOption(args, '--horizon', 5);
  const threshold = numericOption(args, '--threshold', 0.55);
  const costBps = numericOption(args, '--cost-bps', 5);
  const feeBps = numericOption(args, '--fee-bps', costBps / 2);
  const slippageBps = numericOption(args, '--slippage-bps', costBps / 2);
  const trainRatio = numericOption(args, '--train-ratio', 0.7);
  const tailAlpha = numericOption(args, '--tail-alpha', 0.05);
  const monteCarloRuns = numericOption(args, '--monte-carlo-runs', 1000);
  let { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  const initialQualityError = backtestDataQualityError(quality, args);
  if (initialQualityError) {
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: initialQualityError }, null, 2));
    } else {
      console.error(initialQualityError);
    }
    return 1;
  }
  let featureFrame = calculateRollingFeatureFrame(snapshot.sources, 2, periodOptionsFromArgs(args));
  if (!hasFlag(args, '--sample') && featureFrame.feature_count === 0) {
    try {
      const historical = await loadHistoricalSources(args);
      snapshot = historical.snapshot;
      quality = historical.quality;
      featureFrame = calculateRollingFeatureFrame(snapshot.sources, 2, periodOptionsFromArgs(args));
    } catch (error) {
      const message = `Unable to fetch provider history: ${error.message}. Use --sample for deterministic validation or refresh the live cache with network access.`;
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(message);
      }
      return 1;
    }
  }
  const qualityError = backtestDataQualityError(quality, args);
  if (qualityError) {
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: qualityError }, null, 2));
    } else {
      console.error(qualityError);
    }
    return 1;
  }
  const filteredFrame = filterFeatureFrame(featureFrame, { timeframe, from, to });
  const split = splitFeatureFrame(filteredFrame, trainRatio);
  const backtestOptions = {
    strategy: 'cnn_momentum',
    model,
    horizon,
    threshold,
    costBps,
    feeBps,
    slippageBps,
    tailAlpha,
    monteCarloRuns,
  };
  const inSample = runBacktest(split.train, backtestOptions);
  const outOfSample = runBacktest(split.test, backtestOptions);
  const report = {
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_report: quality ? DEFAULT_QUALITY_REPORT : null,
    train_ratio: trainRatio,
    in_sample: inSample.metrics,
    out_of_sample: outOfSample.metrics,
    ...runBacktest(featureFrame, { ...backtestOptions, timeframe, from, to }),
  };
  writeJson(output, report);
  const tailRisk = report.metrics.tail_risk || {};
  const monteCarlo = report.metrics.monte_carlo || {};
  printPayload({
    strategy: report.strategy,
    model: report.model,
    timeframe: report.timeframe,
    period: report.period,
    trade_logs: report.trades.length,
    trades: report.metrics.trades,
    fee_bps: report.fee_bps,
    slippage_bps: report.slippage_bps,
    net_return: report.metrics.net_return,
    max_drawdown: report.metrics.max_drawdown,
    sharpe_ratio: report.metrics.sharpe_ratio,
    sortino_ratio: report.metrics.sortino_ratio,
    win_rate: report.metrics.win_rate,
    expected_value: report.metrics.expected_value,
    tail_var_95: tailRisk.value_at_risk,
    tail_es_95: tailRisk.expected_shortfall,
    mc_p05_return: monteCarlo.p05_final_return,
    mc_loss_prob: monteCarlo.probability_of_loss,
    oos_trades: outOfSample.metrics.trades,
    oos_expected_value: outOfSample.metrics.expected_value,
    oos_net_return: outOfSample.metrics.net_return,
    output,
  }, args);
  return 0;
}

function commandStatus(args) {
  const snapshot = readSnapshot(DEFAULT_SNAPSHOT);
  const { report } = validateSnapshot(snapshot);
  const backend = runBackendStatus(args);
  writeJson(DEFAULT_QUALITY_REPORT, report);
  printPayload({
    phase: currentPhaseLabel(),
    backend: backend.available ? 'available' : 'unavailable',
    backend_ok: Boolean(backend.ok),
    cache_mode: snapshot.mode || 'unknown',
    fetched_at: snapshot.fetched_at || 'unknown',
    records: report.total_records,
    usable_records: report.usable_records,
    rejected_records: report.rejected_records,
    stale_records: report.freshness.stale_records,
    provider_errors: report.provider_errors.length,
    quality: report.ok ? 'ok' : 'needs attention',
    next: 'run demo for sample indicators, model comparison, and backtest',
  }, args);
  return 0;
}

function quoteProviderEnvConfigured(provider) {
  const normalized = String(provider || '').trim().toUpperCase();
  return Boolean(process.env[`SOVEREIGN_${normalized}_QUOTES_PATH`] || process.env[`${normalized}_QUOTES_PATH`]);
}

function quoteProviderPathLabel(provider) {
  const normalized = String(provider || '').trim().toUpperCase();
  if (process.env[`SOVEREIGN_${normalized}_QUOTES_PATH`]) return `SOVEREIGN_${normalized}_QUOTES_PATH`;
  if (process.env[`${normalized}_QUOTES_PATH`]) return `${normalized}_QUOTES_PATH`;
  return null;
}

async function commandQuotes(args) {
  const subcommand = args[0] || 'status';
  if (subcommand !== 'status') {
    printPayload({ ok: false, error: `Unsupported quotes command: ${subcommand}` }, args);
    return 1;
  }

  const config = await loadConfig();
  const quoteConfig = config.quote_feeds || {};
  const configuredProviders = (quoteConfig.providers || ['headway_mt5', 'mt5', 'webull'])
    .filter((provider) => typeof provider === 'string' && provider.trim().length > 0)
    .map((provider) => String(provider).trim().toLowerCase())
    .filter(Boolean);
  const imported = await loadExternalQuoteInputs(config);
  const deduped = dedupePreferredMarketQuotes(imported.records);
  const quoteQuality = validateSnapshot({
    mode: 'live',
    fetched_at: new Date().toISOString(),
    sources: imported.records,
    errors: imported.errors,
  }, { rejectStale: true }).report;
  const providerFreshness = new Map();
  for (const issue of quoteQuality.issues) {
    const provider = String(issue.key || '').split(':')[1] || 'unknown';
    const summary = providerFreshness.get(provider) || { stale_records: 0, freshness_issues: 0 };
    if (issue.code === 'stale_record' && issue.severity === 'error') summary.stale_records += 1;
    if (issue.code === 'stale_record') summary.freshness_issues += 1;
    providerFreshness.set(provider, summary);
  }
  const providerChecks = new Map((imported.provider_checks || []).map((check) => [check.provider, check]));
  const providers = configuredProviders.map((provider) => {
    const check = providerChecks.get(provider);
    const records = imported.records.filter((record) => record.provider === provider).length;
    const freshness = providerFreshness.get(provider) || { stale_records: 0, freshness_issues: 0 };
    const status = check ? check.status : 'not_configured';
    return {
      provider,
      enabled: quoteConfig.enabled !== false,
      configured: quoteProviderEnvConfigured(provider),
      env: quoteProviderPathLabel(provider),
      priority: DEFAULT_PROVIDER_PRIORITY[provider] ?? DEFAULT_PROVIDER_PRIORITY.default,
      status: status === 'ok' && freshness.stale_records > 0 ? 'stale' : status,
      records,
      stale_records: freshness.stale_records,
      freshness_issues: freshness.freshness_issues,
      message: check && check.message ? check.message : null,
    };
  });
  const selectedSymbols = deduped.records
    .filter((record) => ['equities', 'indices', 'commodities', 'crypto', 'fx'].includes(record.family))
    .slice(0, 20)
    .map((record) => ({
      family: record.family,
      symbol: record.symbol,
      provider: record.provider,
      timeframe: record.timeframe || record.quote_type || 'point',
      timestamp: record.timestamp,
      close: record.close ?? record.last ?? null,
      bid: record.bid ?? null,
      ask: record.ask ?? null,
    }));
  const payload = {
    ok: imported.errors.length === 0 && quoteQuality.ok,
    type: 'quote_sources',
    schema_version: 1,
    enabled: quoteConfig.enabled !== false,
    providers,
    records: imported.records.length,
    stale_records: quoteQuality.freshness.stale_records,
    freshness_issues: quoteQuality.freshness.issues,
    selected_records: deduped.records.length,
    deduplication: {
      input_records: deduped.input_records,
      quote_records: deduped.quote_records,
      output_records: deduped.records.length,
      removed_records: deduped.removed_records,
      policy: 'provider_priority_then_quality',
    },
    symbols: selectedSymbols,
    errors: imported.errors,
  };
  printPayload(payload, args);
  return payload.ok ? 0 : 1;
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

function commandStrategy(args) {
  const subcommand = args[0];
  if (subcommand === 'list') {
    const report = strategyRegistryReport();
    printPayload(report, args);
    return report.ok ? 0 : 1;
  }
  if (subcommand === 'validate') {
    const report = strategyRegistryReport();
    printPayload(report, args);
    return report.ok ? 0 : 1;
  }
  if (subcommand !== 'new') {
    printPayload({ error: 'Usage: strategy new <name> [--kind ...] [--model ...] [--output path] | strategy list' }, args);
    return 1;
  }
  const name = args[1];
  if (!name) {
    printPayload({ error: 'strategy new requires a name' }, args);
    return 1;
  }
  const output = optionValue(args, '--output', path.join(REPO_ROOT, 'config', 'strategies', `${slugifyStrategyName(name)}.yaml`));
  const universe = (optionValue(args, '--universe', 'SPY,QQQ') || '').split(',').map((item) => item.trim()).filter(Boolean);
  const payload = buildStrategyPlan(name, {
    kind: optionValue(args, '--kind', 'momentum'),
    model: optionValue(args, '--model', 'cnn_v3'),
    universe,
    signalThreshold: numericOption(args, '--signal-threshold', 0.65),
    maxHoldingDays: numericOption(args, '--max-holding-days', 5),
    riskWeight: numericOption(args, '--risk-weight', 0.4),
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, payload, 'utf8');
  const registryFiles = readStrategyRegistry();
  registryFiles.push(path.relative(REPO_ROOT, output).replace(/\\/g, '/'));
  writeStrategyRegistry(registryFiles);
  printPayload({ created: output, strategy: slugifyStrategyName(name) }, args);
  return 0;
}

async function commandOptimize(args) {
  const output = optionValue(args, '--output', path.join(REPO_ROOT, 'data', 'models', 'latest_indicator_optimization.json'));
  let { snapshot, quality } = loadUsableSources(args);
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  if (rejectDegradedResearchInput(quality, args, 'Optimization')) return 1;
  const timeframe = optionValue(args, '--timeframe', null);
  const from = optionValue(args, '--from', null);
  const to = optionValue(args, '--to', null);
  const horizon = numericOption(args, '--horizon', 5);
  const threshold = numericOption(args, '--threshold', 0.55);
  const costBps = numericOption(args, '--cost-bps', 5);
  const feeBps = numericOption(args, '--fee-bps', costBps / 2);
  const slippageBps = numericOption(args, '--slippage-bps', costBps / 2);
  const tailAlpha = numericOption(args, '--tail-alpha', 0.05);
  const monteCarloRuns = numericOption(args, '--monte-carlo-runs', 1000);
  const trainRatio = numericOption(args, '--train-ratio', 0.7);
  const grid = [];
  for (const rsi of [7, 14, 21]) {
    for (const atr of [7, 14, 21]) {
      for (const bollinger of [10, 20, 30]) {
        for (const volatility of [10, 20, 60]) {
          grid.push({ rsi, atr, bollinger, volatility, returnFast: 1, returnSlow: 5 });
        }
      }
    }
  }

  let runs = grid.map((periods) => {
    const frame = calculateRollingFeatureFrame(snapshot.sources, 2, periods);
    const filtered = filterFeatureFrame(frame, { timeframe, from, to });
    const split = splitFeatureFrame(filtered, trainRatio);
    const backtestOptions = {
      strategy: 'cnn_momentum',
      model: 'cnn_window_v0',
      horizon,
      threshold,
      costBps,
      feeBps,
      slippageBps,
      tailAlpha,
      monteCarloRuns,
    };
    const trainBacktest = runBacktest(split.train, backtestOptions);
    const testBacktest = runBacktest(split.test, backtestOptions);
    return {
      periods,
      timeframe: timeframe || testBacktest.timeframe,
      period: { from, to },
      feature_count: filtered.feature_count,
      train: trainBacktest.metrics,
      test: testBacktest.metrics,
      trades: trainBacktest.metrics.trades,
      net_return: trainBacktest.metrics.net_return,
      max_drawdown: trainBacktest.metrics.max_drawdown,
      sharpe_ratio: trainBacktest.metrics.sharpe_ratio,
      sortino_ratio: trainBacktest.metrics.sortino_ratio,
      win_rate: trainBacktest.metrics.win_rate,
      expected_value: trainBacktest.metrics.expected_value,
      oos_trades: testBacktest.metrics.trades,
      oos_net_return: testBacktest.metrics.net_return,
      oos_expected_value: testBacktest.metrics.expected_value,
      score: trainBacktest.metrics.net_return - trainBacktest.metrics.max_drawdown + (trainBacktest.metrics.expected_value * 10),
    };
  }).sort((a, b) => b.score - a.score || b.net_return - a.net_return);

  if (!hasFlag(args, '--sample') && runs.length > 0 && runs[0].feature_count === 0) {
    try {
      const historical = await loadHistoricalSources(args);
      snapshot = historical.snapshot;
      quality = historical.quality;
      runs = grid.map((periods) => {
        const frame = calculateRollingFeatureFrame(snapshot.sources, 2, periods);
        const filtered = filterFeatureFrame(frame, { timeframe, from, to });
        const split = splitFeatureFrame(filtered, trainRatio);
        const backtestOptions = {
          strategy: 'cnn_momentum',
          model: 'cnn_window_v0',
          horizon,
          threshold,
          costBps,
          feeBps,
          slippageBps,
          tailAlpha,
          monteCarloRuns,
        };
        const trainBacktest = runBacktest(split.train, backtestOptions);
        const testBacktest = runBacktest(split.test, backtestOptions);
        return {
          periods,
          timeframe: timeframe || testBacktest.timeframe,
          period: { from, to },
          feature_count: filtered.feature_count,
          train: trainBacktest.metrics,
          test: testBacktest.metrics,
          trades: trainBacktest.metrics.trades,
          net_return: trainBacktest.metrics.net_return,
          max_drawdown: trainBacktest.metrics.max_drawdown,
          sharpe_ratio: trainBacktest.metrics.sharpe_ratio,
          sortino_ratio: trainBacktest.metrics.sortino_ratio,
          win_rate: trainBacktest.metrics.win_rate,
          expected_value: trainBacktest.metrics.expected_value,
          oos_trades: testBacktest.metrics.trades,
          oos_net_return: testBacktest.metrics.net_return,
          oos_expected_value: testBacktest.metrics.expected_value,
          score: trainBacktest.metrics.net_return - trainBacktest.metrics.max_drawdown + (trainBacktest.metrics.expected_value * 10),
        };
      }).sort((a, b) => b.score - a.score || b.net_return - a.net_return);
    } catch (error) {
      const message = `Unable to fetch provider history: ${error.message}. Use --sample for deterministic validation or refresh the live cache with network access.`;
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(message);
      }
      return 1;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    timeframe: timeframe || 'all',
    period: { from, to },
    train_ratio: trainRatio,
    tested: runs.length,
    winner: runs[0] || null,
    top: runs.slice(0, 10),
  };
  writeJson(output, report);
  printPayload({
    tested: report.tested,
    winner: report.winner ? report.winner.periods : 'none',
    winner_net_return: report.winner ? report.winner.net_return : 0,
    winner_max_drawdown: report.winner ? report.winner.max_drawdown : 0,
    winner_sharpe: report.winner ? report.winner.sharpe_ratio : null,
    winner_sortino: report.winner ? report.winner.sortino_ratio : null,
    winner_win_rate: report.winner ? report.winner.win_rate : 0,
    winner_ev: report.winner ? report.winner.expected_value : 0,
    winner_tail_var_95: report.winner && report.winner.train && report.winner.train.tail_risk ? report.winner.train.tail_risk.value_at_risk : null,
    winner_mc_loss_prob: report.winner && report.winner.train && report.winner.train.monte_carlo ? report.winner.train.monte_carlo.probability_of_loss : null,
    oos_trades: report.winner ? report.winner.oos_trades : 0,
    oos_net_return: report.winner ? report.winner.oos_net_return : 0,
    oos_ev: report.winner ? report.winner.oos_expected_value : 0,
    output,
  }, args);
  return 0;
}

async function commandDemo(args) {
  const demoArgs = ['--sample', ...args.filter((arg) => arg !== '--sample')];
  commandIndicators(demoArgs);
  commandModelCompare(demoArgs);
  await commandBacktest(demoArgs);
  await commandOptimize(demoArgs);
  return 0;
}

async function commandWatch(args) {
  const family = optionValue(args, '--family', 'all');
  const intervalMinutes = numericOption(args, '--interval', 15);
  const intervalMs = intervalMinutes * 60 * 1000;

  let showLimit = 10;
  let latestBySymbol = new Map();
  let lastSyncTime = null;
  let lastSyncCount = 0;
  let lastSyncDuration = 0;

  const render = () => {
    console.clear();
    console.log(`\x1b[1;36mSOVEREIGN WATCH MODE\x1b[0m \x1b[90m(Family: ${family}, Interval: ${intervalMinutes}m)\x1b[0m`);
    console.log('\x1b[90mPress Ctrl+C to stop, Ctrl+T to show more.\x1b[0m\n');
    
    if (lastSyncTime) {
      process.stdout.write(`\x1b[32m✔\x1b[0m Last sync: \x1b[1m${lastSyncTime}\x1b[0m (\x1b[90m${lastSyncCount} records, ${lastSyncDuration}s\x1b[0m)\n\n`);
    }

    if (latestBySymbol.size > 0) {
      const sortedSymbols = Array.from(latestBySymbol.keys()).sort();
      const visibleSymbols = sortedSymbols.slice(0, showLimit);

      console.log('\x1b[1m  Target       Price        Type      Provider\x1b[0m');
      console.log('\x1b[90m  ───────────  ───────────  ────────  ─────────\x1b[0m');
      
      for (const sym of visibleSymbols) {
        const latest = latestBySymbol.get(sym);
        const price = latest.close || latest.value || 'N/A';
        const type = latest.timeframe || 'point';
        const provider = latest.provider || 'unknown';
        
        const displaySym = String(sym).slice(0, 11).padEnd(11);
        const displayPrice = String(price).slice(0, 11).padEnd(11);
        const displayType = String(type).slice(0, 8).padEnd(8);
        
        console.log(`  \x1b[36m${displaySym}\x1b[0m  \x1b[32m${displayPrice}\x1b[0m  \x1b[90m${displayType}  ${provider}\x1b[0m`);
      }
      
      if (latestBySymbol.size > showLimit) {
        console.log(`\x1b[90m  ... and ${latestBySymbol.size - showLimit} more targets (Press Ctrl+T to expand)\x1b[0m`);
      }
      console.log('');
    }
  };

  const runIngest = async () => {
    const start = Date.now();
    process.stdout.write(`\r\x1b[K\x1b[33m⌛\x1b[0m Synchronizing ${family} data...`);
    try {
      const snapshot = await ingestMarketData({ family: family === 'all' ? null : family });
      lastSyncDuration = ((Date.now() - start) / 1000).toFixed(1);
      lastSyncTime = new Date().toLocaleTimeString();
      
      const lastRecords = snapshot.sources.filter(r => !family || family === 'all' || r.family === family);
      lastSyncCount = lastRecords.length;

      latestBySymbol.clear();
      for (const r of lastRecords) {
        const sym = r.symbol || r.underlying || r.series || 'unknown';
        const existing = latestBySymbol.get(sym);
        if (!existing || new Date(r.timestamp) > new Date(existing.timestamp)) {
          latestBySymbol.set(sym, r);
        }
      }
      render();
    } catch (error) {
      process.stdout.write(`\r\x1b[K\x1b[31m✘\x1b[0m Sync failed: ${error.message}\n`);
    }
  };

  if (process.stdout.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
      if (key === '\u0003') { // Ctrl+C
        console.log('\n\x1b[33mWatch mode stopped.\x1b[0m');
        process.exit(0);
      }
      if (key === '\u0014') { // Ctrl+T
        showLimit = (showLimit === 10) ? latestBySymbol.size : 10;
        render();
      }
    });
  }

  await runIngest();

  let nextRun = Date.now() + intervalMs;
  const timer = setInterval(async () => {
    const now = Date.now();
    const remaining = Math.max(0, nextRun - now);
    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;

    const progressWidth = 20;
    const progress = Math.min(1, (intervalMs - remaining) / intervalMs);
    const filled = Math.floor(progress * progressWidth);
    const empty = progressWidth - filled;
    const progressBar = '\x1b[90m[' + '\x1b[36m' + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(empty) + ']\x1b[0m';

    process.stdout.write('\r\x1b[KNext refresh in: \x1b[1m' + minutes + 'm ' + displaySeconds + 's\x1b[0m ' + progressBar + ' ');

    if (remaining <= 0) {
      process.stdout.write('\n');
      await runIngest();
      nextRun = Date.now() + intervalMs;
    }
  }, 1000);

  return new Promise(() => {});
}

async function handleCommand(args) {
  const command = args[0];
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    const topic = command === 'help' ? (args[1] || 'overview') : 'overview';
    pageText(helpText(topic), args.slice(command === 'help' ? 2 : 1));
    return 0;
  }
  const handlers = {
    status: (a) => commandStatus(a),
    cockpit: (a) => commandCockpit(a),
    watch: (a) => commandWatch(a),
    backend: (a) => commandBackend(a),
    quotes: (a) => commandQuotes(a),
    strategy: (a) => commandStrategy(a),
    backtest: (a) => commandBacktest(a),
    optimize: (a) => commandOptimize(a),
    trade: (a) => commandTrade(a),
    demo: (a) => commandDemo(a),
  };

  const handler = handlers[command];
  if (!handler) {
    printPayload({ error: 'Unknown command: ' + command }, args);
    return 1;
  }
  return await handler(args.slice(1));
}

async function main() {
  const args = process.argv.slice(2);
  return await handleCommand(args);
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

function buildTradeGatewayLaunch(args = []) {
  const gatewayPath = path.join(REPO_ROOT, 'execution_gateway', 'src', 'index.ts');
  const tsxCandidates = [
    path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
    path.join(REPO_ROOT, 'web_page', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
  ];
  const tsxPath = tsxCandidates.find((candidate) => fs.existsSync(candidate));
  if (tsxPath) {
    if (process.platform === 'win32' && tsxPath.toLowerCase().endsWith('.cmd')) {
      const quoteForPowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
      return { command: 'powershell.exe', args: ['-NoProfile', '-Command', [tsxPath, gatewayPath, ...args].map(quoteForPowerShell).join(' ')] };
    }
    return { command: tsxPath, args: [gatewayPath, ...args] };
  }
  return { command: 'npx', args: ['tsx', gatewayPath, ...args] };
}

async function commandCockpit(args) {
  const snapshot = readSnapshot(DEFAULT_SNAPSHOT);
  const model = buildCockpitModel(snapshot, args);
  if (hasFlag(args, '--json')) {
    printPayload(model, args);
    return 0;
  }
  pageText(renderCockpit(model), args);
  return 0;
}

module.exports = {
  backtestDataQualityError,
  cryptoLimitForWindow,
  filterCandlesByWindow,
  handleCommand,
  historicalWindowFromArgs,
  buildCockpitModel,
  buildTradeGatewayLaunch,
  commandCockpit,
  quoteProviderHeaderState,
  renderCockpit,
  currentPhaseLabel,
};