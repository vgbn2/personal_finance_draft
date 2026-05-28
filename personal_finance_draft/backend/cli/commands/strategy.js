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

module.exports = {
  slugifyStrategyName, get_Current_Universe_Symbols, buildStrategyPlan, readStrategyRegistry, parseScalarFromYaml, strategySectionPresent, inspectStrategyFile, strategyRegistryReport, writeStrategyRegistry, commandStrategy
};
