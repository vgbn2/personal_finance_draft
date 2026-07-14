const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  checkAndCloseResolvedPositions,
  deriveMidprice,
  loadPortfolio,
  runPolymarketPaperRun,
  savePortfolio,
  yesTokenForMarket,
} = require('../../../../backend/gateway/src/polymarket_paper');

function tempStorageDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-paper-'));
}

const market = {
  id: 'm1',
  question: 'Will Bitcoin hit $150k in 2026?',
  liquidity: 1000,
  tokens: [
    { outcome: 'Yes', token_id: 'yes-token' },
    { outcome: 'No', token_id: 'no-token' },
  ],
};

test('deriveMidprice computes spread-aware midpoint from orderbook depth', () => {
  const price = deriveMidprice({
    book: {
      bids: [{ price: '0.10', size: '20' }],
      asks: [{ price: '0.12', size: '15' }],
    },
  });

  assert.equal(price.ok, true);
  assert.equal(price.bid, 0.10);
  assert.equal(price.ask, 0.12);
  assert.equal(Number(price.midprice.toFixed(2)), 0.11);
});

test('yesTokenForMarket prefers explicit Yes outcome', () => {
  assert.equal(yesTokenForMarket(market).token_id, 'yes-token');
});

test('paper run logs virtual fill, persists portfolio, and dedupes held token', async () => {
  const storageDir = tempStorageDir();
  const fetchOrderBook = async () => ({
    ok: true,
    book: {
      bids: [{ price: '0.10', size: '50' }],
      asks: [{ price: '0.12', size: '50' }],
    },
  });

  const first = await runPolymarketPaperRun({
    storageDir,
    markets: [market],
    fetchOrderBook,
    virtualBalance: 100,
    maxPositionUsd: 1,
    now: '2026-06-06T00:00:00.000Z',
  });

  assert.equal(first.ok, true);
  assert.equal(first.fills.length, 1);
  assert.equal(first.summary.open_positions, 1);
  assert.equal(first.summary.virtual_balance, 99);

  const fills = fs.readFileSync(path.join(storageDir, 'fills.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(fills.length, 1);
  assert.equal(fills[0].token_id, 'yes-token');
  assert.equal(fills[0].virtual, true);
  assert.equal(fs.existsSync(path.join(storageDir, 'pnl_log.jsonl')), true);

  const portfolio = loadPortfolio(storageDir, 100);
  assert.equal(portfolio.positions.length, 1);
  assert.equal(portfolio.positions[0].avg_price, 0.11);

  const second = await runPolymarketPaperRun({
    storageDir,
    markets: [market],
    fetchOrderBook,
    virtualBalance: 100,
    maxPositionUsd: 1,
    now: '2026-06-06T00:05:00.000Z',
  });

  assert.equal(second.fills.length, 0);
  assert.equal(second.skipped[0].reason, 'already holding token');
});

test('paper run skips markets whose orderbook fetch throws', async () => {
  const storageDir = tempStorageDir();
  const throwMarket = {
    ...market,
    id: 'm-fetch-throw',
    tokens: [
      { outcome: 'Yes', token_id: 'throw-token' },
      { outcome: 'No', token_id: 'throw-no-token' },
    ],
  };
  const result = await runPolymarketPaperRun({
    storageDir,
    markets: [throwMarket],
    fetchOrderBook: async () => {
      throw new Error('fetch failed');
    },
    virtualBalance: 100,
    maxPositionUsd: 1,
    now: '2026-06-06T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.fills.length, 0);
  const networkSkip = result.skipped.find((entry) => /fetch failed/.test(entry.reason));
  assert.ok(networkSkip, `expected fetch failed skip, got ${JSON.stringify(result.skipped)}`);
  assert.equal(networkSkip.error_category, 'network_unavailable');
});

test('checkAndCloseResolvedPositions closes a resolved position and credits balance', async () => {
  const storageDir = tempStorageDir();
  // Seed a portfolio with one open position
  const portfolio = loadPortfolio(storageDir, 100);
  portfolio.positions = [{
    token_id: 'yes-token-resolved',
    market_id: 'condition-abc',
    question: 'Will it rain?',
    outcome: 'Yes',
    shares: 10,
    avg_price: 0.1,
    opened_at: '2026-06-01T00:00:00.000Z',
    strategy: 'low_prob_dip',
  }];
  portfolio.virtual_balance = 99;
  savePortfolio(portfolio, storageDir);

  // Mock global.fetch to return a resolved market (active === false, YES won)
  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [{ id: 'condition-abc', active: false, bestAsk: '0.95', outcomePrices: '["0.95","0.05"]' }],
  });

  try {
    const result = await checkAndCloseResolvedPositions(storageDir);
    assert.equal(result.ok, true);
    assert.equal(result.closed.length, 1);
    assert.equal(result.closed[0].resolution_price, 1.0);

    const updated = loadPortfolio(storageDir, 100);
    assert.equal(updated.positions.length, 0);
    // balance credited: 99 + 10 shares * 1.0 resolution = 109
    assert.ok(Math.abs(updated.virtual_balance - 109) < 0.001, `balance should be ~109, got ${updated.virtual_balance}`);

    const resolvedLog = path.join(storageDir, 'resolved_positions.jsonl');
    assert.ok(fs.existsSync(resolvedLog), 'resolved_positions.jsonl should exist');
    const lines = fs.readFileSync(resolvedLog, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const rec = JSON.parse(lines[0]);
    assert.equal(rec.market_id, 'condition-abc');
    assert.equal(rec.resolution_price, 1.0);
  } finally {
    global.fetch = origFetch;
  }
});

test('checkAndCloseResolvedPositions leaves active positions open', async () => {
  const storageDir = tempStorageDir();
  const portfolio = loadPortfolio(storageDir, 100);
  portfolio.positions = [{
    token_id: 'yes-token-active',
    market_id: 'condition-xyz',
    question: 'Will BTC hit $200k?',
    outcome: 'Yes',
    shares: 5,
    avg_price: 0.08,
    opened_at: '2026-06-01T00:00:00.000Z',
    strategy: 'low_prob_dip',
  }];
  portfolio.virtual_balance = 99.6;
  savePortfolio(portfolio, storageDir);

  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    // active === true → market still open
    json: async () => [{ id: 'condition-xyz', active: true, bestAsk: '0.10' }],
  });

  try {
    const result = await checkAndCloseResolvedPositions(storageDir);
    assert.equal(result.ok, true);
    assert.equal(result.closed.length, 0);

    const updated = loadPortfolio(storageDir, 100);
    assert.equal(updated.positions.length, 1, 'active position should remain');
    assert.ok(Math.abs(updated.virtual_balance - 99.6) < 0.001, 'balance should be unchanged');
  } finally {
    global.fetch = origFetch;
  }
});
