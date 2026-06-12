const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ARCHIVE_SCHEMA_VERSION,
  archivePaths,
  backfillPolymarketArchive,
  loadArchivedFeatureRows,
  loadArchivedMarketIndex,
  loadArchivedPriceSeries,
  normalizeGammaMarket,
  normalizePriceHistory,
  summarizeArchiveCoverage,
  writePolymarketArchiveChunk,
} = require('../../../shared/lib/market/polymarket_history.js');

function tempArchive() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'polyhist-'));
}

test('normalizeGammaMarket extracts resolved market tokens and winner metadata', () => {
  const market = normalizeGammaMarket({
    id: '123',
    conditionId: 'cond-1',
    question: 'Will BTC hit 100k?',
    endDate: '2025-01-10T00:00:00.000Z',
    closed: true,
    volume: '1200.5',
    clobTokenIds: '["yes-token","no-token"]',
    outcomes: '["Yes","No"]',
    bestAsk: '0.99',
    outcomePrices: '["0.99","0.01"]',
  });

  assert.equal(market.market_id, '123');
  assert.equal(market.condition_id, 'cond-1');
  assert.equal(market.tokens.length, 2);
  assert.equal(market.tokens[0].token_id, 'yes-token');
  assert.equal(market.winner, 'yes');
  assert.equal(market.resolution_confidence, 'high');
  assert.equal(market.volume, 1200.5);
});

test('normalizePriceHistory sorts, dedupes, and filters invalid prices', () => {
  const rows = normalizePriceHistory([
    { t: 1700000600, p: 0.25 },
    { t: 1700000000, p: '0.10' },
    { t: 1700000000, p: '0.12' },
    { t: 1700001200, p: 1.5 },
    { t: 'bad', p: 0.5 },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].t, 1700000000);
  assert.equal(rows[0].p, 0.12);
  assert.equal(rows[1].p, 0.25);
  assert.equal(rows[0].iso, new Date(1700000000 * 1000).toISOString());
});

test('writePolymarketArchiveChunk writes readable market index and price files', () => {
  const root = tempArchive();
  try {
    const result = writePolymarketArchiveChunk({
      markets: [{
        id: 'm1',
        question: 'Will ETH rally?',
        tokens: [{ outcome: 'Yes', token_id: 'tok-yes' }],
        bestAsk: '0.01',
      }],
      tokenId: 'tok-yes',
      prices: [{ t: 1700000000, p: 0.2 }],
      manifest: { interval: '1h', market_count: 1 },
    }, { root });

    assert.equal(result.ok, true);
    assert.equal(loadArchivedMarketIndex({ root }).length, 1);
    assert.equal(loadArchivedPriceSeries('tok-yes', { root }).length, 1);
    assert.equal(summarizeArchiveCoverage(root).price_points, 1);
    assert.equal(JSON.parse(fs.readFileSync(archivePaths(root).manifest, 'utf8')).schema, ARCHIVE_SCHEMA_VERSION);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backfillPolymarketArchive ingests fixture markets without network', async () => {
  const root = tempArchive();
  try {
    const markets = [{
      id: 'm1',
      question: 'Will SOL close above 200?',
      endDate: '2025-03-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'tok-sol' }],
      bestAsk: '1',
      volume: 5000,
    }];
    const result = await backfillPolymarketArchive({
      root,
      daysBack: 0,
      interval: '1h',
      maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: markets }),
      fetchHistory: async (tokenId) => ({
        ok: true,
        source: 'fixture',
        data: [{ t: 1700000000, p: 0.08 }, { t: 1700003600, p: 0.21 }],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.markets_archived, 1);
    assert.equal(result.tokens_archived, 1);
    assert.equal(result.price_points, 2);
    assert.equal(result.feature_rows, 2);
    assert.equal(loadArchivedPriceSeries('tok-sol', { root }).length, 2);
    assert.equal(loadArchivedFeatureRows('tok-sol', { root }).length, 2);
    assert.equal(summarizeArchiveCoverage(root).feature_files, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
