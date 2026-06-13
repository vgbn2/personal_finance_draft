const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_SCHEMA_VERSION_V2,
  archivePaths,
  backfillPolymarketArchive,
  loadArchivedFeatureRows,
  loadArchivedMarketIndex,
  loadArchivedPriceSeries,
  normalizeGammaMarket,
  normalizePriceHistory,
  summarizeArchiveCoverage,
  tokenPricePath,
  tokenFeaturePath,
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

// ── Skip-existing tests ───────────────────────────────────────────────────────

test('backfillPolymarketArchive skip-existing: non-empty price file skips fetch', async () => {
  const root = tempArchive();
  try {
    const markets = [{
      id: 'skip-m1',
      question: 'Skip market?',
      endDate: '2025-04-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'skip-tok1' }],
      bestAsk: '0.5',
      volume: 1000,
    }];

    // Pre-seed a non-empty price file.
    const { ensureArchive: _ea } = require('../../../shared/lib/market/polymarket_history.js');
    const paths = archivePaths(root);
    fs.mkdirSync(paths.pricesDir, { recursive: true });
    fs.mkdirSync(paths.featuresDir, { recursive: true });
    const existingPrices = [{ t: 1700000000, p: 0.5, iso: new Date(1700000000 * 1000).toISOString(), source: 'fixture' }];
    fs.writeFileSync(tokenPricePath('skip-tok1', root), JSON.stringify(existingPrices));

    let fetchHistoryCalls = 0;
    const result = await backfillPolymarketArchive({
      root,
      daysBack: 0,
      maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: markets }),
      fetchHistory: async () => {
        fetchHistoryCalls++;
        return { ok: true, source: 'fixture', data: [{ t: 1700007200, p: 0.6 }] };
      },
    });

    assert.equal(fetchHistoryCalls, 0, 'fetchHistory should not be called for pre-seeded token');
    assert.equal(result.skipped_existing, 1);
    // Price points from on-disk data should be counted.
    assert.equal(result.price_points, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backfillPolymarketArchive skip-existing: empty price file triggers fetch', async () => {
  const root = tempArchive();
  try {
    const markets = [{
      id: 'empty-m1',
      question: 'Empty price market?',
      endDate: '2025-04-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'empty-tok1' }],
      bestAsk: '0.5',
      volume: 1000,
    }];

    // Pre-seed an EMPTY price array.
    const paths = archivePaths(root);
    fs.mkdirSync(paths.pricesDir, { recursive: true });
    fs.mkdirSync(paths.featuresDir, { recursive: true });
    fs.writeFileSync(tokenPricePath('empty-tok1', root), JSON.stringify([]));

    let fetchHistoryCalls = 0;
    await backfillPolymarketArchive({
      root,
      daysBack: 0,
      maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: markets }),
      fetchHistory: async () => {
        fetchHistoryCalls++;
        return { ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.5 }] };
      },
    });

    assert.equal(fetchHistoryCalls, 1, 'fetchHistory must be called for empty price file');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backfillPolymarketArchive skip-existing: refresh:true always fetches', async () => {
  const root = tempArchive();
  try {
    const markets = [
      {
        id: 'ref-m1',
        question: 'Refresh market A?',
        endDate: '2025-04-01T00:00:00.000Z',
        tokens: [{ outcome: 'Yes', token_id: 'ref-tok1' }],
        bestAsk: '0.5',
        volume: 1000,
      },
      {
        id: 'ref-m2',
        question: 'Refresh market B?',
        endDate: '2025-04-02T00:00:00.000Z',
        tokens: [{ outcome: 'Yes', token_id: 'ref-tok2' }],
        bestAsk: '0.5',
        volume: 1000,
      },
    ];

    // Pre-seed non-empty price files for both tokens.
    const paths = archivePaths(root);
    fs.mkdirSync(paths.pricesDir, { recursive: true });
    fs.mkdirSync(paths.featuresDir, { recursive: true });
    const seedPrices = [{ t: 1700000000, p: 0.5, iso: new Date(1700000000 * 1000).toISOString(), source: 'fixture' }];
    fs.writeFileSync(tokenPricePath('ref-tok1', root), JSON.stringify(seedPrices));
    fs.writeFileSync(tokenPricePath('ref-tok2', root), JSON.stringify(seedPrices));

    let fetchHistoryCalls = 0;
    await backfillPolymarketArchive({
      root,
      daysBack: 0,
      maxMarkets: 5,
      refresh: true,
      fetchMarketsPage: async () => ({ ok: true, data: markets }),
      fetchHistory: async () => {
        fetchHistoryCalls++;
        return { ok: true, source: 'fixture', data: [{ t: 1700007200, p: 0.6 }] };
      },
    });

    assert.equal(fetchHistoryCalls, 2, 'refresh:true must call fetchHistory for both tokens');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── Index merge tests ─────────────────────────────────────────────────────────

test('backfillPolymarketArchive index merge: two runs produce union', async () => {
  const root = tempArchive();
  try {
    const marketsA = [{
      id: 'merge-m1',
      question: 'Merge A?',
      endDate: '2025-04-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'merge-tok1' }],
      bestAsk: '0.9',
      volume: 1000,
    }];
    const marketsB = [{
      id: 'merge-m2',
      question: 'Merge B?',
      endDate: '2025-04-02T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'merge-tok2' }],
      bestAsk: '0.1',
      volume: 2000,
    }];

    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: marketsA }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.9 }] }),
    });
    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: marketsB }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.1 }] }),
    });

    const index = loadArchivedMarketIndex({ root });
    const ids = index.map((m) => m.market_id);
    assert.ok(ids.includes('merge-m1'), 'merge-m1 must be in merged index');
    assert.ok(ids.includes('merge-m2'), 'merge-m2 must be in merged index');
    assert.equal(index.length, 2, 'Union must have exactly 2 entries');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backfillPolymarketArchive index merge: third run overlapping market updates data', async () => {
  const root = tempArchive();
  try {
    const marketV1 = [{
      id: 'overlap-m1',
      question: 'Old question?',
      endDate: '2025-04-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'overlap-tok1' }],
      bestAsk: '0.5',
      volume: 1000,
    }];
    const marketV2 = [{
      id: 'overlap-m1',
      question: 'Updated question!',
      endDate: '2025-04-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: 'overlap-tok1' }],
      bestAsk: '0.8',
      volume: 9999,
    }];

    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: marketV1 }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.5 }] }),
    });
    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      refresh: true,
      fetchMarketsPage: async () => ({ ok: true, data: marketV2 }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.8 }] }),
    });

    const index = loadArchivedMarketIndex({ root });
    assert.equal(index.length, 1, 'Duplicate market_id must be merged into one entry');
    assert.equal(index[0].question, 'Updated question!', 'Newer run data must win');
    assert.equal(index[0].volume, 9999);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── Manifest v2 tests ─────────────────────────────────────────────────────────

