const path = require('node:path');
const A = require('#shared/ui/ansi');
const { verifyPin, requireAuth } = require('../../lib/auth.js');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const utils = require('../../lib/utils.js');
const { pickAssets } = require('../../tui/asset_picker');
const { canLiveExecute, getRuntimeMode } = require('../../../../shared/lib/brokers/capabilities');
const { featureGate } = require('../../../../shared/lib/settings/runtime');
const { loadSettings } = require('../../../../shared/lib/settings/user_settings');
const { runGatewayCommand, buildTradeGatewayLaunch } = require('../../../../shared/lib/runtime/backend_bridge');
const {
  pageText,
  promptSelect,
  promptText,
  promptConfirm,
  isRichTerminal,
  currentPhaseLabel,
  hasFlag,
  optionValue,
  numericOption,
  printPayload,
} = utils;

// buildTradeGatewayLaunch is imported from shared/lib/runtime/backend_bridge (canonical location)

const tradePolymarket = require('./trade_polymarket.js');
const {
  polymarketHistoryPayload,
  runPolymarketArchiveIngest,
  buildPolymarketActionChoices,
  buildPolymarketCategoryChoices,
  buildPolymarketMarketChoices,
  buildTokenChoicePrompt,
  commandPolymarket,
  deriveDefaultBuyPriceFromBook,
  fetchPolymarketOrderbookSnapshot,
  fetchPolymarketPriceHistorySnapshot,
  formatCompactVolume,
  hasPolymarketOrderbookDepth,
  minOrderSizeFromBook,
  normalizeLimitPriceInput,
  normalizePolymarketBookSide,
  parseGatewayJsonOutput,
  resolveOutcomeToken,
  truncateLabel,
  promptPolymarketMarketBrowser,
  renderPolymarketMarketDetails,
  renderPolymarketOrderbookDetails,
  renderPolymarketPriceHistoryDetails,
  submitPolymarketBuyOrder,
} = tradePolymarket;

const {
  maskLogin,
  inspectMt5Setup,
  renderMt5Diagnostics,
  renderMt5ProfileList,
  commandMt5,
  commandAddPlatform,
  commandMt5Profile,
  commandMt5Doctor,
  commandMt5Connect,
  commandMt5Bridge,
} = require('./trade_mt5.js');

/**
 * Returns the help text for the Trade Desk.
 */
