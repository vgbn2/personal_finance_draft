const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const utils = require('../lib/utils.js');
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
  const gatewayPath = path.join(utils.REPO_ROOT, 'execution_gateway', 'src', 'index.ts');
  const tsxCandidates = [
    path.join(utils.REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
    path.join(utils.REPO_ROOT, 'web_page', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'),
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
  return { command: 'npx', args: ['tsx', gatewayPath, ...args], shell: false };
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
    { label: 'Buy order', value: 'buy' },
    { label: 'Sell order', value: 'sell' },
    { label: 'Process proposed orders file', value: 'process' },
    { label: 'Cancel', value: 'cancel' },
  ]);

  global.suppressLogs = false;

  if (action === 'cancel') {
    return null;
  }
  if (action === 'balance') {
    return ['balance'];
  }
  if (action === 'process') {
    const filePath = await promptText('Orders file path:', 'proposed_orders.json');
    const live = await promptConfirm('Execute live orders from file?');
    return ['process', filePath, ...(live ? ['--live'] : [])];
  }

  const symbol = String(await promptText('Symbol:', 'AAPL')).toUpperCase();
  const qty = await promptText('Quantity:', '1');
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

  // MFA Safety Gate for Live Trades
  if (hasFlag(args, '--live')) {
    const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
    if (expectedPin) {
      const inputPin = await promptText('Enter Trade PIN to confirm LIVE execution:', '');
      if (inputPin !== expectedPin) {
        console.error('\x1b[1;31m[ERROR] Invalid Trade PIN. LIVE execution blocked.\x1b[0m');
        return 1;
      }
      console.log('\x1b[1;32m[AUTH] PIN verified. Proceeding with LIVE trade...\x1b[0m');
    } else {
      console.warn('\x1b[1;33m[WARNING] SOVEREIGN_TRADE_PIN not set. LIVE trade proceeding without MFA gate.\x1b[0m');
      const finalProceed = await promptConfirm('Confirm LIVE execution WITHOUT PIN?');
      if (!finalProceed) return 0;
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
