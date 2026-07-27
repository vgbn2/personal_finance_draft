'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { ingestMarketData } = require('../../../scripts/data_ops/ingest_market_data.js');
const utils = require('../../lib/utils.js');
const { canLiveExecute, getRuntimeMode } = require('../../../../shared/lib/brokers/capabilities');
const { featureGate } = require('../../../../shared/lib/settings/runtime');
const { runGatewayCommand, buildTradeGatewayLaunch } = require('../../../../shared/lib/runtime/backend_bridge');
const { requireAuth, verifyPin } = require('../../lib/auth.js');
const A = require('#shared/ui/ansi');
const {
  pageText,
  promptSelect,
  promptText,
  promptConfirm,
  isRichTerminal,
  hasFlag,
  optionValue,
  numericOption,
  printPayload,
} = utils;

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
  // optionValue's own default is null; passing a real default lets us omit `root`
  // entirely when absent so backfillPolymarketArchive's `root = CACHE_DIR` applies
  // (a literal null would defeat that default and crash archivePaths on path.join).
  const archiveRoot = optionValue(args, '--archive-root', null);
  const delayMs = numericOption(args, '--delay-ms', 250);
  const refresh = hasFlag(args, '--refresh');
  // Gamma order: 'id' (newest-closed first) tops out at empty hourly micro-markets;
  // 'volumeNum' surfaces the data-rich resolved markets that actually have CLOB price
  // history. Default to volumeNum for the archive (its whole purpose is usable history).
  const order = optionValue(args, '--order', 'volumeNum');
  return history.backfillPolymarketArchive({
    daysBack,
    interval,
    maxMarkets,
    startOffset,
    category,
    order,
    ...(archiveRoot ? { root: archiveRoot } : {}),
    includeNo: hasFlag(args, '--include-no'),
    noCache: hasFlag(args, '--no-cache'),
    delayMs,
    refresh,
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
  const gatewayArgs = ['polymarket', 'buy', tokenId, String(size), ...(price !== undefined ? [String(price)] : []), '--live'];
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

async function authorizePolymarketLive(args, reason) {
  const liveGate = canLiveExecute('polymarket');
  if (!liveGate.ok) {
    printPayload({
      ok: false,
      broker: 'polymarket',
      runtime_mode: getRuntimeMode(),
      reason: liveGate.reason,
    }, args);
    console.error(`${A.B_RED}[ERROR] ${liveGate.reason}.${A.RESET}`);
    return false;
  }
  if (!(await requireAuth(reason))) return false;

  const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
  const providedPin = optionValue(args, '--pin', null);
  if (expectedPin) {
    let inputPin = providedPin;
    if (!inputPin && isRichTerminal()) {
      inputPin = await promptText('Enter Trade PIN to confirm LIVE Polymarket trading:', '');
    }
    if (!verifyPin(inputPin, expectedPin)) {
      console.error(`${A.B_RED}[ERROR] Invalid or missing Trade PIN. LIVE Polymarket trading blocked.${A.RESET}`);
      return false;
    }
    console.log(`${A.B_GREEN}[AUTH] PIN verified. Proceeding with LIVE Polymarket trading...${A.RESET}`);
    return true;
  }

  if (!isRichTerminal()) {
    console.error(`${A.B_RED}[ERROR] SOVEREIGN_TRADE_PIN not set. Unattended LIVE Polymarket execution blocked (Fail-Closed).${A.RESET}`);
    return false;
  }
  console.warn(`${A.B_YELLOW}[WARNING] SOVEREIGN_TRADE_PIN not set. LIVE Polymarket trading proceeding without MFA gate.${A.RESET}`);
  return promptConfirm('Confirm LIVE Polymarket trading WITHOUT a PIN set?');
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
 * Handles the 'polymarket' command.
 * Sub: portfolio, debug, modes, investigate, probe, topology, trace, markets, paper-run, derive-creds
 */
async function commandPolymarket(args) {
  const sub = args[0] || 'portfolio';
  const submitsOrder = (sub === 'buy' || sub === 'sell') && !hasFlag(args, '--preflight');
  if (submitsOrder && !hasFlag(args, '--live')) {
    printPayload({ ok: false, reason: 'Direct Polymarket orders require explicit --live authorization' }, args);
    return 1;
  }
  let liveAuthorized = false;
  if (hasFlag(args, '--live')) {
    liveAuthorized = await authorizePolymarketLive(args, 'Polymarket live trading');
    if (!liveAuthorized) return 1;
  }
  const gate = featureGate('polymarket', { surface: `Polymarket ${sub}` });
  if (!gate.ok) {
    printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
    return 1;
  }
  if (sub === 'history' && args[1] === 'schedule') {
    const { runPolymarketResearchScheduler } = require('../../../scripts/data_ops/polymarket_research_scheduler.js');
    const scopeFile = optionValue(args, '--scope-file', null);
    const tokenIds = String(optionValue(args, '--tokens', '') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      const result = await runPolymarketResearchScheduler({
        scopeFile,
        tokenIds: tokenIds.length ? tokenIds : undefined,
        archiveRoot: optionValue(args, '--archive-root', undefined),
        execute: hasFlag(args, '--execute'),
        once: hasFlag(args, '--once') || !hasFlag(args, '--execute'),
        pollSeconds: numericOption(args, '--poll-seconds', 300),
        historyInterval: optionValue(args, '--history-interval', '5m'),
        maxTokens: numericOption(args, '--max-tokens', 20),
        retentionDays: numericOption(args, '--retention-days', 30),
        maxRowsPerToken: numericOption(args, '--max-rows-per-token', 5000),
        maxArchiveBytes: numericOption(args, '--max-archive-bytes', 5 * 1024 * 1024 * 1024),
        capturePrices: !hasFlag(args, '--no-prices'),
        captureOrderbooks: !hasFlag(args, '--no-orderbooks'),
        pmxtApiKey: optionValue(args, '--pmxt-api-key', process.env.PMXT_API_KEY || ''),
        pmxtBaseUrl: optionValue(args, '--pmxt-base-url', process.env.PMXT_BASE_URL || 'https://api.pmxt.dev'),
      });
      printPayload(result, args);
      return result.ok ? 0 : 1;
    } catch (error) {
      printPayload({ ok: false, mode: 'research_scheduler', error: error.message }, args);
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
    if (!(await authorizePolymarketLive(args, 'Polymarket live trading'))) return 1;
    const previousAuthorization = process.env.SOVEREIGN_EXECUTION_AUTHORIZED;
    process.env.SOVEREIGN_EXECUTION_AUTHORIZED = 'true';
    let browse;
    try {
      browse = await promptPolymarketMarketBrowser();
    } finally {
      if (previousAuthorization === undefined) delete process.env.SOVEREIGN_EXECUTION_AUTHORIZED;
      else process.env.SOVEREIGN_EXECUTION_AUTHORIZED = previousAuthorization;
    }
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
    env: {
      ...process.env,
      ...(liveAuthorized ? { SOVEREIGN_EXECUTION_AUTHORIZED: 'true' } : {}),
    },
  });
  return result.status ?? 0;
}

module.exports = {
  authorizePolymarketLive,
  polymarketHistoryPayload,
  runPolymarketArchiveIngest,
  parseGatewayJsonOutput,
  formatCompactVolume,
  truncateLabel,
  buildPolymarketCategoryChoices,
  buildPolymarketMarketChoices,
  buildPolymarketActionChoices,
  buildTokenChoicePrompt,
  resolveOutcomeToken,
  renderPolymarketMarketDetails,
  normalizePolymarketBookSide,
  renderPolymarketOrderbookDetails,
  renderPolymarketPriceHistoryDetails,
  fetchPolymarketOrderbookSnapshot,
  fetchPolymarketPriceHistorySnapshot,
  submitPolymarketBuyOrder,
  deriveDefaultBuyPriceFromBook,
  tickSizeFromBook,
  minOrderSizeFromBook,
  hasPolymarketOrderbookDepth,
  decimalPlacesForTick,
  normalizeLimitPriceInput,
  fetchPolymarketEventsSnapshot,
  runPolymarketMarketActionLoop,
  promptPolymarketMarketBrowser,
  commandPolymarket,
};
