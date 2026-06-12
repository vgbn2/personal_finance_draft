const path = require('node:path');
const A = require('#shared/ansi');
const { verifyPin, requireAuth } = require('../../lib/auth.js');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { ingestMarketData } = require('../../../scripts/data_ops/ingest_market_data.js');
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

function maskLogin(login) {
  const text = String(login || '').trim();
  if (!text) return 'n/a';
  if (text.length <= 4) return '*'.repeat(text.length);
  return text.replace(/^(.{2}).*(.{2})$/, '$1***$2');
}

function inspectMt5Setup(slot, profile, terminalPath, bridgeInstalled) {
  const checks = [
    {
      key: 'profile',
      ok: Boolean(profile),
      label: 'Saved profile',
      detail: profile ? `${profile.label || slot} | ${profile.server || 'server missing'}` : 'No saved MT5 profile for this slot',
    },
    {
      key: 'login',
      ok: Boolean(profile && profile.login),
      label: 'Login ID',
      detail: profile && profile.login ? maskLogin(profile.login) : 'Missing login ID',
    },
    {
      key: 'server',
      ok: Boolean(profile && profile.server),
      label: 'Server',
      detail: profile && profile.server ? profile.server : 'Missing MT5 server',
    },
    {
      key: 'password',
      ok: Boolean(profile && profile.has_password),
      label: 'Password',
      detail: profile && profile.has_password ? 'Encrypted secret stored' : 'No encrypted password saved',
    },
    {
      key: 'terminal',
      ok: Boolean(terminalPath && fs.existsSync(terminalPath)),
      label: 'Terminal',
      detail: terminalPath && fs.existsSync(terminalPath)
        ? terminalPath
        : 'terminal64.exe not found; set SOVEREIGN_MT5_TERMINAL_PATH or save terminal_path in the profile',
    },
    {
      key: 'bridge',
      ok: Boolean(bridgeInstalled),
      label: 'EA bridge installer',
      detail: bridgeInstalled
        ? path.join(utils.REPO_ROOT, 'backend', 'scripts', 'verification', 'mt5_bridge_install.js')
        : 'Bridge installer script is missing',
    },
  ];

  const ready = checks.every((check) => check.ok);
  const failing = checks.filter((check) => !check.ok).map((check) => check.label);
  return {
    ok: ready,
    type: 'mt5_diagnostics',
    slot,
    login: profile && profile.login ? maskLogin(profile.login) : null,
    server: profile && profile.server ? profile.server : null,
    terminal: terminalPath || '',
    checks,
    next_action: ready
      ? 'Run `sovereign mt5 connect --slot <slot>` to launch MetaTrader with this profile.'
      : `Fix: ${failing.join(', ')}`,
  };
}

function renderMt5Diagnostics(report) {
  const lines = [
    A.B_CYAN + 'MT5 Doctor' + A.RESET,
    A.GRAY + '='.repeat(72) + A.RESET,
    `  Slot: ${report.slot || 'n/a'}`,
  ];
  if (report.login) lines.push(`  Login: ${report.login}`);
  if (report.server) lines.push(`  Server: ${report.server}`);
  lines.push('');
  report.checks.forEach((check) => {
    const status = check.ok ? A.GREEN + 'OK' + A.RESET : A.RED + 'FAIL' + A.RESET;
    lines.push(`  [${status}] ${check.label}`);
    lines.push(`      ${check.detail}`);
  });
  lines.push('');
  lines.push(`  Next: ${report.next_action}`);
  return lines.join('\n');
}

function renderMt5ProfileList(profiles) {
  const lines = [
    A.B_CYAN + 'MT5 Profiles' + A.RESET,
    A.GRAY + '='.repeat(72) + A.RESET,
  ];
  profiles.forEach((profile) => {
    lines.push(`  ${profile.label || profile.slot} | login ${maskLogin(profile.login)} | ${profile.server || 'server missing'} | password ${profile.has_password ? 'saved' : 'missing'}`);
  });
  return lines.join('\n');
}

function polymarketHistoryPayload(snapshot, args = [], options = {}) {
  const event = options.event || optionValue(args, '--event', optionValue(args, '--symbol', null));
  const historyDays = options.historyDays ?? numericOption(args, '--history-days', numericOption(args, '--days', 30));
  const timeframe = options.timeframe || optionValue(args, '--timeframe', '1h');
  const sources = (snapshot.sources || []).filter((record) => {
    if (record.family !== 'prediction_market') return false;
    if (record.provider !== 'polymarket') return false;
    if (event && record.symbol !== event) return false;
    if (timeframe && record.timeframe && record.timeframe !== timeframe) return false;
    return true;
  });
  const errors = (snapshot.errors || []).filter((error) => {
    if (error.family === 'prediction_market') return true;
    if (error.provider === 'polymarket' || error.provider === 'prediction_market') return true;
    if (event && error.symbol === event) return true;
    return false;
  });
  return {
    ok: errors.length === 0 && sources.length > 0,
    mode: snapshot.mode,
    fetched_at: snapshot.fetched_at,
    family: 'prediction_market',
    provider: 'polymarket',
    event: event || 'all',
    timeframe,
    history_days: historyDays,
    sources: sources.length,
    errors: errors.slice(0, 5),
    output: 'storage/data/cache/prediction_market/backtest_history.json',
  };
}

async function runPolymarketArchiveIngest(args, deps = {}) {
  const history = deps.history || require('../../../../shared/lib/market/polymarket_history.js');
  const daysBack = numericOption(args, '--days', numericOption(args, '--history-days', 180));
  const interval = optionValue(args, '--interval', optionValue(args, '--timeframe', '1h'));
  const maxMarkets = numericOption(args, '--max-markets', 500);
  const startOffset = numericOption(args, '--start-offset', numericOption(args, '--offset', 0));
  const category = optionValue(args, '--category', 'all');
  const archiveRoot = optionValue(args, '--archive-root', undefined);
  return history.backfillPolymarketArchive({
    daysBack,
    interval,
    maxMarkets,
    startOffset,
    category,
    root: archiveRoot,
    includeNo: hasFlag(args, '--include-no'),
    noCache: hasFlag(args, '--no-cache'),
  });
}