function tradeDeskText() {
  return [
    A.B_CYAN + 'Sovereign Trade Desk' + A.RESET,
    A.GRAY + '='.repeat(72) + A.RESET,
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
 * Fetches the current portfolio balance from the gateway.
 */
async function fetchBalance(live = false) {
  const payload = runGatewayCommand(['balance', ...(live ? ['--live'] : []), '--json']);
  if (!payload.ok) {
    throw new Error(payload.error || 'Failed to fetch balance');
  }
  return payload;
}

function currentFavoriteSymbols() {
  try {
    const settings = loadSettings();
    return Array.isArray(settings.favorite_symbols) ? settings.favorite_symbols : [];
  } catch {
    return [];
  }
}

function renderFavoriteSymbolsList(symbols = []) {
  return [
    A.B_CYAN + 'Favourite Symbols' + A.RESET,
    A.GRAY + '='.repeat(72) + A.RESET,
    ...(symbols.length
      ? symbols.map((symbol, index) => `  ${String(index + 1).padStart(2, '0')}. ${symbol}`)
      : ['  No favourite symbols saved yet.']),
  ].join('\n');
}

async function promptTradeSymbol() {
  const favorites = currentFavoriteSymbols();
  if (!isRichTerminal()) {
    const fallback = favorites[0] || 'AAPL';
    return String(await promptText('Symbol:', fallback)).toUpperCase();
  }

  const selected = await pickAssets({
    label: 'Trade desk symbol',
    prompt: 'Select symbol:',
    favoriteSymbols: favorites,
  });
  return selected ? String(selected).toUpperCase() : null;
}

/**
 * Fetches the aggregated multi-broker portfolio from the gateway.
 */
async function fetchAggregatePortfolio() {
  const payload = runGatewayCommand(['aggregate_portfolio', '--json']);
  if (!payload.ok) {
    throw new Error(payload.error || 'Failed to fetch aggregated portfolio');
  }
  return payload;
}

/**
 * Interactively prompts for trade arguments.
 */
async function promptTradeDeskArgs() {
  global.suppressLogs = true;
  process.stdout.write(A.CLR_ALL + A.HOME);

  while (true) {
    const action = await promptSelect('Trade desk action:', [
      { label: 'Balance snapshot', value: 'balance' },
      { label: 'Aggregate Portfolio (Live / Live-Paper / Paper)', value: 'aggregate_portfolio' },
      { label: 'Favourite symbols', value: 'favorites' },
      { label: 'Buy order', value: 'buy' },
      { label: 'Sell order', value: 'sell' },
      { label: 'Process proposed orders file', value: 'process' },
      { label: 'Cancel', value: 'cancel' },
    ]);

    global.suppressLogs = false;

    if (action === 'cancel') {
      return null;
    }
    if (action === 'favorites') {
      const favorites = currentFavoriteSymbols();
      console.log([
        '',
        A.BOLD + 'Favourite Symbols' + A.RESET,
        A.GRAY + '='.repeat(72) + A.RESET,
        ...(favorites.length
          ? favorites.map((symbol, index) => `  ${String(index + 1).padStart(2, '0')}. ${symbol}`)
          : ['  No favourite symbols saved yet.']),
        '',
      ].join('\n'));
      continue;
    }
    if (action === 'balance' || action === 'aggregate_portfolio') {
      return [action];
    }
    if (action === 'process') {
      const filePath = await promptText('Orders file path:', 'proposed_orders.json');
      const live = await promptConfirm('Execute live orders from file?');
      return ['process', filePath, ...(live ? ['--live'] : [])];
    }

    const symbol = await promptTradeSymbol();
    if (!symbol) {
      return null;
    }
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
      A.BOLD + 'Order Preview' + A.RESET,
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
}

/**
 * Handles the 'trade' command.
 */
async function commandTrade(args) {
  const subcommand = args[0];

  if (subcommand === 'favorites') {
    const favorites = currentFavoriteSymbols();
    pageText(renderFavoriteSymbolsList(favorites), args);
    return 0;
  }

  if (subcommand === 'balance' && hasFlag(args, '--json')) {
      try {
          const balance = await fetchBalance(hasFlag(args, '--live'));
          console.log(JSON.stringify(balance, null, 2));
          return 0;
      } catch (err) {
          console.error(`[ERROR] ${err.message}`);
          return 1;
      }
  }

  if (subcommand === 'aggregate_portfolio' && hasFlag(args, '--json')) {
    try {
        const portfolio = await fetchAggregatePortfolio();
        console.log(JSON.stringify(portfolio, null, 2));
        return 0;
    } catch (err) {
        console.error(`[ERROR] ${err.message}`);
        return 1;
    }
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

  if (hasFlag(args, '--live')) {
    const brokerName = subcommand === 'polymarket' ? 'polymarket' : (subcommand === 'mt5' ? 'mt5' : 'alpaca');
    const liveGate = canLiveExecute(brokerName);
    if (!liveGate.ok) {
      printPayload({
        ok: false,
        broker: brokerName,
        runtime_mode: getRuntimeMode(),
        reason: liveGate.reason,
      }, args);
      console.error(`${A.B_RED}[ERROR] ${liveGate.reason}.${A.RESET}`);
      return 1;
    }
    if (!(await requireAuth('live trading'))) return 1;
  }


  if (hasFlag(args, '--live')) {
    const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
    const providedPin = optionValue(args, '--pin', null);

    if (expectedPin) {
      let inputPin = providedPin;

      // If no PIN provided via flag and we have a terminal, prompt for it
      if (!inputPin && isRichTerminal()) {
        inputPin = await promptText('Enter Trade PIN to confirm LIVE execution:', '');
      }

      if (!verifyPin(inputPin, expectedPin)) {
        console.error(`${A.B_RED}[ERROR] Invalid or missing Trade PIN. LIVE execution blocked.${A.RESET}`);
        if (!isRichTerminal() && !providedPin) {
            console.error(`${A.GRAY}(Tip: For automated execution, set SOVEREIGN_TRADE_PIN and pass --pin <val> or ensure the environment is trusted.)${A.RESET}`);
        }
        return 1;
      }
      console.log(`${A.B_GREEN}[AUTH] PIN verified. Proceeding with LIVE trade...${A.RESET}`);
    } else {
      if (isRichTerminal()) {
        console.warn(`${A.B_YELLOW}[WARNING] SOVEREIGN_TRADE_PIN not set. LIVE trade proceeding without MFA gate.${A.RESET}`);
        const finalProceed = await promptConfirm('Confirm LIVE execution WITHOUT PIN?');
        if (!finalProceed) return 0;
      } else {
        // In non-interactive mode without a PIN set, we FAIL CLOSED for safety.
        console.error(`${A.B_RED}[ERROR] SOVEREIGN_TRADE_PIN not set. Unattended LIVE execution blocked (Fail-Closed).${A.RESET}`);
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

/**
 * Auto-trade execution loop. Delegates to strategy automation engine.
 * Belongs in Execution, not Strategy Management.
 */
async function commandAutoTrade(args) {
  const gate = featureGate('ai_agent_trading', { surface: 'Auto-trade loop' });
  if (!gate.ok) {
    printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
    return 1;
  }
  const { runAutomatedStrategies } = require('../strategy/strategy.js');
  return runAutomatedStrategies(args);
}

async function commandAgent(args) {
  const gate = featureGate('multi_agent_research', { surface: 'AI agent' });
  if (!gate.ok) {
    printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
    return 1;
  }
  const { agentLoop } = require('#shared/mcp/agent');
  const available = await (async () => {
    try { const { isAvailable: check } = require('#shared/ai/ai_client'); return check(); }
    catch { return false; }
  })();

  if (!available) {
    printPayload({ error: 'Ollama is not running. Start it from the system tray or run: ollama serve' }, args);
    return 1;
  }

  const query = args.filter(a => !a.startsWith('--')).join(' ').trim()
    || await promptText('What do you want the agent to do?', '');

  if (!query) return 0;

  process.stdout.write(`\n[AGENT] Task: ${query}\n`);
  const result = await agentLoop(query);
  printPayload(result, args);
  return result.status === 'ok' ? 0 : 1;
}

async function promptBotArgs() {
  global.suppressLogs = true;
  process.stdout.write(A.CLR_ALL + A.HOME);

  while (true) {
    const action = await promptSelect('Edge Trader Bot action:', [
      { label: 'Health Check (credentials, API, balance)', value: 'health' },
      { label: 'Status', value: 'status' },
      { label: 'Run Cycle (single iteration)', value: 'cycle' },
      { label: 'Start Loop (continuous)', value: 'run' },
      { label: 'Enable Bot', value: 'enable' },
      { label: 'Disable Bot', value: 'disable' },
      { label: 'View / Edit Config', value: 'config' },
      { label: 'Back', value: 'back' },
    ]);

    global.suppressLogs = false;

    if (action === 'back') return null;

    if (action === 'enable') return ['config', '--key', 'enabled', '--value', 'true'];
    if (action === 'disable') return ['config', '--key', 'enabled', '--value', 'false'];
    
    if (action === 'config') {
      const key = await promptText('Config key (e.g. minEdgeThreshold):', '');
      if (!key) continue;
      const val = await promptText(`New value for ${key}:`, '');
      return ['config', '--key', key, '--value', val];
    }

    if (action === 'cycle' || action === 'run') {
      let intervalArgs = [];
      if (action === 'run') {
        const interval = await promptText('Interval (minutes):', '15');
        intervalArgs = ['--interval', interval];
      }
      const live = await promptConfirm('EXECUTE LIVE TRADES?');
      return [action, ...intervalArgs, ...(live ? ['--live'] : [])];
    }

    return [action];
  }
}

/**
 * Handles the 'bot' command — thin shell into the gateway bot commands.
 */
async function commandBot(args) {
  if (args.length === 0 && isRichTerminal()) {
    const promptedArgs = await promptBotArgs();
    if (!promptedArgs) {
      console.log('Bot menu cancelled.');
      return 0;
    }
    args = promptedArgs;
  }
  const sub = args[0] || 'status';
  if (sub === 'cycle' || sub === 'run') {
    const gate = featureGate('bot_autopilot', { surface: `Bot ${sub}` });
    if (!gate.ok) {
      printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
      return 1;
    }
  }
  if (hasFlag(args, '--live')) {
    const liveGate = canLiveExecute('alpaca');
    if (!liveGate.ok) {
      printPayload({
        ok: false,
        broker: 'alpaca',
        runtime_mode: getRuntimeMode(),
        reason: liveGate.reason,
      }, args);
      console.error(`${A.B_RED}[ERROR] ${liveGate.reason}.${A.RESET}`);
      return 1;
    }
    if (!(await requireAuth('bot live trading'))) return 1;
  }
  const gatewayArgs = ['bot', sub, ...args.slice(1)];
  if (hasFlag(args, '--json')) gatewayArgs.push('--json');
  const launch = buildTradeGatewayLaunch(gatewayArgs);
  const result = spawnSync(launch.command, launch.args, {
    cwd: utils.REPO_ROOT,
    stdio: 'inherit',
    shell: launch.shell ?? false,
  });
  return result.status ?? 0;
}

module.exports = {
  buildPolymarketActionChoices,
  buildPolymarketCategoryChoices,
  buildPolymarketMarketChoices,
  buildTokenChoicePrompt,
  buildTradeGatewayLaunch,
  commandAddPlatform,
  commandAgent,
  commandAutoTrade,
  commandMt5,
  commandMt5Doctor,
  commandMt5Bridge,
  commandMt5Connect,
  commandMt5Profile,
  commandBot,
  commandPolymarket,
  runPolymarketArchiveIngest,
  polymarketHistoryPayload,
  commandTrade,
  inspectMt5Setup,
  fetchBalance,
  fetchAggregatePortfolio,
  fetchPolymarketOrderbookSnapshot,
  fetchPolymarketPriceHistorySnapshot,
  formatCompactVolume,
  parseGatewayJsonOutput,
  deriveDefaultBuyPriceFromBook,
  hasPolymarketOrderbookDepth,
  minOrderSizeFromBook,
  normalizeLimitPriceInput,
  normalizePolymarketBookSide,
  promptTradeDeskArgs,
  promptPolymarketMarketBrowser,
  resolveOutcomeToken,
  renderMt5Diagnostics,
  renderMt5ProfileList,
  renderPolymarketMarketDetails,
  renderPolymarketOrderbookDetails,
  renderPolymarketPriceHistoryDetails,
  submitPolymarketBuyOrder,
  tradeDeskText,
};
