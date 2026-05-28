const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'scripts', 'cli', 'sovereign_cli.js');
const backup = path.join(__dirname, 'scripts', 'cli', 'sovereign_cli.og.js');
if (!fs.existsSync(backup)) {
  fs.copyFileSync(src, backup);
}

const content = fs.readFileSync(src, 'utf8');

// I'll group functions by their names.
const utilsFns = ['usage', 'helpText', 'pageText', 'optionValue', 'hasFlag', 'printPayload', 'currentPhaseLabel', 'formatHumanNumber', 'formatHumanPayload', 'renderHumanValue', 'safeReadJson', 'labelState', 'numericOption'];
const statusFns = ['summarizeModelCard', 'summarizeBacktestCard', 'summarizeStatusCard', 'summarizeFeaturesCard', 'summarizePortfolioCard', 'buildCockpitModel', 'quoteProviderHeaderState', 'renderCockpit', 'cockpitInspectPayload', 'commandStatus', 'commandCockpit'];
const backendFns = ['locateBackendBinary', 'runBackendCommand', 'runBackendStatus', 'runBackendStats', 'runBackendPortfolio', 'runBackendDataSummary', 'runBackendCorrelation', 'runBackendUniverse', 'reportSnapshotIntegrity', 'runBackendIntegrity', 'backendAvailability', 'commandBackend'];
const quotesFns = ['quoteProviderEnvConfigured', 'quoteProviderPathLabel', 'commandQuotes'];
const strategyFns = ['slugifyStrategyName', 'get_Current_Universe_Symbols', 'buildStrategyPlan', 'readStrategyRegistry', 'parseScalarFromYaml', 'strategySectionPresent', 'inspectStrategyFile', 'strategyRegistryReport', 'writeStrategyRegistry', 'commandStrategy'];
const researchFns = ['periodOptionsFromArgs', 'historicalWindowFromArgs', 'filterCandlesByWindow', 'cryptoLimitForWindow', 'loadUsableSources', 'candlesToSources', 'recordBackfillSummary', 'loadHistoricalSources', 'loadPredictionMarketHistory', 'dateFilterOptionsFromArgs', 'rejectDegradedResearchInput', 'backtestDataQualityError', 'commandIndicators', 'commandModelCompare', 'commandBacktest', 'commandOptimize', 'commandDemo'];
const dataFns = ['commandIngest', 'commandBackfill', 'commandValidate', 'commandWatch'];
const tradeFns = ['buildTradeGatewayLaunch', 'commandTrade'];

// Helper to extract function text
function extractFunction(name) {
  const regex = new RegExp(`^(async )?function ${name}\\s*\\([\\s\\S]*?^}`, 'm');
  const match = content.match(regex);
  if (match) return match[0];
  
  // Try arrow function or const assignment
  const regex2 = new RegExp(`^(const|let|var) ${name}\\s*=\\s*(async )?\\([\\s\\S]*?^};?`, 'm');
  const match2 = content.match(regex2);
  if (match2) return match2[0];

  return null;
}

// Ensure directories exist
fs.mkdirSync(path.join(__dirname, 'scripts', 'cli', 'lib'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'scripts', 'cli', 'commands'), { recursive: true });

// We also need constants
const constantsBlockRegex = /const REPO_ROOT[\s\S]*?\];/;
const constantsMatch = content.match(constantsBlockRegex);
const constantsText = constantsMatch ? constantsMatch[0] : '';

const helpTopicsRegex = /const HELP_TOPICS = {[\s\S]*?^};/m;
const helpTopicsMatch = content.match(helpTopicsRegex);
const helpTopicsText = helpTopicsMatch ? helpTopicsMatch[0] : '';

// Imports needed
const imports = `const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  fetchBinanceBaseCandles, fetchCoinbaseBaseCandles, fetchKalshiHistoricalCandlesticks,
  fetchKalshiHistoricalMarkets, fetchStooqDailyHistory, fetchPolymarketHistoricalPrices,
  fetchYahooBaseCandles, fetchPaginated, fetchParallelBackfill, ingestMarketData,
  dedupePreferredMarketQuotes, loadConfig, loadExternalQuoteInputs,
  resolveCommoditySymbol, resolveEquityOrIndexSymbol, resolveStooqSymbol
} = require('../../data_ops/ingest_market_data');
const { DEFAULT_PROVIDER_PRIORITY } = require('../../lib/quote_router');
const { filterFeatureFrame, runBacktest, splitFeatureFrame } = require('../../lib/backtest');
const { calculateFeatureFrame, calculateRollingFeatureFrame, DEFAULT_PERIODS, generateSampleBars } = require('../../lib/indicators');
const { compareModels } = require('../../lib/models');
const { mergeSnapshots, readSnapshot, validateSnapshot, writeJson } = require('../../lib/market_validation');
const { runInteractiveMenu, handleIntersection, promptSelect, promptText, promptConfirm, isRichTerminal } = require('../../tui_cli');
`;