function parseGatewayJsonOutput(stdout, label) {
  const lines = String(stdout || '').split('\n');
  const jsonLine = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}');
  });
  if (!jsonLine) {
    throw new Error(`No JSON payload found in ${label} output`);
  }
  return JSON.parse(jsonLine);
}

function formatCompactVolume(value) {
  const volume = Number(value || 0);
  if (!Number.isFinite(volume)) return '0';
  return volume.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function truncateLabel(value, max = 88) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function buildPolymarketCategoryChoices() {
  return [
    { label: 'Crypto (Recommended)', value: 'crypto' },
    { label: 'All categories', value: 'all' },
    { label: 'Politics', value: 'politics' },
    { label: 'Sports', value: 'sports' },
    { label: 'Business', value: 'business' },
    { label: 'Custom category', value: '__custom__' },
    { label: 'Cancel', value: '__cancel__' },
  ];
}

function buildPolymarketMarketChoices(markets = []) {
  return markets.map((market, index) => ({
    label: market.groupItemTitle
      ? `[${market.groupItemTitle}]  ${truncateLabel(market.question, 56)} | vol ${formatCompactVolume(market.volume)}`
      : `${truncateLabel(market.question, 76)} | vol ${formatCompactVolume(market.volume)}`,
    value: String(index),
  }));
}

function buildPolymarketActionChoices(market = {}) {
  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  const hasYes = Boolean(resolveOutcomeToken(market, 'yes'));
  const hasNo = Boolean(resolveOutcomeToken(market, 'no'));
  return [
    { label: 'View detail (Recommended)', value: 'detail' },
    { label: 'View orderbook', value: 'orderbook' },
    { label: 'View price history', value: 'price_history' },
    ...(hasYes ? [{ label: 'Buy Yes', value: 'buy_yes' }] : []),
    ...(hasNo ? [{ label: 'Buy No', value: 'buy_no' }] : []),
    ...(tokens.length && !hasYes && !hasNo ? [{ label: `Buy ${tokens[0].outcome || 'token 1'}`, value: 'buy_first' }] : []),
    { label: 'Back', value: 'back' },
    { label: 'Exit', value: 'exit' },
  ];
}

function buildTokenChoicePrompt(market = {}) {
  return (Array.isArray(market.tokens) ? market.tokens : [])
    .filter((token) => token && token.token_id)
    .map((token) => ({
      label: `${String(token.outcome || 'Token').padEnd(8)} ${token.token_id}`,
      value: token.token_id,
    }));
}

function resolveOutcomeToken(market = {}, targetOutcome) {
  const normalizedTarget = String(targetOutcome || '').trim().toLowerCase();
  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  const exact = tokens.find((token) => String(token.outcome || '').trim().toLowerCase() === normalizedTarget);
  if (exact) return exact;
  return null;
}

function renderPolymarketMarketDetails(result, market) {
  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  const lines = [
    A.B_CYAN + 'Polymarket Market Detail' + A.RESET,
    A.GRAY + '='.repeat(72) + A.RESET,
    `  Category: ${result.category || 'unknown'}`,
    `  Section: ${market.section || 'unknown'}`,
    `  Volume: ${Number(market.volume || 0).toLocaleString()}`,
    `  Liquidity: ${Number(market.liquidity || 0).toLocaleString()}`,
    `  Active: ${market.active === false ? 'no' : 'yes'}`,
    `  Closed: ${market.closed ? 'yes' : 'no'}`,
    '',
    `  Question: ${market.question}`,
  ];
  if (market.groupItemTitle) lines.push(`  Sub-market: ${market.groupItemTitle}`);
  if (market.condition_id) lines.push(`  Condition ID: ${market.condition_id}`);
  lines.push('');
  lines.push('  Outcomes:');
  if (tokens.length === 0) {
    lines.push('    No token ids returned.');
  } else {
    tokens.forEach((token) => {
      lines.push(`    ${String(token.outcome || '').padEnd(8)} token: ${token.token_id}`);
    });
  }
  lines.push('');
  lines.push('  Next commands:');
  lines.push('    Use Market action to inspect orderbook, history, or place orders.');
  return lines.join('\n');
}

function normalizePolymarketBookSide(entries, side = 'ask') {
  const direction = side === 'bid' ? -1 : 1;
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      ...entry,
      price: Number(entry.price),
      size: Number(entry.size),
    }))
    .filter((entry) => Number.isFinite(entry.price) && entry.price > 0 && entry.price < 1 && Number.isFinite(entry.size) && entry.size > 0)
    .sort((a, b) => direction * (a.price - b.price))
    .map((entry) => ({
      ...entry,
      price: String(Number(entry.price.toFixed(6))),
      size: String(Number(entry.size.toFixed(6))),
    }));
}

function renderPolymarketOrderbookDetails(market, snapshot) {
  const book = snapshot && snapshot.book ? snapshot.book : {};
  const bids = normalizePolymarketBookSide(book.bids, 'bid');
  const asks = normalizePolymarketBookSide(book.asks, 'ask');
  const bestBid = bids[0];
  const bestAsk = asks[0];
  const lines = [
    A.B_CYAN + 'Polymarket Orderbook' + A.RESET,
    A.GRAY + '='.repeat(72) + A.RESET,
    `  Market: ${market.question}`,
    `  Token: ${snapshot.tokenId}`,
    `  Last trade: ${book.last_trade_price || 'n/a'}`,
    `  Tick size: ${book.tick_size || 'n/a'}   Min order: ${book.min_order_size || 'n/a'}`,
    `  Best bid: ${bestBid ? `${bestBid.price} x ${bestBid.size}` : 'n/a'}`,
    `  Best ask: ${bestAsk ? `${bestAsk.price} x ${bestAsk.size}` : 'n/a'}`,
    '',
    '  Near-spread bids:',
  ];
  if (!bids.length) {
    lines.push('    No bids returned.');
  } else {
    bids.slice(0, 5).forEach((entry) => lines.push(`    ${entry.price} x ${entry.size}`));
  }
  lines.push('');
  lines.push('  Near-spread asks:');
  if (!asks.length) {
    lines.push('    No asks returned.');
  } else {
    asks.slice(0, 5).forEach((entry) => lines.push(`    ${entry.price} x ${entry.size}`));
  }
  return lines.join('\n');
}

