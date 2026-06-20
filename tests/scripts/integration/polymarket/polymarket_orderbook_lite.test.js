'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  capturePolymarketOrderbookLite,
  loadArchivedOrderbookLite,
  normalizePmxtOrderBookSnapshot,
  summarizeArchiveCoverage,
  writePolymarketArchiveChunk,
} = require('../../../../shared/lib/market/polymarket_history.js');
const {
  runPolymarketBacktest,
  runPolymarketOrderbookLiteBackfill,
} = require('../../../../backend/cli/commands/trade/polymarket_backtest.js');

function tempArchive() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'polyob-'));
}

test('normalizePmxtOrderBookSnapshot derives spread and depth metrics', () => {
  const rows = normalizePmxtOrderBookSnapshot({
    bids: [
      { price: 0.438, size: 80 },
      { price: 0.437, size: 25 },
    ],
    asks: [
      { price: 0.442, size: 60 },
      { price: 0.443, size: 10 },
    ],
    timestamp: 1710000000000,
    datetime: '2024-03-09T00:00:00.000Z',
    lastTradePrice: 0.44,
    sourceMetadata: { source: 'pmxt-archive' },
  }, {
    tokenId: 'tok-1',
    outcome: 'yes',
    role: 'entry',
    since: 1710000000000,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].best_bid, 0.438);
  assert.equal(rows[0].best_ask, 0.442);
  assert.equal(rows[0].mid, 0.44);
  assert.equal(rows[0].spread, 0.004);
  assert.ok(rows[0].depth_1pct > 0);
  assert.ok(rows[0].depth_5pct >= rows[0].depth_1pct);
  assert.equal(rows[0].source, 'pmxt-archive');
});