function writeModule(name, dir, fns, extra = '') {
  let body = imports + '\n';
  
  if (name !== 'utils') {
    body += `const utils = require('../lib/utils.js');\n`;
    body += `const { ${utilsFns.join(', ')} } = utils;\n`;
    body += `const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;\n\n`;
  }

  // Cross-dependencies for other modules
  if (['research', 'data'].includes(name)) {
      body += `const research = require('./research.js');\n`;
      body += `const data = require('./data.js');\n`;
  }
  
  if (name === 'status') {
    body += `const { backendAvailability, runBackendStatus } = require('./backend.js');\n\n`;
  }

  body += extra + '\n\n';

  const exported = [];
  fns.forEach(fn => {
    const fnBody = extractFunction(fn);
    if (fnBody) {
      body += fnBody + '\n\n';
      exported.push(fn);
    }
  });

  if (name === 'utils') {
    body += `module.exports = {
  REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY,
  DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH,
  BACKEND_CANDIDATES, HELP_TOPICS,
  ${exported.join(', ')}
};\n`;
  } else {
    body += `module.exports = {\n  ${exported.join(', ')}\n};\n`;
  }

  const filePath = path.join(__dirname, 'scripts', 'cli', dir, `${name}.js`);
  fs.writeFileSync(filePath, body);
}

writeModule('utils', 'lib', utilsFns, constantsText + '\n\n' + helpTopicsText);
writeModule('backend', 'commands', backendFns);
writeModule('quotes', 'commands', quotesFns);
writeModule('strategy', 'commands', strategyFns);
writeModule('research', 'commands', researchFns);
writeModule('data', 'commands', dataFns);
writeModule('status', 'commands', statusFns);

let tradeBody = `
function buildTradeGatewayLaunch(args = []) {
  const gatewayPath = path.join(utils.REPO_ROOT, 'execution_gateway', 'src', 'index.ts');
  const tsxCandidates = [
    path.join(utils.REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
    path.join(utils.REPO_ROOT, 'web_page', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
  ];
  const tsxPath = tsxCandidates.find((candidate) => fs.existsSync(candidate));
  if (tsxPath) {
    if (process.platform === 'win32' && tsxPath.toLowerCase().endsWith('.cmd')) {
      const quoteForPowerShell = (value) => \`'\${String(value).replace(/'/g, "''")}'\`;
      return { command: 'powershell.exe', args: ['-NoProfile', '-Command', [tsxPath, gatewayPath, ...args].map(quoteForPowerShell).join(' ')] };
    }
    return { command: tsxPath, args: [gatewayPath, ...args] };
  }
  return { command: 'npx', args: ['tsx', gatewayPath, ...args] };
}

function commandTrade(args) {
  const { command, args: cmdArgs } = buildTradeGatewayLaunch(args);
  const result = spawnSync(command, cmdArgs, { stdio: 'inherit', shell: true });
  return result.status || 0;
}
`;
writeModule('trade', 'commands', [], tradeBody + '\nmodule.exports = { buildTradeGatewayLaunch, commandTrade };');

// Now rewrite main
const mainContent = `#!/usr/bin/env node

require('../lib/env');
const utils = require('./lib/utils.js');
const { pageText, helpText, printPayload } = utils;

const { commandStatus, commandCockpit } = require('./commands/status.js');
const { commandBackend } = require('./commands/backend.js');
const { commandQuotes } = require('./commands/quotes.js');
const { commandStrategy } = require('./commands/strategy.js');
const { commandBacktest, commandOptimize, commandDemo } = require('./commands/research.js');
const { commandWatch } = require('./commands/data.js');
const { commandTrade, buildTradeGatewayLaunch } = require('./commands/trade.js');

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
    bt: (a) => commandBacktest(a),
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

module.exports = {
  handleCommand,
  buildTradeGatewayLaunch,
  commandCockpit,
  renderCockpit: require('./commands/status.js').renderCockpit,
  currentPhaseLabel: utils.currentPhaseLabel,
  quoteProviderHeaderState: require('./commands/status.js').quoteProviderHeaderState,
  cryptoLimitForWindow: require('./commands/research.js').cryptoLimitForWindow,
  filterCandlesByWindow: require('./commands/research.js').filterCandlesByWindow,
  historicalWindowFromArgs: require('./commands/research.js').historicalWindowFromArgs,
  buildCockpitModel: require('./commands/status.js').buildCockpitModel,
  backtestDataQualityError: require('./commands/research.js').backtestDataQualityError,
};
`;

fs.writeFileSync(src, mainContent);
console.log('Done refactoring!');
