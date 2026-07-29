const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const A = require('../../../shared/lib/ui/ansi');

const {
  runInteractiveMenu,
  handleIntersection,
  promptSelect,
  promptText,
  promptConfirm,
  isRichTerminal
} = require('../tui');
const { resolveSymbols } = require('../../../shared/lib/market/symbol_resolver');
const {
  REPO_ROOT,
  BACKEND_CANDIDATES,
  CLI_CANDIDATES,
  DEFAULT_SNAPSHOT,
  DEFAULT_QUALITY_REPORT,
  DEFAULT_FEATURES,
  DEFAULT_MODEL_REPORT,
  DEFAULT_BACKTEST,
  DEFAULT_STATE_PATH,
} = require('../../../shared/lib/runtime/paths');

const { loadMarketConfig } = require('../../../shared/lib/runtime/config_loader');

// Cache directory (not a file) — local to CLI, not shared with API layer
const DEFAULT_HISTORY = path.join(REPO_ROOT, 'storage', 'data', 'cache');

const HELP_TOPICS = {
  overview: [
    'Sovereign CLI',
    '',
    'Daily commands',
    '  status        Show phase, cache, and data-quality status',
    '  remote        Read central-host status through the local tunnel',
    '  setup         Configure broker credentials locally',
    '  doctor        Inspect local runtime and broker readiness',
    '  cockpit       Open the terminal dashboard',
    '  backend       Show C++ backend runtime, stats, data, correlation, and integrity',
    '  quotes        Show configured Headway MT5/MT5/Webull quote imports and dedup status',
    '  strategy new  Create a validated strategy plan file',
    '  strategy prop-firms  Manage prop-firm profiles and rule presets',
    '  strategy sync  Refresh the strategy registry from config/strategies',
    '  backfill      Build a historical cache for real-data backtests',
    '  portfolio-monitor  Read-only portfolio/risk monitor loop',
    '  market monitor     Read-only global latest-price/freshness monitor',
    '  demo          Run sample features, models, backtest, and period optimization',
    '  check         Validate the current live cache',
    '  bt            Run the backtest against live cache data',
    '  optimize      Test indicator periods against backtest metrics',
    '  trade         Place trades and manage broker connections (Alpaca, MT5, add-platform)',
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
    '  remote [status|bias SYMBOL|data|universe|signal|scorecard|bot] [--watch] [--json]',
    '  setup [alpaca|gateio|mt5|polymarket|supabase] [--json] [--dry-run]',
    '  doctor [runtime|data|alpaca|gateio|mt5|polymarket|supabase] [--json] [--no-network]',
    '  backend status | backend stats [--equity 100,110,105]',
    '  backend data summary [--symbol AAPL] [--timeframe 1d] [--input path]',
    '  backend correlation [--symbols AAPL,MSFT,SPY] [--timeframe 1d] [--method auto|pearson-returns|fx-returns|pearson-levels] [--input path]',
    '  backend universe [--input path] [--max-entries 0]',
    '  backend integrity [--json]',
    '  quotes status [--json]',
    '  strategy new <name> [--kind momentum] [--model cnn_v3] [--output path]',
    '  strategy list | strategy validate | strategy interactive | strategy prop-firms | strategy sync',
    '  strategy run_automated [--interval 15] [--live]',
    '  ingest [--full]',
    '  backfill [--timeframe 1d] [--days 365] [--symbol S] [--include-prediction] [--20-years]',
    '  portfolio-monitor [--once] [--scope both|live|live_paper] [--alpaca-scope paper|live|both] [--interval-secs 60] [--json]',
    '  market monitor [--family F] [--freshness STATE] [--limit 50] [--offset 0] [--json]',
    '  market monitor --watch [--interval-secs 10] [--iterations 60] [--json]',
    '  check | validate [--input path] [--strict]',
    '  trade balance | trade <buy|sell> <symbol> <qty> [type] [price] [--live]',
    '  watch [--family crypto|fx|all] [--interval 15]',
    '  loc',
    '',
    'Research',
    '  features | indicators [--timeframe 1d]',
    '  models | model compare [--timeframe 1d] [--horizon 5]',
    '  bt | backtest [--timeframe 1d] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--prop-firm profile]',
    '  optimize [--timeframe 1d]',
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
    '  node backend/cli/sovereign_cli.js bt',
    '',
    'Useful options',
    '  --timeframe 1d          Use one timeframe only',
    '  --from YYYY-MM-DD       Start date filter',
    '  --to YYYY-MM-DD         End date filter',

    '  --train-ratio 0.70      First slice used for period selection',
    '  --horizon 5             Holding period in bars',
    '  --threshold 0.55        Minimum model confidence',
    '  --fee-bps 2             Commission or exchange fee per side',
    '  --slippage-bps 3        Slippage per side',
    '  --cost-bps 5            Backward-compatible total cost hint',
    '  --tail-alpha 0.05       Tail risk confidence level',
    '  --monte-carlo-runs 200  Bootstrap stress runs',
    '  --prop-firm PROFILE     Select a prop-firm profile (or none)',
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
    '  node backend/cli/sovereign_cli.js watch [--family crypto|fx|all] [--interval 15]',
    '',
    'Options',
    '  --family    The data family to monitor (default: crypto)',
    '  --interval  The refresh interval in minutes (default: 15)',
  ],
  indicators: [
    'Indicator Period Help',
    '',
    'Single run',
    '  node backend/cli/sovereign_cli.js bt --allow-degraded --rsi 7 --atr 7 --bollinger 10 --volatility 10',
    '',
    'Grid search',
    '  node backend/cli/sovereign_cli.js optimize --allow-degraded',
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
    '  node backend/cli/sovereign_cli.js status',
    '  node backend/cli/sovereign_cli.js check',
    '',
    'Run an end-to-end deterministic research demo',
    '  node backend/cli/sovereign_cli.js demo',
    '',
    'Run a timeframe-aware live backtest',
    '  node backend/cli/sovereign_cli.js backfill --timeframe 1d --days 365 --include-prediction --relevance-floor 0.30',
    '  node backend/cli/sovereign_cli.js bt --input storage/data/cache/backtest_history.json --timeframe 1d',
    '  node backend/cli/sovereign_cli.js bt --timeframe 1d --from 2025-02-01 --to 2025-04-30',
    '  node backend/cli/sovereign_cli.js bt --timeframe 1d --fee-bps 2 --slippage-bps 3 --tail-alpha 0.05 --monte-carlo-runs 2000',
    '  node backend/cli/sovereign_cli.js optimize --allow-degraded --train-ratio 0.7',
    '',
    'Try a specific indicator configuration',
    '  node backend/cli/sovereign_cli.js bt --allow-degraded --rsi 7 --atr 7 --bollinger 10 --volatility 10',
    '',
    'Get JSON for another tool',
    '  node backend/cli/sovereign_cli.js bt --json',
  ],
};