function renderPolymarketPriceHistoryDetails(market, snapshot) {
  const rows = Array.isArray(snapshot.history)
    ? snapshot.history
    : Array.isArray(snapshot.history && snapshot.history.history)
      ? snapshot.history.history
      : [];
  const lines = [
    A.B_CYAN + 'Polymarket Price History' + A.RESET,
    A.GRAY + '='.repeat(72) + A.RESET,
    `  Market: ${market.question}`,
    `  Token: ${snapshot.tokenId}`,
    `  Interval: ${snapshot.interval || '1h'}`,
    '',
    '  Recent prints:',
  ];
  if (!rows.length) {
    lines.push('    No price history rows returned.');
  } else {
    rows.slice(-12).forEach((row) => {
      const ts = row.t ?? row.timestamp ?? 0;
      const dateStr = ts ? new Date(Number(ts) * 1000).toISOString().replace('T', ' ').slice(0, 16) : '?';
      const price = Number(row.p ?? row.price ?? 0).toFixed(3);
      lines.push(`    ${dateStr}  p=${price}`);
    });
  }
  return lines.join('\n');
}


function fetchPolymarketOrderbookSnapshot(tokenId) {
  const payload = runGatewayCommand(['polymarket', 'orderbook', '--token', tokenId, '--json']);
  if (!payload.ok) throw new Error(payload.error || 'Polymarket orderbook request failed');
  return payload;
}

function fetchPolymarketPriceHistorySnapshot(tokenId, interval = '1h') {
  const payload = runGatewayCommand(['polymarket', 'price-history', '--token', tokenId, '--interval', interval, '--json']);
  if (!payload.ok) throw new Error(payload.error || 'Polymarket price history request failed');
  return payload;
}

function submitPolymarketBuyOrder(tokenId, size, price, tickSize) {
  const gatewayArgs = ['polymarket', 'buy', tokenId, String(size), ...(price !== undefined ? [String(price)] : [])];
  if (tickSize !== undefined) gatewayArgs.push('--tick-size', String(tickSize));
  gatewayArgs.push('--json');
  
  const payload = runGatewayCommand(gatewayArgs);
  if (!payload.ok) {
    const lines = [payload.error || 'Polymarket buy request failed'];
    if (payload.signerAddress || payload.funderAddress || payload.signatureType !== undefined) {
      lines.push(`signer=${payload.signerAddress || 'none'} funder=${payload.funderAddress || 'none'} sigType=${payload.signatureType ?? 'unset'}`);
    }
    if (payload.suggestion) lines.push(payload.suggestion);
    throw new Error(lines.join('\n'));
  }
  return payload;
}

function deriveDefaultBuyPriceFromBook(snapshot) {
  const book = snapshot && snapshot.book ? snapshot.book : {};
  const asks = normalizePolymarketBookSide(book.asks, 'ask');
  const bids = normalizePolymarketBookSide(book.bids, 'bid');
  const ask = Number(asks[0] && asks[0].price);
  if (Number.isFinite(ask) && ask > 0) return ask;
  const bid = Number(bids[0] && bids[0].price);
  if (Number.isFinite(bid) && bid > 0) return bid;
  return 0.5;
}

function tickSizeFromBook(snapshot) {
  const raw = snapshot && snapshot.book ? Number(snapshot.book.tick_size) : 0.01;
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : 0.01;
}

function minOrderSizeFromBook(snapshot) {
  const raw = snapshot && snapshot.book ? Number(snapshot.book.min_order_size) : 0;
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function hasPolymarketOrderbookDepth(snapshot) {
  const book = snapshot && snapshot.book ? snapshot.book : {};
  return normalizePolymarketBookSide(book.bids, 'bid').length > 0
    || normalizePolymarketBookSide(book.asks, 'ask').length > 0;
}

function decimalPlacesForTick(tickSize) {
  const text = String(tickSize);
  if (!text.includes('.')) return 0;
  return text.split('.')[1].replace(/0+$/, '').length || text.split('.')[1].length;
}

function normalizeLimitPriceInput(raw, defaultPrice, tickSize = 0.01) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: true, price: defaultPrice };
  if (/^0+[.,]$/.test(text)) return { ok: false, reason: 'incomplete_decimal' };

  let normalized = text.replace(',', '.');
  const isPercent = normalized.endsWith('%');
  if (isPercent) normalized = normalized.slice(0, -1).trim();
  if (normalized.startsWith('.')) normalized = `0${normalized}`;

  let value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, reason: 'not_a_number' };
  if (isPercent || value > 1) value /= 100;

  const min = tickSize;
  const max = 1 - tickSize;
  if (value < min || value > max) return { ok: false, reason: 'out_of_range', min, max };

  const decimals = Math.max(decimalPlacesForTick(tickSize), 6);
  const rounded = Number((Math.round(value / tickSize) * tickSize).toFixed(decimals));
  return { ok: true, price: rounded };
}

