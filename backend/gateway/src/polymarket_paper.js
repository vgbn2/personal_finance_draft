const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { GAMMA_BASE, inferWinner } = require('../../../shared/lib/market/polymarket_history');
const { resolveRuntimePolicy } = require('../../../shared/lib/settings/runtime_policy');
const { classifyPolymarketGatewayError } = require('./polymarket_errors.js');
const {
  appendLedgerEvents,
  initializeLedger,
  ledgerPaths,
  loadLedgerProjection,
} = require('./paper_ledger.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_STORAGE_DIR = path.join(REPO_ROOT, 'storage', 'data', 'paper_trading');
const DEFAULT_PORTFOLIO = {
  virtual_balance: 100,
  starting_balance: 100,
  positions: [],
  opened_at: null,
  updated_at: null,
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadPortfolio(storageDir = DEFAULT_STORAGE_DIR, virtualBalance = 100) {
  ensureDir(storageDir);
  if (fs.existsSync(ledgerPaths(storageDir).ledger)) {
    const loaded = loadLedgerProjection(storageDir, virtualBalance);
    if (!loaded.ok) throw new Error(loaded.error);
    return loaded.projection;
  }
  const file = path.join(storageDir, 'portfolio.json');
  if (!fs.existsSync(file)) {
    return {
      ...DEFAULT_PORTFOLIO,
      virtual_balance: virtualBalance,
      starting_balance: virtualBalance,
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...DEFAULT_PORTFOLIO,
      ...parsed,
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
    };
  } catch {
    return {
      ...DEFAULT_PORTFOLIO,
      virtual_balance: virtualBalance,
      starting_balance: virtualBalance,
    };
  }
}

function migrateLegacyPaperState(storageDir = DEFAULT_STORAGE_DIR, options = {}) {
  ensureDir(storageDir);
  if (fs.existsSync(ledgerPaths(storageDir).ledger)) {
    const loaded = loadLedgerProjection(storageDir, options.virtualBalance || 100);
    return loaded.ok ? { ok: true, migrated: false, projection: loaded.projection } : loaded;
  }
  const portfolioPath = path.join(storageDir, 'portfolio.json');
  const fillsPath = path.join(storageDir, 'fills.jsonl');
  const hasLegacyPortfolio = fs.existsSync(portfolioPath);
  const fillText = fs.existsSync(fillsPath) ? fs.readFileSync(fillsPath, 'utf8') : '';
  if (!hasLegacyPortfolio && !fillText.trim()) {
    const initialized = initializeLedger(storageDir, options.virtualBalance || 100, { now: options.now });
    return { ...initialized, migrated: false };
  }
  if (fillText && !fillText.endsWith('\n')) {
    return { ok: false, error: 'legacy paper fills have a truncated final record; migration refused' };
  }

  let legacyPortfolio;
  let fills;
  try {
    legacyPortfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
    fills = fillText.split('\n').filter(Boolean).map(JSON.parse);
  } catch {
    return { ok: false, error: 'legacy paper state is malformed; migration refused' };
  }
  const positions = Array.isArray(legacyPortfolio.positions) ? legacyPortfolio.positions : [];
  const positionsByToken = new Map(positions.map((position) => [String(position.token_id), position]));
  const accepted = [];
  const rejected = [];
  for (const fill of fills) {
    const position = positionsByToken.get(String(fill.token_id));
    if (fill.virtual !== true || fill.side !== 'buy' || !position) {
      rejected.push({ token_id: fill.token_id || null, reason: 'not provably virtual open position' });
      continue;
    }
    accepted.push({ fill, position });
  }
  const expectedCash = Number((
    Number(legacyPortfolio.starting_balance || 100)
      - accepted.reduce((sum, row) => sum + Number(row.fill.shares) * Number(row.fill.price), 0)
  ).toFixed(6));
  if (
    rejected.length > 0
    || accepted.length !== positions.length
    || Math.abs(expectedCash - Number(legacyPortfolio.virtual_balance)) > 1e-5
  ) {
    return {
      ok: false,
      error: 'legacy paper state is ambiguous; migration refused',
      migration_report: {
        accepted: accepted.length,
        rejected: rejected.length,
        duplicates: 0,
        ambiguous: Math.max(rejected.length, Math.abs(accepted.length - positions.length)),
      },
    };
  }

  const archiveDir = path.join(storageDir, 'legacy_read_only');
  fs.mkdirSync(archiveDir, { recursive: true });
  for (const name of ['portfolio.json', 'fills.jsonl', 'pnl_log.jsonl', 'resolved_positions.jsonl']) {
    const source = path.join(storageDir, name);
    const target = path.join(archiveDir, name);
    if (fs.existsSync(source) && !fs.existsSync(target)) {
      fs.copyFileSync(source, target);
      fs.chmodSync(target, 0o400);
    }
  }

  const startingBalance = Number(legacyPortfolio.starting_balance || 100);
  const initializationTime = legacyPortfolio.opened_at || options.now || new Date().toISOString();
  const inputs = [{
    event_type: 'ledger_initialized',
    idempotency_key: `ledger_initialized:${startingBalance}`,
    event_time: initializationTime,
    cash_after: startingBalance,
    source: 'legacy_internal_polymarket_paper_migration',
  }, ...accepted.map(({ fill, position }) => {
    const raw = JSON.stringify(fill);
    const eventTime = fill.t || position.opened_at || initializationTime;
    return {
      event_type: 'paper_fill',
      idempotency_key: `legacy_fill:${crypto.createHash('sha256').update(raw).digest('hex')}`,
      cycle_id: `legacy:${eventTime}`,
      event_time: eventTime,
      decision_time: eventTime,
      data_as_of: eventTime,
      market_id: position.market_id,
      token_id: position.token_id,
      outcome: position.outcome,
      strategy: position.strategy || fill.reason,
      order_intent: { side: 'buy', migrated: true },
      risk_decision: { approved: true, mode: 'paper', migrated: true },
      paper_fill: fill,
      position,
      position_effect: 'open',
      cash_delta: -Number((Number(fill.shares) * Number(fill.price)).toFixed(6)),
    };
  })];
  const committed = appendLedgerEvents(storageDir, inputs, {
    now: options.now,
    startingBalance,
  });
  return {
    ...committed,
    migrated: committed.ok,
    migration_report: {
      accepted: accepted.length,
      rejected: 0,
      duplicates: committed.duplicates ? committed.duplicates.length : 0,
      ambiguous: 0,
      archive_dir: archiveDir,
    },
  };
}

function bestPrice(entries, compare) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries
    .map((entry) => ({ price: toNumber(entry.price), size: toNumber(entry.size) }))
    .filter((entry) => entry.price > 0 && entry.size > 0)
    .sort((a, b) => compare(a.price, b.price))[0] || null;
}

function deriveMidprice(orderbookPayload) {
  const book = orderbookPayload && (orderbookPayload.book || orderbookPayload);
  const bid = bestPrice(book && book.bids, (a, b) => b - a);
  const ask = bestPrice(book && book.asks, (a, b) => a - b);
  if (!bid || !ask) return { ok: false, reason: 'missing bid/ask depth' };
  const spread = ask.price - bid.price;
  return {
    ok: true,
    bid: bid.price,
    ask: ask.price,
    spread,
    midprice: (bid.price + ask.price) / 2,
    bid_size: bid.size,
    ask_size: ask.size,
  };
}

function yesTokenForMarket(market) {
  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  return tokens.find((token) => String(token.outcome || '').toLowerCase() === 'yes') || tokens[0] || null;
}

function summarizePortfolio(portfolio) {
  const openCost = portfolio.positions.reduce((sum, position) => {
    return sum + (toNumber(position.shares) * toNumber(position.avg_price));
  }, 0);
  return {
    virtual_balance: Number(toNumber(portfolio.virtual_balance).toFixed(6)),
    starting_balance: Number(toNumber(portfolio.starting_balance).toFixed(6)),
    open_positions: portfolio.positions.length,
    open_cost: Number(openCost.toFixed(6)),
    equity_marked_at_cost: Number((toNumber(portfolio.virtual_balance) + openCost).toFixed(6)),
  };
}

async function runPolymarketPaperRun(options = {}) {
  const storageDir = options.storageDir || DEFAULT_STORAGE_DIR;
  const strategy = options.strategy || 'low_prob_dip';
  const virtualBalance = toNumber(options.virtualBalance, 100);
  const maxPositionUsd = toNumber(options.maxPositionUsd, 1);
  const maxConcurrent = Math.max(1, Math.floor(toNumber(options.maxConcurrent, 5)));
  const maxEntryPrice = toNumber(options.maxEntryPrice, 0.15);
  const maxSpread = toNumber(options.maxSpread, 0.08);
  const minLiquidity = toNumber(options.minLiquidity, 0);
  const markets = Array.isArray(options.markets) ? options.markets : [];
  const fetchOrderBook = options.fetchOrderBook;
  if (typeof fetchOrderBook !== 'function') {
    return { ok: false, error: 'fetchOrderBook function is required' };
  }

  const now = options.now || new Date().toISOString();
  const cycleId = options.cycleId || `paper-run:${strategy}:${now}`;
  const policy = resolveRuntimePolicy({
    env: options.env || process.env,
    args: [],
    requestedLive: false,
    broker: 'polymarket',
    now,
  });
  const initialized = migrateLegacyPaperState(storageDir, { virtualBalance, now });
  if (!initialized.ok) return initialized;
  const portfolio = initialized.projection;

  const proposedEvents = [];
  const skipped = [];
  const existing = new Set(portfolio.positions.map((position) => String(position.token_id)));

  for (const market of markets) {
    if (portfolio.positions.length >= maxConcurrent) {
      skipped.push({ reason: 'max concurrent positions reached', market: market.question || market.id || null });
      break;
    }
    if (toNumber(market.liquidity, 0) < minLiquidity) {
      skipped.push({ reason: 'below liquidity threshold', market: market.question || market.id || null });
      continue;
    }
    const token = yesTokenForMarket(market);
    if (!token || !token.token_id) {
      skipped.push({ reason: 'missing yes token', market: market.question || market.id || null });
      continue;
    }
    const tokenId = String(token.token_id);
    if (existing.has(tokenId)) {
      skipped.push({ reason: 'already holding token', token_id: tokenId, market: market.question || market.id || null });
      continue;
    }

    let orderbook;
    try {
      orderbook = await fetchOrderBook(tokenId, market);
    } catch (error) {
      const diagnostic = classifyPolymarketGatewayError(error);
      skipped.push({
        reason: diagnostic.error,
        ...(diagnostic.error_category ? { error_category: diagnostic.error_category } : { error_category: 'orderbook_fetch_failed' }),
        token_id: tokenId,
        market: market.question || market.id || null,
      });
      continue;
    }
    if (!orderbook || orderbook.ok === false) {
      skipped.push({
        reason: orderbook && orderbook.error ? orderbook.error : 'orderbook unavailable',
        ...(orderbook && orderbook.error_category ? { error_category: orderbook.error_category } : {}),
        token_id: tokenId,
        market: market.question || market.id || null,
      });
      continue;
    }
    const price = deriveMidprice(orderbook);
    if (!price.ok) {
      skipped.push({ reason: price.reason, token_id: tokenId });
      continue;
    }
    if (price.spread > maxSpread) {
      skipped.push({ reason: 'spread too wide', token_id: tokenId, spread: Number(price.spread.toFixed(6)) });
      continue;
    }
    if (price.midprice > maxEntryPrice) {
      skipped.push({ reason: 'price above strategy threshold', token_id: tokenId, price: Number(price.midprice.toFixed(6)) });
      continue;
    }

    const spend = Math.min(maxPositionUsd, toNumber(portfolio.virtual_balance, 0));
    if (spend <= 0) {
      skipped.push({ reason: 'virtual balance exhausted', token_id: tokenId });
      break;
    }
    const shares = spend / price.midprice;
    const position = {
      position_id: crypto
        .createHash('sha256')
        .update(`${cycleId}:${tokenId}:${now}`)
        .digest('hex')
        .slice(0, 32),
      token_id: tokenId,
      market_id: market.id || market.condition_id || null,
      question: market.question || null,
      outcome: token.outcome || 'Yes',
      shares: Number(shares.toFixed(6)),
      avg_price: Number(price.midprice.toFixed(6)),
      opened_at: now,
      strategy,
    };
    portfolio.positions.push(position);
    portfolio.virtual_balance = Number((toNumber(portfolio.virtual_balance) - spend).toFixed(6));
    existing.add(tokenId);

    const fill = {
      t: now,
      token_id: tokenId,
      outcome: position.outcome,
      side: 'buy',
      shares: position.shares,
      price: position.avg_price,
      reason: strategy,
      market: position.question,
      virtual: true,
    };
    proposedEvents.push({
      event_type: 'paper_fill',
      idempotency_key: `${cycleId}:buy:${tokenId}`,
      cycle_id: cycleId,
      event_time: now,
      decision_time: now,
      data_as_of: market.data_as_of || market.updated_at || now,
      market_id: position.market_id,
      condition_id: market.condition_id || position.market_id,
      token_id: tokenId,
      outcome: position.outcome,
      strategy,
      order_intent: {
        side: 'buy',
        max_position_usd: maxPositionUsd,
        max_entry_price: maxEntryPrice,
        max_spread: maxSpread,
      },
      policy_fingerprint: policy.policy_fingerprint,
      risk_decision: { approved: true, mode: 'paper', max_position_usd: maxPositionUsd },
      paper_fill: fill,
      position,
      position_effect: 'open',
      cash_delta: -spend,
      fees: 0,
      slippage: 0,
    });
  }

  const committed = appendLedgerEvents(storageDir, proposedEvents, { now, startingBalance: virtualBalance });
  if (!committed.ok) return committed;
  const fills = committed.accepted.map((event) => event.paper_fill);
  for (const key of committed.duplicates) {
    skipped.push({ reason: 'duplicate paper intent', idempotency_key: key });
  }
  return {
    ok: true,
    dry_run: true,
    strategy,
    storage_dir: storageDir,
    markets_scanned: markets.length,
    fills,
    skipped,
    ledger_sequence: committed.projection.ledger_sequence,
    ledger_checksum: committed.projection.ledger_checksum,
    policy_fingerprint: policy.policy_fingerprint,
    summary: summarizePortfolio(committed.projection),
  };
}

/**
 * Check open paper positions for resolution via Gamma API.
 * Any position whose market has resolved (active === false) is closed at the
 * inferred YES resolution price, P&L recorded to resolved_positions.jsonl,
 * and virtual balance credited.
 */
async function checkAndCloseResolvedPositions(storageDir = DEFAULT_STORAGE_DIR) {
  const migration = migrateLegacyPaperState(storageDir);
  if (!migration.ok) return migration;
  const portfolio = loadPortfolio(storageDir);
  if (portfolio.positions.length === 0) return { ok: true, closed: [] };

  const now = new Date().toISOString();
  const closed = [];

  for (let i = portfolio.positions.length - 1; i >= 0; i--) {
    const pos = portfolio.positions[i];
    if (!pos.market_id) continue;

    let market;
    try {
      const url = `${GAMMA_BASE}/markets?condition_id=${encodeURIComponent(pos.market_id)}&limit=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const arr = await res.json();
      market = Array.isArray(arr) ? arr[0] : (arr && arr.id ? arr : null);
    } catch { continue; }

    if (!market || market.active !== false) continue;

    const resolutionPrice = inferWinner(market).resolutionPrice;
    const pnl = (resolutionPrice - pos.avg_price) * pos.shares;

    const record = {
      t: now,
      market_id: pos.market_id,
      token_id: pos.token_id,
      question: pos.question || null,
      outcome: pos.outcome || 'Yes',
      shares: pos.shares,
      avg_price: pos.avg_price,
      resolution_price: resolutionPrice,
      pnl: Number(pnl.toFixed(6)),
    };

    // Credit back: original cost was shares * avg_price, we receive shares * resolutionPrice
    const cashCredit = Number((pos.shares * resolutionPrice).toFixed(6));
    portfolio.virtual_balance = Number((toNumber(portfolio.virtual_balance) + cashCredit).toFixed(6));
    portfolio.positions.splice(i, 1);
    const settled = appendLedgerEvents(storageDir, [{
      event_type: 'position_settled',
      idempotency_key: `settlement:${pos.position_id || crypto
        .createHash('sha256')
        .update([
          pos.market_id || '',
          pos.token_id || '',
          pos.opened_at || '',
          pos.shares || '',
          pos.avg_price || '',
        ].join(':'))
        .digest('hex')
        .slice(0, 32)}`,
      cycle_id: `resolution:${now}`,
      event_time: now,
      decision_time: now,
      data_as_of: now,
      market_id: pos.market_id,
      token_id: pos.token_id,
      outcome: pos.outcome,
      strategy: pos.strategy,
      policy_fingerprint: resolveRuntimePolicy({
        requestedProfile: 'private-paper',
        requestedLive: false,
        now,
      }).policy_fingerprint,
      risk_decision: { approved: true, mode: 'paper-resolution' },
      position_effect: 'close',
      settlement: record,
      cash_delta: cashCredit,
      realized_pnl: record.pnl,
    }], { now, startingBalance: portfolio.starting_balance });
    if (!settled.ok) return settled;
    if (settled.accepted.length === 0) continue;
    closed.push(record);
  }

  return { ok: true, closed };
}

module.exports = {
  DEFAULT_STORAGE_DIR,
  checkAndCloseResolvedPositions,
  deriveMidprice,
  loadPortfolio,
  migrateLegacyPaperState,
  runPolymarketPaperRun,
  summarizePortfolio,
  yesTokenForMarket,
};
