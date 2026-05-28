#!/usr/bin/env node

require('../lib/env');
global.suppressLogs = false;
const utils = require('./lib/utils.js');
const { pageText, helpText, printPayload } = utils;

const { commandStatus, commandCockpit } = require('./commands/status.js');
const { commandBackend } = require('./commands/backend.js');
const { commandQuotes } = require('./commands/quotes.js');
const { commandStrategy } = require('./commands/strategy.js');
const { commandBacktest, commandOptimize, commandDemo } = require('./commands/research.js');
const { commandWatch, commandIngest, commandBackfill, commandValidate, commandPrune } = require('./commands/data.js');
const { commandTrade, buildTradeGatewayLaunch } = require('./commands/trade.js');
const { commandIndicators, commandModelCompare } = require('./commands/research.js');

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
    ingest: (a) => commandIngest(a),
    backfill: (a) => commandBackfill(a),
    validate: (a) => commandValidate(a),
    check: (a) => commandValidate(a),
    backend: (a) => commandBackend(a),
    quotes: (a) => commandQuotes(a),
    strategy: (a) => commandStrategy(a),
    backtest: (a) => commandBacktest(a),
    bt: (a) => commandBacktest(a),
    indicators: (a) => commandIndicators(a),
    features: (a) => commandIndicators(a),
    models: (a) => commandModelCompare(a),
    optimize: (a) => commandOptimize(a),
    trade: (a) => commandTrade(a),
    prune: (a) => commandPrune(a),
    'db-prune': (a) => commandPrune(a),
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
