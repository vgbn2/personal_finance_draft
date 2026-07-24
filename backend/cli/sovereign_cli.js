#!/usr/bin/env node

require('#shared/runtime/env');
global.suppressLogs = false;
const utils = require('./lib/utils.js');
const { pageText, helpText, printPayload, logger } = utils;

const { commandStatus, commandCockpit } = require('./commands/operational/status.js');
const { commandPortfolioMonitor } = require('./commands/operational/portfolio_monitor.js');
const { commandRemote } = require('./commands/operational/remote.js');
const { commandSetup, commandDoctor } = require('./commands/operational/setup.js');
const { commandBackend } = require('./commands/tools/backend.js');
const { commandQuotes } = require('./commands/quotes/quotes.js');
const { commandStrategyMenu, commandPropFirmMenu } = require('./commands/strategy/strategy.js');
const { commandBacktest, commandOptimize, commandEdgeDecay, commandDemo, commandIndicators, commandModelCompare } = require('./commands/research/research.js');
const { commandWatch, commandIngest, commandBackfill, commandMassBackfill, commandCacheClean, commandClearApiCache, commandValidate, commandPrune, commandLoc, commandUniverse, commandCryptoDeepBackfill, commandEquityDeepBackfill, commandFiveMinAccumulate, commandIntradayAccumulate, commandIntradayRollup } = require('./commands/data/data.js');
const { commandBackfillDaemon, commandStopBackfillDaemon } = require('./commands/data/backfill_daemon.js');
const { commandTrade, buildTradeGatewayLaunch, commandMt5, commandMt5Profile, commandMt5Connect, commandMt5Bridge, commandAutoTrade, commandAddPlatform, commandAgent, commandPolymarket, commandBot } = require('./commands/trade/trade.js');
const { commandLogin, commandRegister, commandLogout, commandAuthStatus } = require('./commands/account/auth.js');
const { commandSettings } = require('./commands/settings/settings.js');
const { commandRunnerMenu } = require('./commands/runner/run.js');
const { commandMl } = require('./commands/research/ml.js');
const { commandBias } = require('./commands/research/bias.js');
const { commandScorecard } = require('./commands/research/scorecard.js');
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
    remote:           (a) => commandRemote(a),
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
    'stop-backfill-daemon':  (a) => commandStopBackfillDaemon(a),
    'portfolio-monitor':     (a) => commandPortfolioMonitor(a),
    'cache-clean':           (a) => commandCacheClean(a),
    'clear-api-cache':       (a) => commandClearApiCache(a),
    universe:         (a) => commandUniverse(a),
    check:            (a) => commandValidate(a),
    // --- Backend (manifest: backend) ---
    backend:          (a) => commandBackend(a),
    // --- Research (manifest: research) ---
    bias:             (a) => commandBias(a),
    scorecard:        (a) => commandScorecard(a),
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

// An EventEmitter that emits 'error' with zero listeners throws synchronously
// and crashes the process -- bypassing async/await rejection handling
// entirely, so no try/catch around a prompt call site can catch this class
// of failure. The dashboard spawns every interactive command (login/register/
// mt5/etc., see sovereign_dashboard.mjs's INTERACTIVE_CMDS) as a child with
// stdio:'inherit'; Windows ConPTY + inherited stdio + repeated raw-mode
// toggling (every masked-password prompt flips setRawMode true/false) is a
// real-world source of a transient stdin transport error. One guard here
// covers every prompt call site in the whole CLI, since they all share this
// one process's process.stdin.
function installStdinErrorGuard() {
  process.stdin.on('error', (err) => {
    console.error(`\n✖ stdin error: ${err && err.message ? err.message : err}`);
  });
}

// The real legacy TUI: the pre-Ink prompt-based menu (tui/engine.js's
// runInteractiveMenu), distinct from sovereign_dashboard.mjs's grid+chat
// renderer -- this is what `LEGACY_TUI=1` and Settings > Layout > legacy
// both point to.
async function runLegacyMenu() {
  const { runInteractiveMenu, buildStatusLine } = utils;
  const { setAuthEmail, setStatusLine } = require('./tui/engine/engine.js');
  const authLib = require('./lib/auth');
  // TUI boot should stay local-only; expired auth refresh belongs to explicit auth flows.
  const user = await authLib.getAuthenticatedUser({ refreshExpired: false }).catch(() => null);
  if (user?.email) setAuthEmail(user.email);
  setStatusLine(buildStatusLine(user?.email || null));
  await runInteractiveMenu(handleCommand);
}

async function main() {
  installStdinErrorGuard();
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return await handleCommand(args);
  }

  const { loadSettings } = require('../../shared/lib/settings/user_settings.js');
  const isLegacyLayout = () => process.env.LEGACY_TUI === '1' || loadSettings().layout === 'legacy';

  if (!process.stdin.isTTY) {
    // No menu to loop without a real TTY (CI, piped stdin) -- same
    // single-shot fallback as before this engine-switch loop existed.
    await runLegacyMenu();
    return 0;
  }

  // Persistent TUI loop: whichever engine is "current" runs until the user
  // either quits it outright (dashboard 'q'/Ctrl+C just lets the child
  // process end naturally; the legacy menu's Exit/Ctrl+C call process.exit
  // directly, bypassing this loop) or switches Settings > Layout to the
  // other engine's side -- the dashboard self-exits on "legacy"
  // (sovereign_dashboard.mjs's handleRun), the legacy menu returns on
  // anything else (engine.js's runInteractiveMenu).
  //
  // Neither exit path is tagged "I switched engines" vs "I just quit" --
  // both look identical from here (the child process simply ends). So the
  // loop only re-launches the other engine when the persisted layout value
  // actually changed during that run; if it's unchanged, the user quit
  // normally and this returns, ending the whole CLI process same as before
  // this loop existed.
  let lastLayout = loadSettings().layout;
  for (;;) {
    if (isLegacyLayout()) {
      await runLegacyMenu();
    } else {
      const { spawnSync } = require('child_process');
      const path = require('path');
      console.clear();
      spawnSync('node', [path.join(__dirname, 'sovereign_dashboard.mjs')], { stdio: 'inherit' });
    }
    const currentLayout = loadSettings().layout;
    if (currentLayout === lastLayout) return 0;
    lastLayout = currentLayout;
  }
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
