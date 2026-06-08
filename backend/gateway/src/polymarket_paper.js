const fs = require('node:fs');
const path = require('node:path');

const { GAMMA_BASE, inferWinner } = require('../../../shared/lib/polymarket_history');
const { classifyPolymarketGatewayError } = require('./polymarket_errors.js');

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

function ensureStorageFiles(dir) {
  ensureDir(dir);
  for (const file of ['fills.jsonl', 'pnl_log.jsonl']) {
    const target = path.join(dir, file);
    if (!fs.existsSync(target)) fs.writeFileSync(target, '');
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadPortfolio(storageDir = DEFAULT_STORAGE_DIR, virtualBalance = 100) {
  ensureStorageFiles(storageDir);
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

function savePortfolio(portfolio, storageDir = DEFAULT_STORAGE_DIR) {
  ensureStorageFiles(storageDir);
  fs.writeFileSync(path.join(storageDir, 'portfolio.json'), JSON.stringify(portfolio, null, 2));
}

function appendJsonl(file, row, storageDir = DEFAULT_STORAGE_DIR) {
  ensureStorageFiles(storageDir);
  fs.appendFileSync(path.join(storageDir, file), `${JSON.stringify(row)}\n`);
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
  const portfolio = loadPortfolio(storageDir, virtualBalance);
  if (!portfolio.opened_at) portfolio.opened_at = now;
  portfolio.updated_at = now;

  const fills = [];
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
    fills.push(fill);
    appendJsonl('fills.jsonl', fill, storageDir);
  }

  savePortfolio(portfolio, storageDir);
  return {
    ok: true,
    dry_run: true,
    strategy,
    storage_dir: storageDir,
    markets_scanned: markets.length,
    fills,
    skipped,
    summary: summarizePortfolio(portfolio),
  };
}

/**
 * Check open paper positions for resolution via Gamma API.
 * Any position whose market has resolved (active === false) is closed at the
 * inferred YES resolution price, P&L recorded to resolved_positions.jsonl,
 * and virtual balance credited.
 */
async function checkAndCloseResolvedPositions(storageDir = DEFAULT_STORAGE_DIR) {
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
    portfolio.virtual_balance = Number(
      (toNumber(portfolio.virtual_balance) + pos.shares * resolutionPrice).toFixed(6)
    );
    portfolio.positions.splice(i, 1);
    appendJsonl('resolved_positions.jsonl', record, storageDir);
    closed.push(record);
  }

  if (closed.length > 0) {
    portfolio.updated_at = now;
    savePortfolio(portfolio, storageDir);
  }

  return { ok: true, closed };
}

module.exports = {
  DEFAULT_STORAGE_DIR,
  checkAndCloseResolvedPositions,
  deriveMidprice,
  loadPortfolio,
  runPolymarketPaperRun,
  savePortfolio,
  summarizePortfolio,
  yesTokenForMarket,
};