test('backfillPolymarketArchive manifest v2: schema, runs, totals, and legacy mirror keys', async () => {
  const root = tempArchive();
  try {
    const mkMarkets = (id, tokId) => [{
      id,
      question: `Market ${id}?`,
      endDate: '2025-05-01T00:00:00.000Z',
      tokens: [{ outcome: 'Yes', token_id: tokId }],
      bestAsk: '0.6',
      volume: 500,
    }];

    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: mkMarkets('man-m1', 'man-tok1') }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.6 }, { t: 1700003600, p: 0.7 }] }),
    });
    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      fetchMarketsPage: async () => ({ ok: true, data: mkMarkets('man-m2', 'man-tok2') }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.4 }, { t: 1700003600, p: 0.5 }] }),
    });

    const manifest = JSON.parse(fs.readFileSync(archivePaths(root).manifest, 'utf8'));

    assert.equal(manifest.schema, ARCHIVE_SCHEMA_VERSION_V2, 'schema must be v2');
    assert.equal(manifest.runs.length, 2, 'must have 2 run entries');
    assert.ok(manifest.totals && typeof manifest.totals.price_points === 'number', 'totals.price_points must exist');
    assert.ok(manifest.totals.price_points >= 4, 'totals must reflect all archived price points');

    // Legacy mirror keys must be present.
    assert.ok('market_count' in manifest, 'legacy market_count must be mirrored');
    assert.ok('tokens_archived' in manifest, 'legacy tokens_archived must be mirrored');
    assert.ok('price_points' in manifest, 'legacy price_points must be mirrored');
    assert.ok('feature_rows' in manifest, 'legacy feature_rows must be mirrored');
    assert.ok('missing_history_count' in manifest, 'legacy missing_history_count must be mirrored');
    assert.ok('errors_count' in manifest, 'legacy errors_count must be mirrored');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── delayMs / sleep tests ─────────────────────────────────────────────────────