test('capturePolymarketOrderbookLite writes JSONL snapshots for a candidate window', async () => {
  const root = tempArchive();
  try {
    const market = {
      id: 'm-1',
      market_id: 'm-1',
      condition_id: 'cond-1',
      tokens: [{ token_id: 'tok-1', outcome: 'Yes' }],
      question: 'Will orderbook-lite work?',
    };
    const result = await capturePolymarketOrderbookLite(market, 'tok-1', {
      root,
      role: 'entry',
      since: 1710000000000,
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          data: {
            bids: [{ price: 0.40, size: 50 }],
            asks: [{ price: 0.44, size: 55 }],
            timestamp: 1710000000000,
            datetime: '2024-03-09T00:00:00.000Z',
            lastTradePrice: 0.42,
            sourceMetadata: { source: 'pmxt' },
          },
        }),
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(loadArchivedOrderbookLite('tok-1', { root }).length, 1);
    assert.equal(summarizeArchiveCoverage(root).orderbook_files, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('capturePolymarketOrderbookLite uses market id and yes/no outcome for PMXT', async () => {
  const root = tempArchive();
  try {
    const seen = [];
    const market = {
      id: '573655',
      condition_id: '0xa0f4c4924ea1a8b410b4ce821c2a9955fad21a1b19bdcfde90816732278b3dd5',
      tokens: [{ token_id: '13915689317269078219168496739008737517740566192006337297676041270492637394586', outcome: 'Yes' }],
      question: 'Will Bitcoin hit $150k by June 30, 2026?',
    };
    const result = await capturePolymarketOrderbookLite(market, '13915689317269078219168496739008737517740566192006337297676041270492637394586', {
      root,
      role: 'probe',
      since: 1710000000000,
      fetcher: async (url) => {
        seen.push(String(url));
        return {
          ok: true,
          json: async () => ({
            data: {
              bids: [{ price: 0.40, size: 50 }],
              asks: [{ price: 0.44, size: 55 }],
              timestamp: 1710000000000,
              datetime: '2024-03-09T00:00:00.000Z',
              lastTradePrice: 0.42,
              sourceMetadata: { source: 'pmxt' },
            },
          }),
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.match(seen[0], /outcomeId=573655/);
    assert.match(seen[0], /outcome=yes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('capturePolymarketOrderbookLite resolves yes/no from raw clobTokenIds', async () => {
  const root = tempArchive();
  try {
    const seen = [];
    const market = {
      id: '573655',
      condition_id: '0xa0f4c4924ea1a8b410b4ce821c2a9955fad21a1b19bdcfde90816732278b3dd5',
      clobTokenIds: '["13915689317269078219168496739008737517740566192006337297676041270492637394586","13290642914521189871602119663452054126359842904805799115978921503195267156991"]',
      question: 'Will Bitcoin hit $150k by June 30, 2026?',
    };
    const result = await capturePolymarketOrderbookLite(market, '13915689317269078219168496739008737517740566192006337297676041270492637394586', {
      root,
      role: 'probe',
      since: 1710000000000,
      fetcher: async (url) => {
        seen.push(String(url));
        return {
          ok: true,
          json: async () => ({
            data: {
              bids: [{ price: 0.40, size: 50 }],
              asks: [{ price: 0.44, size: 55 }],
              timestamp: 1710000000000,
              datetime: '2024-03-09T00:00:00.000Z',
              lastTradePrice: 0.42,
              sourceMetadata: { source: 'pmxt' },
            },
          }),
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.match(seen[0], /outcomeId=573655/);
    assert.match(seen[0], /outcome=yes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runPolymarketBacktest records orderbook-lite snapshots when enabled', async () => {
  const root = tempArchive();
  try {
    writePolymarketArchiveChunk({
      markets: [{
        id: 'mkt-lite',
        question: 'Will the snapshot be captured?',
        endDate: '2026-02-01T00:00:00.000Z',
        tokens: [{ outcome: 'Yes', token_id: 'tok-lite' }],
        bestAsk: '1',
        volume: 5000,
      }],
      tokenId: 'tok-lite',
      prices: [
        { t: 1700000000, p: 0.08 },
        { t: 1700086400, p: 0.30 },
      ],
    }, { root });

    const result = await runPolymarketBacktest({
      archiveRoot: root,
      strategy: 'low_prob_dip',
      maxMarkets: 1,
      entryThreshold: 0.15,
      captureOrderbookLite: true,
      _captureOrderbookLite: async (market, tokenId, opts) => ({
        ok: true,
        rows: [{
          market_id: market.market_id || market.id || null,
          condition_id: market.condition_id || market.conditionId || null,
          token_id: tokenId,
          role: opts.role,
          snapshot_ts: Math.floor(Number(opts.since) / 1000),
          snapshot_iso: new Date(Number(opts.since)).toISOString(),
          source: 'pmxt_archive',
          best_bid: 0.40,
          best_ask: 0.44,
          mid: 0.42,
          spread: 0.04,
          depth_1pct: 60,
          depth_5pct: 120,
          last_trade_price: 0.42,
          is_neg_risk: false,
          raw_source: null,
        }],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.orderbookLiteCaptured, 2);
    assert.equal(result.orderbookLiteFailures, 0);
    assert.ok(result.results[0].orderbookLite.entry);
    assert.equal(result.results[0].orderbookLite.entry.depth_5pct, 120);
    assert.ok(result.totalExecutionCost > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runPolymarketOrderbookLiteBackfill delegates to the capture path', async () => {
  const root = tempArchive();
  try {
    writePolymarketArchiveChunk({
      markets: [{
        id: 'mkt-backfill',
        question: 'Will the backfill path work?',
        endDate: '2026-02-01T00:00:00.000Z',
        tokens: [{ outcome: 'Yes', token_id: 'tok-backfill' }],
        bestAsk: '1',
        volume: 5000,
      }],
      tokenId: 'tok-backfill',
      prices: [
        { t: 1700000000, p: 0.07 },
        { t: 1700086400, p: 0.29 },
      ],
    }, { root });

    const result = await runPolymarketOrderbookLiteBackfill({
      archiveRoot: root,
      strategy: 'low_prob_dip',
      maxMarkets: 1,
      entryThreshold: 0.15,
      captureThrottleMs: 0,
      _captureOrderbookLite: async (market, tokenId, opts) => ({
        ok: true,
        rows: [{
          market_id: market.market_id || market.id || null,
          condition_id: market.condition_id || market.conditionId || null,
          token_id: tokenId,
          role: opts.role,
          snapshot_ts: Math.floor(Number(opts.since) / 1000),
          snapshot_iso: new Date(Number(opts.since)).toISOString(),
          source: 'pmxt_archive',
          best_bid: 0.39,
          best_ask: 0.43,
          mid: 0.41,
          spread: 0.04,
          depth_1pct: 55,
          depth_5pct: 130,
          last_trade_price: 0.41,
          is_neg_risk: false,
          raw_source: null,
        }],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'orderbook_lite_backfill');
    assert.equal(result.downloadedSnapshots, 2);
    assert.equal(result.failedSnapshots, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runPolymarketOrderbookLiteBackfill captures fallback windows without price history', async () => {
  const root = tempArchive();
  try {
    writePolymarketArchiveChunk({
      markets: [{
        id: 'mkt-empty',
        question: 'Will fallback capture still work?',
        createdAt: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-10T00:00:00.000Z',
        tokens: [{ outcome: 'Yes', token_id: 'tok-empty' }],
        volume: 5000,
      }],
      tokenId: 'tok-empty',
      prices: [],
    }, { root });

    const result = await runPolymarketOrderbookLiteBackfill({
      archiveRoot: root,
      strategy: 'low_prob_dip',
      maxMarkets: 1,
      entryThreshold: 0.15,
      captureThrottleMs: 0,
      _captureOrderbookLite: async (market, tokenId, opts) => ({
        ok: true,
        rows: [{
          market_id: market.market_id || market.id || null,
          condition_id: market.condition_id || market.conditionId || null,
          token_id: tokenId,
          role: opts.role,
          snapshot_ts: Math.floor(Number(opts.since) / 1000),
          snapshot_iso: new Date(Number(opts.since)).toISOString(),
          source: 'pmxt_archive',
          best_bid: 0.39,
          best_ask: 0.43,
          mid: 0.41,
          spread: 0.04,
          depth_1pct: 55,
          depth_5pct: 130,
          last_trade_price: 0.41,
          is_neg_risk: false,
          raw_source: null,
        }],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'orderbook_lite_backfill');
    assert.equal(result.downloadedSnapshots, 2);
    assert.equal(result.failedSnapshots, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
