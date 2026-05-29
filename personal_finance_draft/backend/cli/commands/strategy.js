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
const { runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, isRichTerminal } = require('../tui');

const utils = require('../lib/utils.js');
const { usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption } = utils;
const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;



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

function parseArrayFromYaml(text, key) {
  const sectionRegex = new RegExp(`^  ${key}:\\s*\\n((?:    -\\s*.*\\n?)*)`, 'm');
  const match = text.match(sectionRegex);
  if (!match) return [];
  return match[1].split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').replace(/^["']|["']$/g, '').trim());
}

function parseRiskFromYaml(text) {
  const match = text.match(/^  risk:\s*\n((?:    .*\n?)*)/m);
  if (!match) return {};
  const risk = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^\s+([^:]+):\s*(.+)$/);
    if (kv) {
      const k = kv[1].trim();
      const v = kv[2].trim();
      risk[k] = isNaN(v) ? v.replace(/^["']|["']$/g, '') : Number(v);
    }
  }
  return risk;
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
    universe: parseArrayFromYaml(text, 'universe'),
    risk: parseRiskFromYaml(text),
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

function toggleStrategyStatus(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(absolutePath)) return false;
  let text = fs.readFileSync(absolutePath, 'utf8');
  const isEnabled = parseScalarFromYaml(text, 'enabled') === 'true';
  text = text.replace(/^enabled:\s*(.+)$/m, `enabled: ${!isEnabled}`);
  fs.writeFileSync(absolutePath, text, 'utf8');
  return !isEnabled;
}

// [gemini-work] Added for strategy automation
const EXECUTION_MEMORY = new Set(); // Simple in-memory guard for current session

async function runAutomationPass(args) {
    const isLive = hasFlag(args, '--live');
    const symbolsToFetch = new Set();
    const files = readStrategyRegistry();
    const enabledStrategies = files.map(inspectStrategyFile).filter(s => s.enabled);

    if (enabledStrategies.length === 0) {
        console.log(`[\x1b[90m${new Date().toLocaleTimeString()}\x1b[0m] [AUTOMATION] No strategies enabled.`);
        return;
    }

    console.log(`[\x1b[36m${new Date().toLocaleTimeString()}\x1b[0m] [AUTOMATION] Scanning ${enabledStrategies.length} enabled strategies... (Mode: ${isLive ? '\x1b[1;31mLIVE\x1b[0m' : '\x1b[1;32mDRY-RUN\x1b[0m'})`);
    
    // 1. Collect all symbols needed
    enabledStrategies.forEach(s => {
        const universe = Array.isArray(s.universe) ? s.universe : [];
        universe.forEach(sym => symbolsToFetch.add(sym));
    });

    // 2. Fetch latest data for all symbols (Backfill small window)
    const { commandBackfill } = require('./data.js');
    global.suppressLogs = true;
    for (const symbol of symbolsToFetch) {
        console.log(`[AUTOMATION] Refreshing data for ${symbol}...`);
        await commandBackfill(['--symbol', symbol, '--days', '2', '--timeframe', '1d', '--json']);
    }
    global.suppressLogs = false;

    // 3. For each strategy, generate signal and check threshold
    const { commandBacktest } = require('./research.js');
    const { commandTrade } = require('./trade.js');

    for (const strategy of enabledStrategies) {
        console.log(`[AUTOMATION] Analyzing ${strategy.name}...`);
        
        global.suppressLogs = true;
        const report = await commandBacktest([
            '--strategy', strategy.path, 
            '--model', strategy.model, 
            '--threshold', String(strategy.risk?.signal_threshold || 0.65),
            '--allow-degraded',
            '--json'
        ]);
        global.suppressLogs = false;

        if (report && report.trades && report.trades.length > 0) {
            const lastTrade = report.trades[report.trades.length - 1];
            const tradeType = lastTrade.type || lastTrade.side || 'unknown';
            const signalId = `${strategy.name}:${lastTrade.symbol}:${lastTrade.timestamp}:${tradeType}`;

            if (EXECUTION_MEMORY.has(signalId)) {
                console.log(`[AUTOMATION] Signal ${signalId} already processed. Skipping.`);
                continue;
            }

            // Freshness check: Signal must be within the last bar's timeframe
            const signalTime = new Date(lastTrade.timestamp).getTime();
            const now = Date.now();
            const maxAgeMs = 24 * 60 * 60 * 1000; // 1 day for '1d' timeframe (should be dynamic)

            if (now - signalTime > maxAgeMs) {
                console.log(`[AUTOMATION] Signal for ${lastTrade.symbol} is stale (${new Date(signalTime).toLocaleString()}). Skipping.`);
                continue;
            }

            console.log(`[\x1b[1;32mSIGNAL\x1b[0m] Strategy ${strategy.name} trigger: ${tradeType.toUpperCase()} ${lastTrade.symbol} @ ${lastTrade.price}`);
            
            if (isLive) {
                console.log(`[\x1b[1;31mEXECUTE\x1b[0m] Sending LIVE order for ${lastTrade.symbol}...`);
                const tradeArgs = [
                    tradeType === 'buy' ? 'buy' : 'sell',
                    lastTrade.symbol,
                    '1', // TODO: Sizing logic from strategy risk weight
                    'market',
                    '--live'
                ];
                if (process.env.SOVEREIGN_TRADE_PIN) {
                    tradeArgs.push('--pin', process.env.SOVEREIGN_TRADE_PIN);
                }
                await commandTrade(tradeArgs);
            }
 else {
                console.log(`[\x1b[1;32mDRY-RUN\x1b[0m] Order simulated for ${lastTrade.symbol}.`);
            }

            EXECUTION_MEMORY.add(signalId);
        }
    }
}

