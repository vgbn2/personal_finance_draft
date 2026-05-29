const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { calculateRollingFeatureFrame, DEFAULT_PERIODS } = require('../../../shared/lib/indicators');
const { readSnapshot, validateSnapshot } = require('../../../shared/lib/market_validation');
const utils = require('../lib/utils.js');
const { DEFAULT_SNAPSHOT } = utils;
const { 
  pageText, 
  promptSelect, 
  promptText, 
  promptConfirm, 
  isRichTerminal, 
  currentPhaseLabel,
  hasFlag 
} = utils;

/**
 * Builds the launch configuration for the execution gateway.
 * @param {string[]} args Command line arguments.
 * @returns {object} Launch object with command and args.
 */
function buildTradeGatewayLaunch(args = []) {
  const gatewayPath = path.join(utils.REPO_ROOT, 'backend', 'gateway', 'src', 'index.ts');
  const tsxCandidates = [
    path.join(utils.REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
    path.join(utils.REPO_ROOT, 'backend', 'gateway', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
  ];
  const tsxPath = tsxCandidates.find((candidate) => fs.existsSync(candidate));
  if (tsxPath) {
    if (process.platform === 'win32' && tsxPath.toLowerCase().endsWith('.cmd')) {
      const quoteForPowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
      return { 
        command: 'powershell.exe', 
        args: ['-NoProfile', '-Command', `& ${[tsxPath, gatewayPath, ...args].map(quoteForPowerShell).join(' ')}`],
        shell: false
      };
    }
    return { command: tsxPath, args: [gatewayPath, ...args], shell: false };
  }
  return { 
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx', 
    args: ['tsx', gatewayPath, ...args], 
    shell: process.platform === 'win32' 
  };
}

/**
 * Returns the help text for the Trade Desk.
 */
function tradeDeskText() {
  return [
    '\x1b[1;36mSovereign Trade Desk\x1b[0m',
    '\x1b[90m' + '='.repeat(72) + '\x1b[0m',
    `  Phase: ${currentPhaseLabel()}`,
    '  Mode: dry-run by default; use --live only when you mean it',
    '  Actions: balance | buy | sell | process',
    '  Tip: plain `trade` opens the guided desk on an interactive terminal',
    '',
    '  Examples:',
    '    trade balance',
    '    trade buy    AAPL 10 market',
    '    trade sell TSLA 5 limit 180 --live',
    '    trade process proposed_orders.json',
  ].join('\n');
}

/**
 * Interactively prompts for trade arguments.
 */
async function promptTradeDeskArgs() {
  global.suppressLogs = true;
  process.stdout.write('\x1b[2J\x1b[0;0H');

  const action = await promptSelect('Trade desk action:', [
    { label: 'Balance snapshot', value: 'balance' },
    { label: 'Aggregate Live & Paper Portfolio', value: 'aggregate_portfolio' },
    { label: 'Buy order', value: 'buy' },
    { label: 'Sell order', value: 'sell' },
    { label: 'Process proposed orders file', value: 'process' },
    { label: 'Cancel', value: 'cancel' },
  ]);

  global.suppressLogs = false;

  if (action === 'cancel') {
    return null;
  }
  if (action === 'balance' || action === 'aggregate_portfolio') {
    return [action];
  }
  if (action === 'visualize') {
    const symbol = String(await promptText('Symbol to visualize:', 'AAPL')).toUpperCase();
    return ['visualize', symbol];
  }
  if (action === 'process') {
    const filePath = await promptText('Orders file path:', 'proposed_orders.json');
    const live = await promptConfirm('Execute live orders from file?');
    return ['process', filePath, ...(live ? ['--live'] : [])];
  }

  const symbol = String(await promptText('Symbol:', 'AAPL')).toUpperCase();
  const sizingMode = await promptSelect('Sizing mode:', [
    { label: 'Specify Quantity', value: 'qty' },
    { label: 'Specify USD Amount', value: 'usd' },
  ]);
  
  let qty;
  if (sizingMode === 'qty') {
    qty = await promptText('Quantity:', '1');
  } else {
    const usd = await promptText('USD amount:', '1000');
    // Simplified logic: calculate rough quantity from amount / dummy price
    // A better approach would be to fetch real price if possible
    qty = `amount:${usd}`; 
  }

  const orderType = await promptSelect('Order type:', [
    { label: 'Market', value: 'market' },
    { label: 'Limit', value: 'limit' },
  ]);
  const commandArgs = [action, symbol, qty, orderType];
  if (orderType === 'limit') {
    const price = await promptText('Limit price:', '');
    if (price) {
      commandArgs.push(price);
    }
  }
  const live = await promptConfirm('Execute live order?');
  console.log([
    '',
    '\x1b[1mOrder Preview\x1b[0m',
    `  side=${action}`,
    `  symbol=${symbol}`,
    `  qty=${qty}`,
    `  type=${orderType}`,
    ...(orderType === 'limit' && commandArgs[4] ? [`  price=${commandArgs[4]}`] : []),
    `  mode=${live ? 'LIVE' : 'DRY-RUN'}`,
    '',
  ].join('\n'));
  const proceed = await promptConfirm('Send this order to the gateway?');
  if (!proceed) {
    return null;
  }
  if (live) {
    commandArgs.push('--live');
  }
  return commandArgs;
}

/**
 * Handles the 'trade' command.
 */
async function commandTrade(args) {
  const subcommand = args[0];
  
  if (subcommand === 'visualize') {
    const symbol = args[1] || 'AAPL';
    console.log(`\n\x1b[1;36mVisualizing Sigma Bands for ${symbol}\x1b[0m`);
    
    // Load real data
    const snapshot = readSnapshot(DEFAULT_SNAPSHOT);
    const sources = snapshot.sources.filter(s => s.symbol === symbol);
    
    if (sources.length < 20) {
        console.error(`\x1b[1;31m[ERROR] Insufficient data for ${symbol} (found ${sources.length} bars, need 20+)\x1b[0m`);
        return 1;
    }

    const periods = { ...DEFAULT_PERIODS, volatility: 20 };
    const featureFrame = calculateRollingFeatureFrame(sources, 2, periods);
    
    if (!featureFrame.features || featureFrame.features.length === 0) {
        console.error(`\x1b[1;31m[ERROR] Failed to calculate features for ${symbol}.\x1b[0m`);
        return 1;
    }

    const latest = featureFrame.features[featureFrame.features.length - 1];
    const currentPrice = latest.close;
    // Feature frame volatility is often annualized or pct, we need the raw stddev of price.
    // For now, we'll calculate a simple window mean/stddev here to be precise for the chart.
    const window = sources.slice(-20).map(s => s.close);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const stddev = Math.sqrt(window.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / window.length);
    
    const { renderSigmaSparkline } = require('../tui');
    console.log(`Current: ${currentPrice.toFixed(2)} | Mean: ${mean.toFixed(2)} | StdDev: ${stddev.toFixed(2)}`);
    console.log(renderSigmaSparkline(mean, stddev, currentPrice));
    return 0;
  }

  if (args.length === 0) {
    pageText(tradeDeskText(), []);
    if (!isRichTerminal()) {
      return 0;
    }
    const promptedArgs = await promptTradeDeskArgs();
    if (!promptedArgs) {
      console.log('Trade desk cancelled.');
      return 0;
    }
    args = promptedArgs;
  }

  // [gemini-work] Enhanced security gate for LIVE trades with automation support
  if (hasFlag(args, '--live')) {
    const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
    const providedPin = optionValue(args, '--pin', null);
    
    if (expectedPin) {
      let inputPin = providedPin;
      
      // If no PIN provided via flag and we have a terminal, prompt for it
      if (!inputPin && isRichTerminal()) {
        inputPin = await promptText('Enter Trade PIN to confirm LIVE execution:', '');
      }
      
      if (inputPin !== expectedPin) {
        console.error('\x1b[1;31m[ERROR] Invalid or missing Trade PIN. LIVE execution blocked.\x1b[0m');
        if (!isRichTerminal() && !providedPin) {
            console.error('\x1b[90m(Tip: For automated execution, set SOVEREIGN_TRADE_PIN and pass --pin <val> or ensure the environment is trusted.)\x1b[0m');
        }
        return 1;
      }
      console.log('\x1b[1;32m[AUTH] PIN verified. Proceeding with LIVE trade...\x1b[0m');
    } else {
      if (isRichTerminal()) {
        console.warn('\x1b[1;33m[WARNING] SOVEREIGN_TRADE_PIN not set. LIVE trade proceeding without MFA gate.\x1b[0m');
        const finalProceed = await promptConfirm('Confirm LIVE execution WITHOUT PIN?');
        if (!finalProceed) return 0;
      } else {
        // In non-interactive mode without a PIN set, we FAIL CLOSED for safety.
        console.error('\x1b[1;31m[ERROR] SOVEREIGN_TRADE_PIN not set. Unattended LIVE execution blocked (Fail-Closed).\x1b[0m');
        return 1;
      }
    }
  }

  const launch = buildTradeGatewayLaunch(args);
  const result = spawnSync(launch.command, launch.args, {
    cwd: utils.REPO_ROOT,
    stdio: 'inherit',
    shell: launch.shell ?? false,
  });
  if (result.error) {
    console.error(`Trade gateway failed to start: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 0;
}

module.exports = {
  buildTradeGatewayLaunch,
  commandTrade,
  promptTradeDeskArgs,
  tradeDeskText
};
