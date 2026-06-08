const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runPolymarketBacktest,
  signalLowProbDip,
  signalMeanRevert,
} = require('../../../backend/cli/commands/trade/polymarket_backtest.js');
const { buildPriceSeries, inferWinner, gammaFinalPrice } = require('../../../shared/lib/polymarket_history.js');

// --- Unit tests for signal helpers ---

test('signalLowProbDip fires when first price is below threshold', () => {
  const series = [
    { timestamp: '2025-01-01T00:00:00.000Z', price: 0.08 },
    { timestamp: '2025-01-02T00:00:00.000Z', price: 0.12 },
    { timestamp: '2025-01-03T00:00:00.000Z', price: 0.20 },
  ];
  const entry = signalLowProbDip(series, { entryThreshold: 0.15 });
  assert.ok(entry !== null);
  assert.ok(entry.price <= 0.15);
  assert.equal(entry.timestamp, '2025-01-01T00:00:00.000Z');
});

test('signalLowProbDip returns null when all early prices exceed threshold', () => {
  const series = [
    { timestamp: '2025-01-01T00:00:00.000Z', price: 0.50 },
    { timestamp: '2025-01-02T00:00:00.000Z', price: 0.60 },
    { timestamp: '2025-01-03T00:00:00.000Z', price: 0.70 },
  ];
  const entry = signalLowProbDip(series, { entryThreshold: 0.15 });
  assert.equal(entry, null);
});

test('signalMeanRevert returns null when no dip below MA - 1std', () => {
  // Flat series: std ≈ 0, trigger ≈ MA, no point strictly below
  const series = [0.5, 0.5, 0.5, 0.5, 0.5].map((price, i) => ({
    timestamp: new Date(Date.parse('2025-01-01') + i * 86400000).toISOString(),
    price,
  }));
  const entry = signalMeanRevert(series);
  assert.equal(entry, null);
});

test('signalMeanRevert fires when a price dips below MA - std', () => {
  const prices = [0.5, 0.48, 0.52, 0.51, 0.10];  // last point is a sharp dip
  const series = prices.map((price, i) => ({
    timestamp: new Date(Date.parse('2025-01-01') + i * 86400000).toISOString(),
    price,
  }));
  const entry = signalMeanRevert(series);
  assert.ok(entry !== null, 'Expected a dip entry');
  assert.ok(entry.price <= 0.12, 'Entry price should be at the dip');
});

// --- buildPriceSeries unit tests ---

test('buildPriceSeries converts raw CLOB points and filters invalid prices', () => {
  const raw = [
    { t: 1700000000, p: '0.15' },
    { t: 1700086400, p: '0.20' },
    { t: 1700172800, p: '1.5'  },  // invalid — filtered out
    { t: 1699913600, p: '0.10' },  // earlier, should appear first after sort
  ];
  const series = buildPriceSeries(raw);
  assert.equal(series.length, 3);
  assert.equal(series[0].price, 0.10);  // sorted ascending
  assert.equal(series[1].price, 0.15);
  assert.ok(typeof series[0].timestamp === 'string');
});

// --- inferWinner unit tests ---

test('inferWinner returns YES from bestAsk >= 0.9', () => {
  const result = inferWinner({ bestAsk: '1', outcomePrices: '["0.5","0.5"]' });
  assert.equal(result.yesWon, true);
  assert.equal(result.resolutionPrice, 1.0);
  assert.equal(result.confidence, 'high');
});

test('inferWinner returns NO from bestAsk <= 0.1', () => {
  const result = inferWinner({ bestAsk: '0.02', outcomePrices: '["0.02","0.98"]' });
  assert.equal(result.yesWon, false);
  assert.equal(result.resolutionPrice, 0.0);
});

test('inferWinner falls back to outcomePrices when bestAsk is ambiguous', () => {
  const result = inferWinner({ bestAsk: '0.5', outcomePrices: '["0.97","0.03"]' });
  assert.equal(result.yesWon, true);
  assert.equal(result.confidence, 'low');
});

test('gammaFinalPrice parses outcomePrices JSON string', () => {
  assert.equal(gammaFinalPrice({ outcomePrices: '["0.08","0.92"]' }), 0.08);
  assert.equal(gammaFinalPrice({ outcomePrices: '["0.5","0.5"]' }), 0.5);
  assert.equal(gammaFinalPrice({}), null);
});

// --- Integration-style contract test (no network: fixture injection) ---

