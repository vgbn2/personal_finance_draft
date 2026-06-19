#!/usr/bin/env node

require('#shared/runtime/env');
global.suppressLogs = false;
const utils = require('./lib/utils.js');
const { pageText, helpText, printPayload, logger } = utils;

const { commandStatus, commandCockpit } = require('./commands/operational/status.js');
const { commandSetup, commandDoctor } = require('./commands/operational/setup.js');
const { commandBackend } = require('./commands/tools/backend.js');
const { commandQuotes } = require('./commands/quotes/quotes.js');
const { commandStrategyMenu, commandPropFirmMenu } = require('./commands/strategy/strategy.js');
const { commandBacktest, commandOptimize, commandEdgeDecay, commandDemo, commandIndicators, commandModelCompare } = require('./commands/research/research.js');
const { commandWatch, commandIngest, commandBackfill, commandMassBackfill, commandCacheClean, commandClearApiCache, commandValidate, commandPrune, commandLoc, commandUniverse, commandCryptoDeepBackfill, commandEquityDeepBackfill, commandFiveMinAccumulate, commandIntradayAccumulate, commandIntradayRollup } = require('./commands/data/data.js');
const { commandBackfillDaemon } = require('./commands/data/backfill_daemon.js');
const { commandTrade, buildTradeGatewayLaunch, commandMt5, commandMt5Profile, commandMt5Connect, commandMt5Bridge, commandAutoTrade, commandAddPlatform, commandAgent, commandPolymarket, commandBot } = require('./commands/trade/trade.js');
const { commandLogin, commandRegister, commandLogout, commandAuthStatus } = require('./commands/account/auth.js');
const { commandSettings } = require('./commands/settings/settings.js');
const { commandRunnerMenu } = require('./commands/runner/run.js');
const { commandMl } = require('./commands/research/ml.js');
const { installDoubleCtrlCExit } = require('./lib/exit_guard');

installDoubleCtrlCExit();