function fetchPolymarketEventsSnapshot(category = 'crypto', limit = 15) {
  const gatewayArgs = ['polymarket', 'events', String(limit), '--category', category, '--json'];
  const launch = buildTradeGatewayLaunch(gatewayArgs);
  const result = spawnSync(launch.command, launch.args, {
    cwd: utils.REPO_ROOT,
    encoding: 'utf8',
    shell: launch.shell ?? false,
  });
  if (result.error) throw new Error(`Failed to fetch Polymarket events: ${result.error.message}`);
  const payload = parseGatewayJsonOutput(result.stdout, 'polymarket events');
  if (!payload || payload.ok === false) throw new Error(payload && payload.error ? payload.error : 'Polymarket events request failed');
  return payload;
}

async function runPolymarketMarketActionLoop(selectedMarket, resultContext) {
  let firstDetailEntry = true;
  while (true) {
    if (firstDetailEntry) {
      pageText(renderPolymarketMarketDetails(resultContext, selectedMarket), []);
      firstDetailEntry = false;
    } else {
      const groupLabel = selectedMarket.groupItemTitle || selectedMarket.section || 'crypto';
      process.stdout.write(`\n${A.B_CYAN}${selectedMarket.question}${A.RESET}  ${A.DIM}(${groupLabel})${A.RESET}\n`);
    }
    const action = await promptSelect('Market action:', buildPolymarketActionChoices(selectedMarket));
    if (action === 'exit') return 'exit';
    if (action === 'back') return 'back';
    if (action === 'detail') {
      pageText(renderPolymarketMarketDetails(resultContext, selectedMarket), []);
      continue;
    }
    if (action === 'orderbook') {
      const tokenChoices = buildTokenChoicePrompt(selectedMarket);
      if (!tokenChoices.length) {
        console.log('No token id available for orderbook lookup.');
        continue;
      }
      const tokenId = tokenChoices.length === 1
        ? tokenChoices[0].value
        : await promptSelect('Token:', [...tokenChoices, { label: 'Cancel', value: '__cancel__' }]);
      if (tokenId === '__cancel__') continue;
      const snapshot = fetchPolymarketOrderbookSnapshot(tokenId);
      pageText(renderPolymarketOrderbookDetails(selectedMarket, snapshot), []);
      continue;
    }
    if (action === 'price_history') {
      const tokenChoices = buildTokenChoicePrompt(selectedMarket);
      if (!tokenChoices.length) {
        console.log('No token id available for price history lookup.');
        continue;
      }
      const tokenId = tokenChoices.length === 1
        ? tokenChoices[0].value
        : await promptSelect('Token:', [...tokenChoices, { label: 'Cancel', value: '__cancel__' }]);
      if (tokenId === '__cancel__') continue;
      const interval = await promptSelect('History interval:', [
        { label: '1h (Recommended)', value: '1h' },
        { label: '6h', value: '6h' },
        { label: '1d', value: '1d' },
        { label: '1w', value: '1w' },
        { label: 'max', value: 'max' },
      ]);
      const snapshot = fetchPolymarketPriceHistorySnapshot(tokenId, interval);
      pageText(renderPolymarketPriceHistoryDetails(selectedMarket, snapshot), []);
      continue;
    }
    if (action === 'buy_yes' || action === 'buy_no' || action === 'buy_first') {
      const targetToken = action === 'buy_yes'
        ? resolveOutcomeToken(selectedMarket, 'yes')
        : action === 'buy_no'
          ? resolveOutcomeToken(selectedMarket, 'no')
          : (selectedMarket.tokens || [])[0];
      if (!targetToken) {
        console.log('No token id available for that outcome.');
        continue;
      }
      const book = fetchPolymarketOrderbookSnapshot(targetToken.token_id);
      const defaultPrice = deriveDefaultBuyPriceFromBook(book);
      pageText(renderPolymarketOrderbookDetails(selectedMarket, book), []);
      if (!hasPolymarketOrderbookDepth(book)) {
        console.log(`  ${A.YELLOW}No live CLOB depth is available for this token. Re-fetch markets/orderbook before placing a live order.${A.RESET}`);
        continue;
      }

      const portfolioSnap = (() => {
        try {
          const launch = buildTradeGatewayLaunch(['polymarket', 'portfolio', '--json']);
          const r = spawnSync(launch.command, launch.args, { cwd: utils.REPO_ROOT, encoding: 'utf8', timeout: 10000 });
          return r.stdout ? parseGatewayJsonOutput(r.stdout, 'polymarket portfolio') : null;
        } catch { return null; }
      })();
      const pUsd = portfolioSnap?.balance?.pUSD ?? portfolioSnap?.pUSD ?? portfolioSnap?.data?.balance ?? null;
      if (pUsd !== null) {
        console.log(`  ${A.DIM}pUSD balance: ${A.RESET}${A.B_CYAN}${Number(pUsd).toFixed(2)}${A.RESET}`);
      } else {
        console.log(`  ${A.DIM}pUSD balance: unavailable (credentials not configured)${A.RESET}`);
        console.log(`  ${A.YELLOW}Live order entry is blocked until the portfolio balance can be read.${A.RESET}`);
        continue;
      }

      let size = 0;
      const minOrderSize = minOrderSizeFromBook(book);
      while (true) {
        const sizeRaw = await promptText(`Buy ${targetToken.outcome || 'token'} size (shares):`, '5');
        size = Number(sizeRaw);
        if (Number.isFinite(size) && size > 0 && (!minOrderSize || size >= minOrderSize)) break;
        if (minOrderSize && Number.isFinite(size) && size > 0 && size < minOrderSize) {
          console.log(`  ${A.YELLOW}Size must be at least ${minOrderSize} shares for this token. Try again.${A.RESET}`);
        } else {
          console.log(`  ${A.YELLOW}Size must be a positive number. Try again.${A.RESET}`);
        }
      }
      let limitPrice = defaultPrice;
      const tickSize = tickSizeFromBook(book);
      const tickMax = Number((1 - tickSize).toFixed(Math.max(decimalPlacesForTick(tickSize), 6)));
      while (true) {
        const priceRaw = await promptText(`Limit price for ${targetToken.outcome || 'token'} (${tickSize}-${tickMax}; .12, 12%, or 12 accepted):`, String(defaultPrice));
        const parsedPrice = normalizeLimitPriceInput(priceRaw, defaultPrice, tickSize);
        if (parsedPrice.ok) { limitPrice = parsedPrice.price; break; }
        if (parsedPrice.reason === 'incomplete_decimal') {
          console.log(`  ${A.YELLOW}Finish the decimal, for example 0.40 or .40. Try again.${A.RESET}`);
        } else {
          console.log(`  ${A.YELLOW}Price must be between ${tickSize} and ${tickMax} (tick size ${tickSize}). You can type 0.40, .40, 40%, or 40. Try again.${A.RESET}`);
        }
      }
      const estimatedCost = size * limitPrice;
      if (Number.isFinite(Number(pUsd)) && Number(pUsd) < estimatedCost) {
        console.log(`  ${A.YELLOW}Order blocked: deposit-wallet pUSD balance ${Number(pUsd).toFixed(2)} is below estimated cost $${estimatedCost.toFixed(2)}.${A.RESET}`);
        console.log(`  ${A.YELLOW}Move funds through the Polymarket deposit wallet flow, then re-run portfolio/orderbook before retrying.${A.RESET}`);
        continue;
      }
      console.log([
        '',
        A.BOLD + 'Polymarket Order Preview' + A.RESET,
        `  market   ${selectedMarket.question}`,
        `  outcome  ${targetToken.outcome || 'token'}`,
        `  token    ${targetToken.token_id}`,
        `  size     ${size} shares`,
        `  price    ${limitPrice}  (cost ≈ $${(size * limitPrice).toFixed(2)})`,
        '',
      ].join('\n'));
      const proceed = await promptConfirm('Submit this live Polymarket order?');
      if (!proceed) {
        console.log('Order cancelled.');
        continue;
      }
      const placed = submitPolymarketBuyOrder(targetToken.token_id, size, limitPrice, tickSize);
      console.log(JSON.stringify(placed, null, 2));
      continue;
    }
  }
}

