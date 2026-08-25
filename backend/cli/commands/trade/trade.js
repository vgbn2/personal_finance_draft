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
  stripFlagValue,
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
  authorizePolymarketLive,
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

function buildTradeArgsFromActionFlag(args) {
  if (!hasFlag(args, '--action')) return args;
  const action = optionValue(args, '--action', 'balance');
  let rest = args;
  for (const flag of ['--action', '--symbol', '--qty', '--order-type', '--price']) {
    rest = stripFlagValue(rest, flag);
  }
  if (action !== 'buy' && action !== 'sell') return [action, ...rest];

  const symbol = String(optionValue(args, '--symbol', '') || '').toUpperCase();
  const quantity = optionValue(args, '--qty', '1');
  const orderType = optionValue(args, '--order-type', 'market');
  const price = optionValue(args, '--price', '');
  const positional = [action, symbol, quantity, orderType];
  if (orderType === 'limit' && price) positional.push(price);
  return [...positional, ...rest];
}

/**
 * Handles the 'trade' command.
 */
async function commandTrade(args) {
  args = buildTradeArgsFromActionFlag(args);
  const subcommand = args[0];

  if (subcommand === 'positions') {
    try {
      const isLive = hasFlag(args, '--live');
      const isJson = hasFlag(args, '--json');
      const gatewayArgs = ['positions', ...(isLive ? ['--live'] : ['--paper-provider']), '--json'];
      const payload = runGatewayCommand(gatewayArgs);

      if (!payload || !payload.ok) {
        if (isJson) {
          console.log(JSON.stringify({ ok: false, error: payload?.error || 'Failed to fetch positions' }));
        } else {
          console.error(`[ERROR] ${payload?.error || 'Failed to fetch positions'}`);
        }
        return 1;
      }

      if (isJson) {
        console.log(JSON.stringify(payload, null, 2));
        return 0;
      }

      console.log('\n\x1b[1;36m=== ACTIVE POSITIONS & MULTI-STRATEGY ATTRIBUTION ===\x1b[0m\n');
      const positions = payload.positions || [];
      if (positions.length === 0) {
        console.log('No active positions held.');
        return 0;
      }

      for (const pos of positions) {
        const pnlColor = (pos.unrealizedPl >= 0) ? '\x1b[1;32m' : '\x1b[1;31m';
        const pnlSign = pos.unrealizedPl >= 0 ? '+' : '';
        console.log(`\x1b[1m${pos.symbol.padEnd(6)}\x1b[0m | Total Qty: \x1b[33m${pos.quantity}\x1b[0m | Avg: $${Number(pos.averagePrice).toFixed(2)} | Value: $${Number(pos.marketValue).toFixed(2)} | P&L: ${pnlColor}${pnlSign}$${Number(pos.unrealizedPl).toFixed(2)}\x1b[0m`);

        if (Array.isArray(pos.subPositions) && pos.subPositions.length > 0) {
          for (const sub of pos.subPositions) {
            const isManual = sub.source === 'manual';
            const tag = isManual ? '\x1b[1;35m[MANUAL]\x1b[0m' : `\x1b[1;34m[BOT:${sub.strategy_id}]\x1b[0m`;
            const dateStr = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'N/A';
            const subPnlColor = (sub.unrealizedPl >= 0) ? '\x1b[32m' : '\x1b[31m';
            const subPnlSign = sub.unrealizedPl >= 0 ? '+' : '';
            console.log(`  ├─ ${tag} Qty: ${sub.quantity} @ $${Number(sub.averagePrice).toFixed(2)} | Value: $${Number(sub.marketValue).toFixed(2)} | P&L: ${subPnlColor}${subPnlSign}$${Number(sub.unrealizedPl).toFixed(2)}\x1b[0m | Subm: ${dateStr}`);
          }
        }
        console.log('');
      }
      return 0;
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      return 1;
    }
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

  // The PIN is consumed by the local gate and must not be exposed in child argv.
  const launch = buildTradeGatewayLaunch(stripFlagValue(args, '--pin'), {
    env: hasFlag(args, '--live') ? { SOVEREIGN_EXECUTION_AUTHORIZED: 'true' } : {},
  });
  const result = spawnSync(launch.command, launch.args, {
    cwd: utils.REPO_ROOT,
    stdio: 'inherit',
    shell: launch.shell ?? false,
    env: launch.env,
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

/**
 * Handles the 'bot' command — thin shell into the gateway bot commands.
 */
async function commandBot(args) {
  const sub = args[0] || 'status';
  const submitsOrder = sub === 'cycle' || sub === 'run' || sub === 'sell';
  if (submitsOrder && process.env.LIVE_TRADING === 'true' && !hasFlag(args, '--live')) {
    printPayload({
      ok: false,
      reason: 'Live Polymarket bot execution requires explicit --live authorization',
    }, args);
    return 1;
  }
  if (sub === 'cycle' || sub === 'run') {
    const gate = featureGate('bot_autopilot', { surface: `Bot ${sub}` });
    if (!gate.ok) {
      printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
      return 1;
    }
    const polymarketGate = featureGate('polymarket', { surface: `Bot ${sub}` });
    if (!polymarketGate.ok) {
      printPayload({ ok: false, type: 'feature_gate', feature_flag: polymarketGate.flag, reason: polymarketGate.reason, hint: polymarketGate.hint }, args);
      return 1;
    }
  }
  let liveAuthorized = false;
  if (hasFlag(args, '--live')) {
    if (!(await authorizePolymarketLive(args, 'Polymarket bot live trading'))) return 1;
    liveAuthorized = true;
  }
  const gatewayArgs = ['bot', sub, ...args.slice(1)];
  if (hasFlag(args, '--json')) gatewayArgs.push('--json');
  const launch = buildTradeGatewayLaunch(gatewayArgs, {
    env: liveAuthorized ? { SOVEREIGN_EXECUTION_AUTHORIZED: 'true' } : {},
  });
  const result = spawnSync(launch.command, launch.args, {
    cwd: utils.REPO_ROOT,
    stdio: 'inherit',
    shell: launch.shell ?? false,
    env: launch.env,
  });
  return result.status ?? 0;
}

module.exports = {
  buildPolymarketActionChoices,
  buildPolymarketCategoryChoices,
  buildPolymarketMarketChoices,
  buildTokenChoicePrompt,
  buildTradeArgsFromActionFlag,
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
