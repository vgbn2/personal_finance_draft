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
} = require('../../../shared/lib/market/polymarket_history.js');
const { runPolymarketBacktest } = require('../../../backend/cli/commands/trade/polymarket_backtest.js');

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
      market_id: 'm-1',
      condition_id: 'cond-1',
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