async function promptPolymarketMarketBrowser() {
  while (true) {
    let category = await promptSelect('Polymarket category:', buildPolymarketCategoryChoices());
    if (category === '__cancel__') return { cancelled: true };

    if (category === '__custom__') {
      category = String(await promptText('Custom category/tag slug:', 'crypto')).trim() || 'crypto';
    }

    // ── Event / topic browser (default for all categories) ─────────────────
    const limitChoice = await promptSelect('How many topics should be loaded?', [
      { label: '10', value: '10' },
      { label: '15 (Recommended)', value: '15' },
      { label: '25', value: '25' },
      { label: 'Cancel', value: '__cancel__' },
    ]);
    if (limitChoice === '__cancel__') return { cancelled: true };

    process.stdout.write('\r' + A.ERASE_LINE + `Loading ${category} topics from Gamma API...`);
    let eventsResult;
    try {
      eventsResult = fetchPolymarketEventsSnapshot(category, Number(limitChoice));
    } finally {
      process.stdout.write('\r' + A.ERASE_LINE);
    }
    if (!Array.isArray(eventsResult.data) || eventsResult.data.length === 0) {
      console.log(`No topics returned for "${category}". Try another category.`);
      continue;
    }

    const eventChoices = eventsResult.data.map((ev, i) => ({
      label: `${truncateLabel(ev.title, 64)} | vol ${formatCompactVolume(ev.volume)}  [${ev.markets.length} markets]`,
      value: String(i),
    }));
    const eventValue = await promptSelect('Topic:', [
      ...eventChoices,
      { label: 'Back', value: '__back__' },
      { label: 'Cancel', value: '__cancel__' },
    ]);
    if (eventValue === '__cancel__') return { cancelled: true };
    if (eventValue === '__back__') continue;

    const selectedEvent = eventsResult.data[Number(eventValue)];
    if (!selectedEvent.markets.length) {
      console.log('No tradeable markets found for this topic.');
      continue;
    }

    const marketValue = await promptSelect(
      `Markets — ${truncateLabel(selectedEvent.title, 48)}:`,
      [
        ...buildPolymarketMarketChoices(selectedEvent.markets),
        { label: 'Back', value: '__back__' },
        { label: 'Cancel', value: '__cancel__' },
      ]
    );
    if (marketValue === '__cancel__') return { cancelled: true };
    if (marketValue === '__back__') continue;

    const selectedMarket = selectedEvent.markets[Number(marketValue)];
    const actionResult = await runPolymarketMarketActionLoop(selectedMarket, { category });
    if (actionResult === 'exit') return { cancelled: false, exited: true };
  }
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
 * Handles the 'polymarket' command.
 * Sub: portfolio, debug, modes, investigate, probe, topology, trace, markets, paper-run, derive-creds
 */
async function commandPolymarket(args) {
  const sub = args[0] || 'portfolio';
  const gate = featureGate('polymarket', { surface: `Polymarket ${sub}` });
  if (!gate.ok) {
    printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
    return 1;
  }
  if (hasFlag(args, '--live')) {
    const liveGate = canLiveExecute('polymarket');
    if (!liveGate.ok) {
      printPayload({
        ok: false,
        broker: 'polymarket',
        runtime_mode: getRuntimeMode(),
        reason: liveGate.reason,
      }, args);
      console.error(`${A.B_RED}[ERROR] ${liveGate.reason}.${A.RESET}`);
      return 1;
    }
  }
  if ((sub === 'research' && args[1] === 'ingest') || (sub === 'history' && (args[1] === 'ingest' || args[1] === 'backfill'))) {
    const result = await runPolymarketArchiveIngest(args);
    printPayload(result, args);
    return result.ok ? 0 : 1;
  }
  if (sub === 'history' && (args[1] === 'backfill' || args[1] === 'orderbook-lite')) {
    const { runPolymarketOrderbookLiteBackfill } = require('./polymarket_backtest.js');
    const tagId          = numericOption(args, '--tag-id', 21);
    const daysBack       = numericOption(args, '--days', 365);
    const strategy       = optionValue(args, '--strategy', 'low_prob_dip');
    const maxMarkets     = numericOption(args, '--max-markets', 200);
    const entryThreshold = numericOption(args, '--entry-threshold', 0.15);
    const interval       = optionValue(args, '--interval', optionValue(args, '--timeframe', '1d'));
    const archiveRoot    = optionValue(args, '--archive-root', undefined);
    const fee            = numericOption(args, '--fee', 0);
    const halfSpreadEstimate = numericOption(args, '--half-spread', numericOption(args, '--half-spread-estimate', 0.01));
    const impactY        = numericOption(args, '--impact-y', 1);
    const orderNotional  = numericOption(args, '--order-notional', 10);
    const rollingMarketVolume = numericOption(args, '--rolling-market-volume', undefined);
    const captureThrottleMs = numericOption(args, '--capture-throttle-ms', numericOption(args, '--throttle-ms', 250));
    const pmxtApiKey = optionValue(args, '--pmxt-api-key', process.env.PMXT_API_KEY || '');
    const pmxtBaseUrl = optionValue(args, '--pmxt-base-url', process.env.PMXT_BASE_URL || 'https://api.pmxt.dev');
    const noCache        = hasFlag(args, '--no-cache');
    const result = await runPolymarketOrderbookLiteBackfill({
      tagId,
      daysBack,
      strategy,
      maxMarkets,
      entryThreshold,
      interval,
      archiveRoot,
      fee,
      halfSpreadEstimate,
      impactY,
      orderNotional,
      rollingMarketVolume,
      captureThrottleMs,
      pmxtApiKey,
      pmxtBaseUrl,
      fromArchive: !hasFlag(args, '--live-fetch') && !hasFlag(args, '--no-archive'),
      repairMissing: hasFlag(args, '--repair-missing'),
      noCache,
    });
    printPayload(result, args);
    return result.ok ? 0 : 1;
  }
  if (sub === 'history') {
    const event = optionValue(args, '--event', optionValue(args, '--symbol', null));
    const historyDays = numericOption(args, '--history-days', numericOption(args, '--days', 30));
    const timeframe = optionValue(args, '--timeframe', '1h');
    const snapshot = await ingestMarketData({
      family: 'prediction_market',
      symbol: event,
      timeframe,
      historyDays,
      returnAttemptSnapshot: true,
    });
    const payload = polymarketHistoryPayload(snapshot, args, { event, historyDays, timeframe });
    printPayload(payload, args);
    return payload.ok ? 0 : 1;
  }
  if (sub === 'backtest') {
    const { runPolymarketBacktest } = require('./polymarket_backtest.js');
    const tagId          = numericOption(args, '--tag-id', 21);
    const daysBack       = numericOption(args, '--days', 365);
    const strategy       = optionValue(args, '--strategy', 'low_prob_dip');
    const maxMarkets     = numericOption(args, '--max-markets', 20);
    const entryThreshold = numericOption(args, '--entry-threshold', 0.15);
    const interval       = optionValue(args, '--interval', optionValue(args, '--timeframe', '1d'));
    const archiveRoot    = optionValue(args, '--archive-root', undefined);
    const fee            = numericOption(args, '--fee', 0);
    const halfSpreadEstimate = numericOption(args, '--half-spread', numericOption(args, '--half-spread-estimate', 0.01));
    const impactY        = numericOption(args, '--impact-y', 1);
    const orderNotional  = numericOption(args, '--order-notional', 10);
    const rollingMarketVolume = numericOption(args, '--rolling-market-volume', undefined);
    const captureOrderbookLite = hasFlag(args, '--capture-orderbook-lite');
    const captureThrottleMs = numericOption(args, '--capture-throttle-ms', numericOption(args, '--throttle-ms', 250));
    const pmxtApiKey = optionValue(args, '--pmxt-api-key', process.env.PMXT_API_KEY || '');
    const pmxtBaseUrl = optionValue(args, '--pmxt-base-url', process.env.PMXT_BASE_URL || 'https://api.pmxt.dev');
    const noCache        = hasFlag(args, '--no-cache');
    const result = await runPolymarketBacktest({
      tagId,
      daysBack,
      strategy,
      maxMarkets,
      entryThreshold,
      interval,
      archiveRoot,
      fee,
      halfSpreadEstimate,
      impactY,
      orderNotional,
      rollingMarketVolume,
      captureOrderbookLite,
      captureThrottleMs,
      pmxtApiKey,
      pmxtBaseUrl,
      fromArchive: !hasFlag(args, '--live-fetch') && !hasFlag(args, '--no-archive'),
      repairMissing: hasFlag(args, '--repair-missing'),
      noCache,
    });
    printPayload(result, args);
    return result.ok ? 0 : 1;
  }

  if (sub === 'markets' && !hasFlag(args, '--json') && args.length === 1 && isRichTerminal()) {
    const browse = await promptPolymarketMarketBrowser();
    if (browse.cancelled) {
      console.log('Polymarket market browser cancelled.');
      return 0;
    }
    if (browse.empty) {
      console.log(`No active ${browse.category} markets returned from Gamma API.`);
      return 0;
    }
    return 0;
  }
  const gatewayArgs = ['polymarket', sub, ...args.slice(1)];
  if (hasFlag(args, '--json')) gatewayArgs.push('--json');

  const launch = buildTradeGatewayLaunch(gatewayArgs);
  const result = spawnSync(launch.command, launch.args, {
    cwd: utils.REPO_ROOT,
    stdio: 'inherit',
    shell: launch.shell ?? false,
  });
  return result.status ?? 0;
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
 * MT5 sub-menu dispatcher — shown when user picks "MT5 / EA" from Execution.
 * Routes to profile management, connect, or bridge based on interactive choice.
 */
async function commandMt5(args) {
  if (args.length > 0) {
    const sub = args[0];
    if (sub === 'profile') return commandMt5Profile(args.slice(1));
    if (sub === 'connect') return commandMt5Connect(args.slice(1));
    if (sub === 'doctor' || sub === 'diag') return commandMt5Doctor(args.slice(1));
    if (sub === 'bridge') return commandMt5Bridge(args.slice(1));
  }

  global.suppressLogs = true;
  const action = await promptSelect('MT5 / EA:', [
    { label: 'List saved accounts', value: 'list' },
    { label: 'Add / Edit account  (login ID · server · password)', value: 'add' },
    { label: 'Doctor  (check profile, terminal, bridge)', value: 'doctor' },
    { label: 'Connect  (launch terminal with saved profile)', value: 'connect' },
    { label: 'Install EA Bridge  (SovereignExport.mq5)', value: 'bridge' },
    { label: 'Delete account profile', value: 'delete' },
  ]);
  global.suppressLogs = false;

  if (action === 'list') return commandMt5Profile(['list']);
  if (action === 'add') return commandMt5Profile(['add']);
  if (action === 'delete') return commandMt5Profile(['delete']);
  if (action === 'doctor') return commandMt5Doctor([]);
  if (action === 'connect') return commandMt5Connect([]);
  if (action === 'bridge') return commandMt5Bridge([]);
  return 0;
}

/**
 * Guided wizard to register a new broker or trading platform.
 * Supports REST API brokers (Alpaca-style), MT5 terminals, and custom/webhook setups.
 */
// does this actually works as intended? dev reiview
async function commandAddPlatform(args) {
  const { promptPassword } = require('../../lib/auth.js');
  const A = require('#shared/ansi');

  console.log(`\n${A.c(A.B_CYAN, 'SOVEREIGN')} ${A.muted('— Add Broker / Platform')}\n`);

  global.suppressLogs = true;
  const type = await promptSelect('Platform type:', [
    { label: 'Alpaca  (REST API — US stocks, crypto)', value: 'alpaca' },
    { label: 'MT5 / MetaTrader  (terminal — forex, CFDs, futures)', value: 'mt5' },
    { label: 'Other / Custom  (webhook, FIX, proprietary API)', value: 'custom' },
  ]);
  global.suppressLogs = false;

  if (type === 'mt5') {
    console.log(A.muted('\n  Launching MT5 profile setup...\n'));
    return commandMt5Profile(['add']);
  }

  if (type === 'alpaca') {
    console.log(A.muted('\n  Alpaca uses API keys stored in your .env file.'));
    console.log(A.muted('  Keys are NOT stored in the vault — keep your .env outside version control.\n'));
    global.suppressLogs = true;
    const key = await promptText('Alpaca API Key ID:', '');
    global.suppressLogs = false;
    if (!key) { console.error('API Key ID is required.'); return 1; }
    const secret = await promptPassword('Alpaca Secret Key');
    const mode = await promptSelect('Environment:', [
      { label: 'Paper trading (safe, simulated)', value: 'paper' },
      { label: 'Live trading (real money)', value: 'live' },
    ]);
    const envPath = path.join(utils.REPO_ROOT, '.env');
    const baseUrl = mode === 'paper'
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    const block = [
      '',
      '# Alpaca broker',
      `ALPACA_API_KEY=${key}`,
      `ALPACA_SECRET_KEY=${secret}`,
      `ALPACA_BASE_URL=${baseUrl}`,
      '',
    ].join('\n');
    fs.appendFileSync(envPath, block, 'utf8');
    console.log(`\n${A.c(A.GREEN, '●')} Alpaca credentials appended to ${envPath}`);
    console.log(A.muted('  Run: sovereign trade balance  to verify the connection.'));
    return 0;
  }

  if (type === 'custom') {
    global.suppressLogs = true;
    const name = await promptText('Platform name:', '');
    global.suppressLogs = false;
    if (!name) { console.error('Platform name is required.'); return 1; }
    global.suppressLogs = true;
    const endpoint = await promptText('API endpoint or connection type:', '');
    global.suppressLogs = false;

    // Ask AI for setup guidance
    const { ask: aiAsk, isAvailable: aiAvailable } = require('#shared/ai_client');
    const aiReady = await aiAvailable();
    if (aiReady) {
      process.stdout.write(A.muted('\n  Asking AI for setup guidance...\n'));
      const system = 'You are a financial trading platform integration expert. Give concise, actionable setup steps for connecting a trading platform to a local trading system. Focus on: auth method, required credentials, API endpoints, and any known gotchas. Keep it under 10 bullet points.';
      const result = await aiAsk(`How do I connect "${name}" (${endpoint || 'unknown endpoint'}) to a local trading CLI? What credentials and configuration steps are needed?`, system);
      if (result) {
        console.log(`\n${A.c(A.B_CYAN, `AI Guidance`)} ${A.muted(`(via ${result.source})`)}`);
        console.log(A.muted('─'.repeat(60)));
        console.log(result.text);
        console.log(A.muted('─'.repeat(60)));
      }
    } else {
      console.log(A.muted('\n  Tip: run `ollama pull qwen2.5-coder:7b` to enable local AI-guided setup.'));
    }

    global.suppressLogs = true;
    const notes = await promptText('Notes (auth type, docs URL, etc.):', '');
    global.suppressLogs = false;

    const brokersPath = path.join(utils.REPO_ROOT, 'config', 'brokers.yaml');
    const entry = [
      '',
      `- name: "${name}"`,
      `  endpoint: "${endpoint}"`,
      `  notes: "${notes}"`,
      `  added: "${new Date().toISOString()}"`,
      '',
    ].join('\n');
    fs.mkdirSync(path.dirname(brokersPath), { recursive: true });
    fs.appendFileSync(brokersPath, entry, 'utf8');
    printPayload({ ok: true, saved: { name, endpoint }, config: brokersPath }, args);
    return 0;
  }

  return 0;
}

/**
 * MT5 profile management: list / add / delete.
 * Stores credentials encrypted in the local vault.
 */
async function commandMt5Profile(args) {
  const {
    listMt5Profiles, upsertMt5Profile, deleteMt5Profile, getMt5ProfileChoices,
  } = require('#shared/mt5_profiles');
  const { promptPassword } = require('../../lib/auth.js');
  const subcommand = args[0] || 'list';

  if (subcommand === 'list') {
    const profiles = listMt5Profiles();
    if (hasFlag(args, '--json')) {
      printPayload({ profiles }, args);
    } else {
      pageText(renderMt5ProfileList(profiles), args);
    }
    return 0;
  }

  if (subcommand === 'add' || subcommand === 'edit') {
    global.suppressLogs = true;
    const slot = await promptSelect('Account slot:', getMt5ProfileChoices());
    const login = await promptText('MT5 Login ID:', '');
    global.suppressLogs = false;
    if (!login) { console.error('Login ID is required.'); return 1; }
    global.suppressLogs = true;
    const server = await promptText('MT5 Server (e.g. ICMarkets-Live01):', '');
    global.suppressLogs = false;
    if (!server) { console.error('Server is required.'); return 1; }
    const password = await promptPassword('MT5 Password (stored encrypted)');
    global.suppressLogs = true;
    const notes = await promptText('Notes (optional):', '');
    global.suppressLogs = false;
    const profile = upsertMt5Profile({ slot, login, server, password, notes });
    printPayload({ ok: true, saved: profile }, args);
    return 0;
  }

  if (subcommand === 'delete') {
    global.suppressLogs = true;
    const slot = args[1] || await promptSelect('Select slot to delete:', getMt5ProfileChoices());
    global.suppressLogs = false;
    const confirmed = await promptConfirm(`Delete MT5 profile for slot "${slot}"?`);
    if (!confirmed) return 0;
    const { deleteMt5Profile: del } = require('#shared/mt5_profiles');
    const removed = del(slot);
    printPayload({ ok: true, removed }, args);
    return 0;
  }

  printPayload({ commands: ['list', 'add', 'delete'] }, args);
  return 0;
}

async function commandMt5Doctor(args) {
  const {
    getMt5Profile,
    getMt5ProfileChoices,
    getDefaultMt5TerminalPath,
  } = require('#shared/mt5_profiles');

  let slot = optionValue(args, '--slot', null);
  if (!slot) {
    global.suppressLogs = true;
    slot = await promptSelect('Select MT5 account to diagnose:', getMt5ProfileChoices());
    global.suppressLogs = false;
  }

  const profile = getMt5Profile(slot, { includeSecret: false });
  const terminal = profile && profile.terminal_path ? profile.terminal_path : getDefaultMt5TerminalPath();
  const bridgeInstalled = fs.existsSync(path.join(utils.REPO_ROOT, 'backend', 'scripts', 'verification', 'mt5_bridge_install.js'));
  const report = inspectMt5Setup(slot, profile, terminal, bridgeInstalled);

  if (hasFlag(args, '--json')) {
    printPayload(report, args);
  } else {
    pageText(renderMt5Diagnostics(report), args);
  }
  return report.ok ? 0 : 1;
}

/**
 * Launches MT5 terminal using a saved vault profile.
 */
async function commandMt5Connect(args) {
  if (!(await requireAuth('MT5 connect'))) return 1;
  const os = require('node:os');
  const { spawn } = require('node:child_process');
  const {
    getMt5Profile, getMt5ProfileChoices, getDefaultMt5TerminalPath,
  } = require('#shared/mt5_profiles');

  let slot = optionValue(args, '--slot', null);
  if (!slot) {
    global.suppressLogs = true;
    slot = await promptSelect('Select MT5 account to connect:', getMt5ProfileChoices());
    global.suppressLogs = false;
  }

  const profile = getMt5Profile(slot, { includeSecret: true });
  const terminal = profile && profile.terminal_path ? profile.terminal_path : getDefaultMt5TerminalPath();
  const bridgeInstalled = fs.existsSync(path.join(utils.REPO_ROOT, 'backend', 'scripts', 'verification', 'mt5_bridge_install.js'));
  const report = inspectMt5Setup(slot, profile ? { ...profile, has_password: Boolean(profile.password) } : null, terminal, bridgeInstalled);
  if (!report.ok) {
    if (hasFlag(args, '--json')) {
      printPayload(report, args);
    } else {
      pageText(renderMt5Diagnostics(report), args);
    }
    return 1;
  }

  const configPath = path.join(os.tmpdir(), `sovereign_mt5_${Date.now()}.ini`);
  const config = [
    '[Common]',
    `Login=${profile.login}`,
    `Password=${profile.password}`,
    `Server=${profile.server}`,
    'ProxyEnable=0',
    '',
  ].join('\r\n');
  fs.writeFileSync(configPath, config, { encoding: 'utf8', mode: 0o600 });

  const child = spawn(terminal, [`/config:${configPath}`], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  setTimeout(() => { try { fs.rmSync(configPath, { force: true }); } catch {} }, 5000);

  const masked = String(profile.login).replace(/^(.{2}).*(.{2})$/, '$1***$2');
  printPayload({ ok: true, slot, login: masked, server: profile.server, terminal }, args);
  return 0;
}

/**
 * Installs the SovereignExport EA bridge into the MT5 terminal data directory.
 */
function commandMt5Bridge(args) {
  const bridgePath = path.join(utils.REPO_ROOT, 'backend', 'scripts', 'verification', 'mt5_bridge_install.js');
  if (!fs.existsSync(bridgePath)) {
    console.error('MT5 bridge script not found: ' + bridgePath);
    return 1;
  }
  const result = spawnSync(process.execPath, [bridgePath], {
    cwd: utils.REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
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
  const { agentLoop } = require('#shared/mcp_agent');
  const available = await (async () => {
    try { const { isAvailable: check } = require('#shared/ai_client'); return check(); }
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