test('backfillPolymarketArchive delayMs: sleep called between real fetches', async () => {
  const root = tempArchive();
  try {
    const markets = [
      { id: 'dl-m1', question: 'DL 1?', endDate: '2025-05-01T00:00:00.000Z', tokens: [{ outcome: 'Yes', token_id: 'dl-tok1' }], bestAsk: '0.5', volume: 100 },
      { id: 'dl-m2', question: 'DL 2?', endDate: '2025-05-02T00:00:00.000Z', tokens: [{ outcome: 'Yes', token_id: 'dl-tok2' }], bestAsk: '0.5', volume: 100 },
      { id: 'dl-m3', question: 'DL 3?', endDate: '2025-05-03T00:00:00.000Z', tokens: [{ outcome: 'Yes', token_id: 'dl-tok3' }], bestAsk: '0.5', volume: 100 },
    ];

    let sleepCalls = 0;
    const fakeSleep = async (ms) => { sleepCalls++; };

    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      delayMs: 10,
      sleep: fakeSleep,
      fetchMarketsPage: async () => ({ ok: true, data: markets }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.5 }] }),
    });

    // 3 tokens → 3 real fetches → sleep called 2 times (between fetches, not before first, not after last).
    assert.equal(sleepCalls, 2, 'sleep must be called exactly N-1 times for N fetches');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backfillPolymarketArchive delayMs: skipped tokens do not trigger sleep', async () => {
  const root = tempArchive();
  try {
    const markets = [
      { id: 'dls-m1', question: 'DLS 1?', endDate: '2025-05-01T00:00:00.000Z', tokens: [{ outcome: 'Yes', token_id: 'dls-tok1' }], bestAsk: '0.5', volume: 100 },
      { id: 'dls-m2', question: 'DLS 2?', endDate: '2025-05-02T00:00:00.000Z', tokens: [{ outcome: 'Yes', token_id: 'dls-tok2' }], bestAsk: '0.5', volume: 100 },
      { id: 'dls-m3', question: 'DLS 3?', endDate: '2025-05-03T00:00:00.000Z', tokens: [{ outcome: 'Yes', token_id: 'dls-tok3' }], bestAsk: '0.5', volume: 100 },
    ];

    // Pre-seed tok1 and tok2 so they are skipped; only tok3 triggers a real fetch.
    const paths = archivePaths(root);
    fs.mkdirSync(paths.pricesDir, { recursive: true });
    fs.mkdirSync(paths.featuresDir, { recursive: true });
    const seedPrices = [{ t: 1700000000, p: 0.5, iso: new Date(1700000000 * 1000).toISOString(), source: 'fixture' }];
    fs.writeFileSync(tokenPricePath('dls-tok1', root), JSON.stringify(seedPrices));
    fs.writeFileSync(tokenPricePath('dls-tok2', root), JSON.stringify(seedPrices));

    let sleepCalls = 0;
    const fakeSleep = async () => { sleepCalls++; };

    await backfillPolymarketArchive({
      root, daysBack: 0, maxMarkets: 5,
      delayMs: 10,
      sleep: fakeSleep,
      fetchMarketsPage: async () => ({ ok: true, data: markets }),
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [{ t: 1700000000, p: 0.5 }] }),
    });

    // Only 1 real fetch → sleep called 0 times (no inter-fetch gap needed).
    assert.equal(sleepCalls, 0, 'sleep must not be called when only 1 real fetch occurs');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