const IS_DEBUG = process.argv.includes('--debug') || process.env.SOVEREIGN_DEBUG === 'true';

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(A.c(A.YELLOW, `[WARN] ${msg}`)),
  error: (msg, err) => {
    console.error(A.c(A.RED, `[ERROR] ${msg}`));
    if (IS_DEBUG && err) {
      console.error(A.c(A.DIM, err.stack || err));
    }
  },
  debug: (msg, data) => {
    if (IS_DEBUG) {
      console.log(A.c(A.CYAN, `[DEBUG] ${msg}`));
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

// Canonical implementation lives in shared/lib/runtime/backend_bridge.js
// (buildTradeGatewayLaunch strips --pin unconditionally there too); re-exported
// here so existing callers/tests in this module keep working unchanged.
const { stripFlagValue } = require('../../../shared/lib/runtime/backend_bridge');

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

function shouldAnimate(args = []) {
  return process.stdout.isTTY
    && !hasFlag(args, '--json')
    && !hasFlag(args, '--no-spinner')
    && !hasFlag(args, '--quiet');
}

async function withLoadingAnimation(label, task, args = [], options = {}) {
  const enabled = options.enabled !== undefined ? options.enabled : shouldAnimate(args);
  if (!enabled) return await task();

  const stream = options.stream || process.stdout;
  const frames = options.frames || ['|', '/', '-', '\\'];
  const intervalMs = options.intervalMs || 80;
  const suffix = options.suffix || '';
  let index = 0;
  let stopped = false;

  const render = () => {
    if (stopped) return;
    const frame = frames[index++ % frames.length];
    stream.write(`\r\x1b[2K${label} ${frame}${suffix}`);
  };

  stream.write(`\r\x1b[2K${label} ${frames[0]}${suffix}`);
  const timer = setInterval(render, intervalMs);
  if (timer.unref) timer.unref();

  try {
    return await task();
  } finally {
    stopped = true;
    clearInterval(timer);
    stream.write('\r\x1b[2K');
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


function get_Current_Universe_Symbols() {
  try {
    if (!fs.existsSync(DEFAULT_HISTORY)) return [];
    
    const universe = [];
    const seen = new Set();

    // Scan all family subdirectories for backtest_history.json
    const families = fs.readdirSync(DEFAULT_HISTORY);
    for (const family of families) {
      const familyPath = path.join(DEFAULT_HISTORY, family);
      if (!fs.statSync(familyPath).isDirectory()) continue;

      const historyPath = path.join(familyPath, 'backtest_history.json');
      if (!fs.existsSync(historyPath)) continue;

      try {
        const data = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        (data.sources || []).forEach(s => {
            const symbol = s.symbol || s.underlying || s.series || s.metric || s.event;
            if (!symbol) return;
            const key = `${s.family || family}:${symbol}`;
            if (seen.has(key)) return;
            seen.add(key);
            universe.push({ 
              symbol, 
              family: s.family || family,
              market: s.config_market || null,
              sector: s.config_sector || null,
              coordinate_id: s.coordinate_id || null
            });
        });
      } catch (e) {
        logger.error(`Failed to parse history for family ${family}`, e);
      }
    }
    
    return universe;
  } catch (e) {
    return [];
  }
}

/**
 * Returns every symbol from data_sources.yaml PLUS anything already in
 * backtest_history.json that isn't in the config.
 * Tradeable families only (excludes weather, flight, onchain, etc.).
 * Returns enriched objects: { symbol, family, market, sector, coordinate_id }.
 */
async function get_Full_Universe_Symbols() {
  const TRADEABLE = new Set(['equities','indices','commodities','fx','crypto','macro','pmi','sentiment','reserves','holdings','equities_options','stock_options','prediction_market']);
  const seen = new Set();
  const universe = [];

  const add = (symbol, family, market = null, sector = null) => {
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    const coordinate_id = market && sector ? `${market}-${sector}-${symbol}`.toUpperCase() : (market ? `${market}-${symbol}`.toUpperCase() : symbol);
    universe.push({ symbol, family, market, sector, coordinate_id });
  };

  // 1. Parse data_sources.yaml using loadMarketConfig
  try {
    const yamlPath = path.join(REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
    const config = await loadMarketConfig(yamlPath);
    
    for (const [family, data] of Object.entries(config)) {
      if (!TRADEABLE.has(family) || !data.enabled) continue;

      // Handle universe_matrix first (most specific)
      if (data.universe_matrix && data.universe_matrix.grid) {
        for (const [market, sectors] of Object.entries(data.universe_matrix.grid)) {
          for (const [sector, symbols] of Object.entries(sectors)) {
            if (Array.isArray(symbols)) {
              symbols.forEach(sym => add(sym, family, market, sector));
            }
          }
        }
      }

      // Handle raw symbols/series list
      const rawList = data.symbols || data.series || [];
      if (Array.isArray(rawList)) {
        rawList.forEach(sym => add(sym, family));
      }
    }
  } catch (e) {
    logger.error('Failed to load market config in get_Full_Universe_Symbols', e);
  }

  // 2. Merge anything in backtest_history.json not already in config
  try {
    if (fs.existsSync(DEFAULT_HISTORY)) {
      const families = fs.readdirSync(DEFAULT_HISTORY);
      for (const family of families) {
        const histPath = path.join(DEFAULT_HISTORY, family, 'backtest_history.json');
        if (!fs.existsSync(histPath)) continue;
        const data = JSON.parse(fs.readFileSync(histPath, 'utf8'));
        (data.sources || []).forEach(s => {
          const sym = s.symbol || s.underlying || s.series || s.metric || s.event;
          if (sym && TRADEABLE.has(s.family || family)) add(sym, s.family || family);
        });
      }
    }
  } catch (e) { /* ignore */ }

  return universe;
}

/**
 * Attempts to resolve short symbols (BTC) to canonical ones (BTCUSDT)
 * based on the active universe.
 */

function buildStatusLine(authEmail) {
  const backendOk = BACKEND_CANDIDATES.some(c => fs.existsSync(c));
  const cacheOk = fs.existsSync(DEFAULT_SNAPSHOT);
  const backendLabel = backendOk ? A.c(A.GREEN, 'OK') : A.c(A.RED, 'Missing');
  const cacheLabel = cacheOk ? A.c(A.GREEN, 'Valid') : A.c(A.YELLOW, 'Empty');
  const authPart = authEmail
    ? `${A.muted(' | ')}${A.c(A.GREEN, '●')} ${A.muted(authEmail)}`
    : `${A.muted(' | ')}${A.c(A.YELLOW, '○')} ${A.muted('Not signed in')}`;
  return `${A.muted('Backend: ')}${backendLabel}${A.muted(' | Cache: ')}${cacheLabel}${authPart}`;
}

module.exports = {
  REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY,
  DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH,
  BACKEND_CANDIDATES, HELP_TOPICS,
  usage, helpText, pageText, optionValue, hasFlag, stripFlagValue, printPayload, shouldAnimate, withLoadingAnimation, currentPhaseLabel,
  formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption,
  runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, isRichTerminal,
  buildStatusLine,
  get_Current_Universe_Symbols, get_Full_Universe_Symbols, resolveSymbols, logger,
  promptMultiSelect: require('../tui/engine/engine').promptMultiSelect
};
