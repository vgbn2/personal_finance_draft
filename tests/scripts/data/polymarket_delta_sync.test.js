'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  fetchClobDepth,
  syncGammaMarketsDelta,
} = require('../../../shared/lib/market/polymarket_history.js');
const {
  EventLedger,
  computeEventHash,
  GENESIS_PREV_HASH,
} = require('../../../shared/lib/storage/event_ledger.js');

test('Pillar 3: fetchClobDepth calculates depth, spread and liquidity imbalance', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      bids: [
        { price: '0.52', size: '1000' },
        { price: '0.51', size: '2000' },
        { price: '0.50', size: '3000' },
      ],
      asks: [
        { price: '0.54', size: '500' },
        { price: '0.55', size: '1500' },
        { price: '0.56', size: '2000' },
      ],
    }),
  });

  const depth = await fetchClobDepth('0x1234567890abcdef', 3, { fetchImpl: mockFetch });
  assert.strictEqual(depth.token_id, '0x1234567890abcdef');
  assert.strictEqual(depth.best_bid, 0.52);
  assert.strictEqual(depth.best_ask, 0.54);
  assert.strictEqual(depth.mid_price, 0.53);
  assert.strictEqual(depth.spread, 0.02);
  assert.strictEqual(depth.total_bid_volume, 6000);
  assert.strictEqual(depth.total_ask_volume, 4000);
  // Imbalance: (6000 - 4000) / (6000 + 4000) = 2000 / 10000 = 0.20
  assert.strictEqual(depth.imbalance, 0.2);
});

test('Pillar 3: syncGammaMarketsDelta performs cursor delta pagination and stops at watermark', async () => {
  const pages = [
    {
      ok: true,
      markets: [
        { id: '1', question: 'Market 1', updated_at: '2026-09-25T12:00:00Z', tokens: [{ outcome: 'Yes', token_id: 't1' }] },
        { id: '2', question: 'Market 2', updated_at: '2026-09-25T10:00:00Z', tokens: [{ outcome: 'Yes', token_id: 't2' }] },
      ],
    },
    {
      ok: true,
      markets: [
        { id: '3', question: 'Market 3', updated_at: '2026-09-25T08:00:00Z', tokens: [{ outcome: 'Yes', token_id: 't3' }] },
        { id: '4', question: 'Market 4', updated_at: '2026-09-25T06:00:00Z', tokens: [{ outcome: 'Yes', token_id: 't4' }] },
      ],
    },
  ];

  let pageIdx = 0;
  const mockPageFetcher = async () => pages[pageIdx++] || { ok: true, markets: [] };

  // Sync with cursor at 2026-09-25T09:00:00Z
  const sync = await syncGammaMarketsDelta({
    fetchMarketsPage: mockPageFetcher,
    cursor: '2026-09-25T09:00:00Z',
    pageLimit: 2,
    maxMarkets: 10,
  });

  assert.strictEqual(sync.reached_cursor, true);
  assert.strictEqual(sync.count, 2, 'Should only include Market 1 and Market 2 before cursor');
  assert.strictEqual(sync.next_cursor, '2026-09-25T12:00:00Z');
  assert.strictEqual(sync.markets[0].id, '1');
  assert.strictEqual(sync.markets[1].id, '2');
});

test('Pillar 3: EventLedger maintains unbroken SHA-256 hash chain and detects tampering', () => {
  const tmpFile = path.join(os.tmpdir(), `sovereign_event_ledger_test_${Date.now()}.jsonl`);
  try {
    const ledger = new EventLedger(tmpFile);
    assert.strictEqual(ledger.verifyIntegrity().valid, true);

    const e1 = ledger.append('MARKET_CREATED', { symbol: 'BTC_2026', strike: 70000 });
    assert.strictEqual(e1.index, 0);
    assert.strictEqual(e1.prev_hash, GENESIS_PREV_HASH);
    assert.strictEqual(e1.hash.length, 64);

    const e2 = ledger.append('ORDER_FILLED', { order_id: 'ord_1', price: 0.55, size: 100 });
    assert.strictEqual(e2.index, 1);
    assert.strictEqual(e2.prev_hash, e1.hash);

    const e3 = ledger.append('ORACLE_RESOLVED', { winner: 'YES', payout: 1.0 });
    assert.strictEqual(e3.index, 2);
    assert.strictEqual(e3.prev_hash, e2.hash);

    // Verify intact chain
    const intact = ledger.verifyIntegrity();
    assert.strictEqual(intact.valid, true);
    assert.strictEqual(intact.count, 3);
    assert.strictEqual(intact.last_hash, e3.hash);

    // Reload ledger from disk and verify persistence
    const reloadedLedger = new EventLedger(tmpFile);
    assert.strictEqual(reloadedLedger.count, 3);
    assert.strictEqual(reloadedLedger.getLatestEvent().hash, e3.hash);
    assert.strictEqual(reloadedLedger.verifyIntegrity().valid, true);

    // Tamper with disk file at line 2 (e2)
    const content = fs.readFileSync(tmpFile, 'utf8').trim().split('\n');
    const tamperedObj = JSON.parse(content[1]);
    tamperedObj.payload.price = 0.99; // changed price
    content[1] = JSON.stringify(tamperedObj);
    fs.writeFileSync(tmpFile, content.join('\n') + '\n', 'utf8');

    const tamperedLedger = new EventLedger(tmpFile);
    const result = tamperedLedger.verifyIntegrity();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.corrupted_index, 1);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});