async function handleCommand(args) {
  const isDebug = args.includes('--debug') || process.env.SOVEREIGN_DEBUG === 'true';
  if (isDebug) logger.info('Debug mode active');

  const command = args[0];
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    const topic = command === 'help' ? (args[1] || 'overview') : 'overview';
    pageText(helpText(topic), args.slice(command === 'help' ? 2 : 1));
    return 0;
  }
  // Canonical names match the COMMAND_MANIFEST in tui/manifest.js.
  // Aliases below are CLI-only shorthands not shown in the TUI menu.
  const handlers = {
    // --- Operational (manifest: op) ---
    status:           (a) => commandStatus(a),
    setup:            (a) => commandSetup(a),
    doctor:           (a) => commandDoctor(a),
    cockpit:          (a) => commandCockpit(a),
    watch:            (a) => commandWatch(a),
    ingest:           (a) => commandIngest(a),
    backfill:         (a) => commandBackfill(a),
    'mass-backfill':         (a) => commandMassBackfill(a),
    'crypto-deep-backfill':  (a) => commandCryptoDeepBackfill(a),
    'equity-deep-backfill':  (a) => commandEquityDeepBackfill(a),
    'five-min-accumulate':   (a) => commandFiveMinAccumulate(a),
    'intraday-accumulate':   (a) => commandIntradayAccumulate(a),
    'intraday-rollup':       (a) => commandIntradayRollup(a),
    'backfill-daemon':       (a) => commandBackfillDaemon(a),
    'cache-clean':           (a) => commandCacheClean(a),
    'clear-api-cache':       (a) => commandClearApiCache(a),
    universe:         (a) => commandUniverse(a),
    check:            (a) => commandValidate(a),
    // --- Backend (manifest: backend) ---
    backend:          (a) => commandBackend(a),
    // --- Research (manifest: research) ---
    bt:               (a) => commandBacktest(a),
    features:         (a) => commandIndicators(a),
    ml:               (a) => commandMl(a),
    models:           (a) => commandModelCompare(a),
    optimize:         (a) => commandOptimize(a),
    'edge-decay':     (a) => commandEdgeDecay(a),
    // --- Strategy (manifest: trade — sub-menu under Execution & Trading) ---
    strategy:         (a) => commandStrategyMenu(a),
    'prop-firms':     (a) => commandPropFirmMenu(a),
    // --- Trade (manifest: trade) ---
    trade:            (a) => commandTrade(a),
    alpaca:           (a) => commandTrade(a),
    mt5:              (a) => commandMt5(a),
    'add-platform':   (a) => commandAddPlatform(a),
    'auto-trade':     (a) => commandAutoTrade(a),
    agent:            (a) => commandAgent(a),
    polymarket:       (a) => commandPolymarket(a),
    bot:              (a) => commandBot(a),
    // --- Runner (manifest: trade — sub-menu under Execution & Trading) ---
    run:              (a) => commandRunnerMenu(a),
    // --- Settings (manifest: settings) ---
    settings:         (a) => commandSettings(a),
    // --- Account (manifest: account) ---
    login:            (a) => commandLogin(a),
    register:         (a) => commandRegister(a),
    logout:           () =>  commandLogout(),
    'auth-status':    () =>  commandAuthStatus(),
    // --- CLI-only aliases (not in TUI manifest) ---
    clean:            (a) => commandCacheClean(a),   // alias: cache-clean
    validate:         (a) => commandValidate(a),      // alias: check
    backtest:         (a) => commandBacktest(a),      // alias: bt
    indicators:       (a) => commandIndicators(a),    // alias: features
    quotes:           (a) => commandQuotes(a),
    'mt5-profile':    (a) => commandMt5Profile(a),
    'mt5-connect':    (a) => commandMt5Connect(a),
    'mt5-bridge':     (a) => commandMt5Bridge(a),
    prune:            (a) => commandPrune(a),
    'db-prune':       (a) => commandPrune(a),
    demo:             (a) => commandDemo(a),
    loc:              (a) => commandLoc(a),
    whoami:           () =>  commandAuthStatus(),     // alias: auth-status
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
  if (args.length > 0) {
    return await handleCommand(args);
  }

  // Persistent TUI menu loop when no args provided
  if (process.env.LEGACY_TUI !== '1' && process.stdin.isTTY) {
    const { spawnSync } = require('child_process');
    const path = require('path');
    console.clear();
    spawnSync('node', [path.join(__dirname, 'sovereign_dashboard.mjs')], { stdio: 'inherit' });
    return 0;
  }

  const { runInteractiveMenu, buildStatusLine } = utils;
  const { setAuthEmail, setStatusLine } = require('./tui/engine/engine.js');
  const authLib = require('./lib/auth');
  // TUI boot should stay local-only; expired auth refresh belongs to explicit auth flows.
  const user = await authLib.getAuthenticatedUser({ refreshExpired: false }).catch(() => null);
  if (user?.email) setAuthEmail(user.email);
  setStatusLine(buildStatusLine(user?.email || null));
  await runInteractiveMenu(handleCommand);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = Number.isInteger(code) ? code : 0;
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
  renderCockpit: require('./commands/operational/status.js').renderCockpit,
  currentPhaseLabel: utils.currentPhaseLabel,
  quoteProviderHeaderState: require('./commands/operational/status.js').quoteProviderHeaderState,
  cryptoLimitForWindow: require('./commands/research/research.js').cryptoLimitForWindow,
  filterCandlesByWindow: require('./commands/research/research.js').filterCandlesByWindow,
  historicalWindowFromArgs: require('./commands/research/research.js').historicalWindowFromArgs,
  buildCockpitModel: require('./commands/operational/status.js').buildCockpitModel,
  backtestDataQualityError: require('./commands/research/research.js').backtestDataQualityError,
};