async function runAutomatedStrategies(args) {
    const intervalMinutes = numericOption(args, '--interval', 15);
    const intervalMs = intervalMinutes * 60 * 1000;
    let passes = 0;
    const maxPasses = 2;
    
    console.log(`[\x1b[1;35mAUTO\x1b[0m] Starting Strategy Automation Loop (Interval: ${intervalMinutes} min, Max Passes: ${maxPasses})`);
    console.log('Press Ctrl+C to stop.');

    const loop = async () => {
        try {
            passes++;
            console.log(`[AUTOMATION] Starting Pass ${passes}/${maxPasses}...`);
            await runAutomationPass(args);
        } catch (error) {
            console.error(`[AUTOMATION] Pass failed: ${error.message}`);
        }
        if (passes < maxPasses) {
            setTimeout(loop, intervalMs);
        } else {
            console.log(`[AUTOMATION] Reached max passes (${maxPasses}). Exiting.`);
            process.exit(0);
        }
    };

    loop();
}
// ------------------------------------------

async function commandStrategy(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'list' || subcommand === 'interactive') {
    const report = strategyRegistryReport();
    if (!isRichTerminal() || subcommand !== 'interactive') {
      printPayload(report, args);
      return report.ok ? 0 : 1;
    }

    const choices = report.strategies.map((s) => ({
      label: `${s.enabled ? '[\x1b[32mON\x1b[0m]' : '[\x1b[90mOFF\x1b[0m]'} ${s.name || s.path} (${s.kind || 'n/a'})`,
      value: s.path
    }));
    choices.push({ label: 'Exit', value: null });

    const selectedPath = await promptSelect('Manage strategy:', choices);
    if (!selectedPath) return 0;

    const action = await promptSelect('Action:', [
      { label: 'Toggle Enabled Status', value: 'toggle' },
      { label: 'Batch Toggle (Multi-Select)', value: 'batch_toggle' },
      { label: 'Execute Backtest', value: 'execute' },
      { label: 'Back', value: 'back' }
    ]);

    if (action === 'toggle') {
      const newState = toggleStrategyStatus(selectedPath);
      console.log(`Strategy ${selectedPath} is now ${newState ? 'enabled' : 'disabled'}.`);
    } else if (action === 'batch_toggle') {
      const multiChoices = report.strategies.map((s) => ({
        label: `${s.name || s.path} (${s.kind || 'n/a'}) [Currently: ${s.enabled ? 'ON' : 'OFF'}]`,
        value: s.path
      }));
      const { promptMultiSelect } = require('../tui');
      const selectedToToggle = await promptMultiSelect('Select strategies to toggle (Space to select, Enter to confirm):', multiChoices);
      for (const stPath of selectedToToggle) {
        const newState = toggleStrategyStatus(stPath);
        console.log(`Strategy ${stPath} is now ${newState ? 'enabled' : 'disabled'}.`);
      }
    } else if (action === 'execute') {
      const { commandBacktest } = require('./research.js');
      console.log(`Executing backtest for ${selectedPath}...`);
      await commandBacktest(['--strategy', selectedPath, '--sample']);
    }
    return 0;
  }
  
  if (subcommand === 'validate') {
    const report = strategyRegistryReport();
    printPayload(report, args);
    return report.ok ? 0 : 1;
  }
  
  if (subcommand === 'run_automated') {
      await runAutomatedStrategies(args.slice(1));
      return 0;
  }
  
  if (subcommand !== 'new') {
    printPayload({ error: 'Usage: strategy new <name> [...] | strategy list | strategy interactive | strategy run_automated' }, args);
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

module.exports = {
  slugifyStrategyName, get_Current_Universe_Symbols, buildStrategyPlan, readStrategyRegistry, parseScalarFromYaml, strategySectionPresent, inspectStrategyFile, strategyRegistryReport, writeStrategyRegistry, commandStrategy, runAutomatedStrategies
};
