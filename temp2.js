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