test('runPolymarketBacktest produces correct P&L report with fixture data', async () => {
  const fixtureMarkets = [
    {
      id: 'mkt-001',
      question: 'Will BTC exceed $100k?',
      endDate: '2025-03-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'token-abc' }, { outcome: 'No', token_id: 'token-xyz' }],
      bestAsk: '1',  // YES won
    },
    {
      id: 'mkt-002',
      question: 'Will ETH flip BTC?',
      endDate: '2025-02-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'token-def' }],
      bestAsk: '0.02',  // YES lost
    },
  ];

  const fixtureHistory = {
    'token-abc': [
      { t: 1700000000, p: 0.08 },
      { t: 1700086400, p: 0.12 },
      { t: 1700172800, p: 0.09 },
    ],
    'token-def': [
      { t: 1700000000, p: 0.05 },
      { t: 1700086400, p: 0.10 },
      { t: 1700172800, p: 0.07 },
    ],
  };

  const mockFetchMarkets = async () => ({ ok: true, source: 'fixture', data: fixtureMarkets });
  const mockFetchHistory = async (tokenId) => ({
    ok: true,
    source: 'fixture',
    data: fixtureHistory[tokenId] || [],
  });

  const result = await runPolymarketBacktest({
    strategy: 'low_prob_dip',
    entryThreshold: 0.15,
    _fetchMarkets: mockFetchMarkets,
    _fetchHistory: mockFetchHistory,
  });

  assert.equal(result.ok, true);
  assert.equal(result.strategy, 'low_prob_dip');
  assert.equal(result.trades, 2, 'Both markets should trigger a trade below 0.15 threshold');
  assert.equal(result.wins, 1, 'Only mkt-001 (YES won) should be a win');
  assert.equal(result.losses, 1);
  assert.ok(result.totalPnl > 0, 'Net P&L should be positive (mkt-001 big win, mkt-002 small loss)');
  assert.equal(typeof result.winRate, 'number');
  assert.equal(result.results.length, 2);
  assert.ok(result.results[0].pnl !== undefined);
});

test('runPolymarketBacktest uses Gamma outcomePrices fallback when CLOB is empty', async () => {
  // Resolved market with no CLOB history — outcomePrices as synthetic entry point
  const fixtureMarkets = [
    {
      id: 'mkt-resolved',
      question: 'Will EIP-4844 ship by EOY?',
      endDate: '2024-01-01T00:00:00.000Z',
      clobTokenIds: '["token-yes","token-no"]',  // JSON string, as Gamma returns for resolved markets
      bestAsk: '0',  // YES lost
      outcomePrices: '["0.08","0.92"]',  // YES was at 0.08 (low-prob entry candidate)
    },
  ];

  const mockFetchMarkets = async () => ({ ok: true, source: 'fixture', data: fixtureMarkets });
  const mockFetchHistory = async () => ({ ok: true, source: 'fixture', data: [] });  // CLOB empty

  const result = await runPolymarketBacktest({
    strategy: 'low_prob_dip',
    entryThreshold: 0.15,
    _fetchMarkets: mockFetchMarkets,
    _fetchHistory: mockFetchHistory,
  });

  assert.equal(result.ok, true);
  assert.equal(result.marketsScanned, 1);
  assert.equal(result.gammaFallbacks, 1, 'Should record Gamma fallback');
  assert.equal(result.trades, 1, 'outcomePrices[0]=0.08 < threshold 0.15 should trigger entry');
  assert.equal(result.wins, 0, 'YES lost — bestAsk=0 → resolutionPrice=0.0 → pnl < 0');
  assert.ok(result.results[0].gammaFallback === true);
});

test('runPolymarketBacktest returns error for unknown strategy', async () => {
  const mockFetchMarkets = async () => ({
    ok: true, source: 'fixture',
    data: [{
      id: 'm1',
      tokens: [{ outcome: 'Yes', token_id: 'tok1' }],
      bestAsk: '1',
    }],
  });
  const mockFetchHistory = async () => ({
    ok: true, source: 'fixture',
    data: [{ t: 1700000000, p: 0.05 }, { t: 1700086400, p: 0.08 }, { t: 1700172800, p: 0.06 }],
  });

  const result = await runPolymarketBacktest({
    strategy: 'nonexistent',
    _fetchMarkets: mockFetchMarkets,
    _fetchHistory: mockFetchHistory,
  });
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('Unknown strategy'));
});
