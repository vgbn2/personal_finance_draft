const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../scripts/data_ops/ingest_market_data');
const { DEFAULT_PROVIDER_PRIORITY } = require('../../../shared/lib/quote_router');
const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../../../shared/lib/backtest');
const { calculateFeatureFrame, calculateRollingFeatureFrame, DEFAULT_PERIODS, generateSampleBars } = require('../../../shared/lib/indicators');
const { compareModels } = require('../../../shared/lib/models');
const { mergeSnapshots, readSnapshot, validateSnapshot, writeJson } = require('../../../shared/lib/market_validation');

const { 
  REPO_ROOT, 
  BACKEND_CANDIDATES, 
  CLI_CANDIDATES 
} = require('../../../shared/lib/paths');

const DEFAULT_SNAPSHOT = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json');
const DEFAULT_QUALITY_REPORT = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'data_quality_report.json');
const DEFAULT_HISTORY = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'backtest_history.json');
const DEFAULT_FEATURES = path.join(REPO_ROOT, 'storage', 'data', 'features', 'latest_features.json');
const DEFAULT_MODEL_REPORT = path.join(REPO_ROOT, 'storage', 'data', 'models', 'latest_model_comparison.json');
const DEFAULT_BACKTEST = path.join(REPO_ROOT, 'storage', 'data', 'backtests', 'latest_backtest.json');
const DEFAULT_STATE_PATH = path.join(REPO_ROOT, 'workspace', 'STATE.md');

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
    '  loc           Count lines of code in the project',
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
    '  strategy list | strategy validate | strategy interactive',
    '  strategy run_automated [--interval 15] [--live]',
    '  ingest [--full]',
    '  backfill [--timeframe 1d] [--days 365] [--symbol S] [--include-prediction] [--20-years]',
    '  check | validate [--input path] [--strict]',
    '  trade balance | trade <buy|sell> <symbol> <qty> [type] [price] [--live]',
    '  watch [--family crypto|fx|all] [--interval 15]',
    '  loc',
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

const IS_DEBUG = process.argv.includes('--debug') || process.env.SOVEREIGN_DEBUG === 'true';

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`\x1b[33m[WARN] ${msg}\x1b[0m`),
  error: (msg, err) => {
    console.error(`\x1b[31m[ERROR] ${msg}\x1b[0m`);
    if (IS_DEBUG && err) {
      console.error(`\x1b[2m${err.stack || err}\x1b[0m`);
    }
  },
  debug: (msg, data) => {
    if (IS_DEBUG) {
      console.log(`\x1b[36m[DEBUG] ${msg}\x1b[0m`);
      if (data) console.log(JSON.stringify(data, null, 2));
    }
  },
  trace: (label, fn) => {
    if (!IS_DEBUG) return fn();
    const start = Date.now();
    logger.debug(`Starting: ${label}`);
    const result = fn();
    logger.debug(`Finished: ${label} (${Date.now() - start}ms)`);
    return result;
  }
};

function usage() {
  pageText(helpText('overview'), []);
}

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

function numericOption(args, name, fallback) {
  const raw = optionValue(args, name, null);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const {
  runInteractiveMenu,
  handleIntersection,
  promptSelect,
  promptText,
  promptConfirm,
  isRichTerminal
} = require('../tui');

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

module.exports = {
  REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY,
  DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH,
  BACKEND_CANDIDATES, HELP_TOPICS,
  usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption,
  runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, isRichTerminal,
  get_Current_Universe_Symbols, logger,
  promptMultiSelect: require('../tui/engine').promptMultiSelect
};
