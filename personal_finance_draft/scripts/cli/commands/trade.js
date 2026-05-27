const path = require('node:path');
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

const utils = require('../lib/utils.js');
const { usage, helpText, pageText, optionValue, hasFlag, printPayload, currentPhaseLabel, formatHumanNumber, formatHumanPayload, renderHumanValue, safeReadJson, labelState, numericOption } = utils;
const { REPO_ROOT, DEFAULT_SNAPSHOT, DEFAULT_QUALITY_REPORT, DEFAULT_HISTORY, DEFAULT_FEATURES, DEFAULT_MODEL_REPORT, DEFAULT_BACKTEST, DEFAULT_STATE_PATH, BACKEND_CANDIDATES, HELP_TOPICS } = utils;


function buildTradeGatewayLaunch(args = []) {
  const gatewayPath = path.join(utils.REPO_ROOT, 'execution_gateway', 'src', 'index.ts');
  const tsxCandidates = [
    path.join(utils.REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
    path.join(utils.REPO_ROOT, 'web_page', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
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

function commandTrade(args) {
  const { command, args: cmdArgs } = buildTradeGatewayLaunch(args);
  const result = spawnSync(command, cmdArgs, { stdio: 'inherit', shell: true });
  return result.status || 0;
}

module.exports = { buildTradeGatewayLaunch, commandTrade };

module.exports = {
  
};
