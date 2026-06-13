'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildCryptoAggregateSeries } = require('../../../shared/lib/data/crypto_aggregates');
const { refreshCryptoAggregates } = require('../../../backend/cli/commands/research/ml');

// Injected fetcher: symbol -> Map(date -> mcap). No network.
function fakeFetcher(data) {
  return async (symbol) => {
    const key = String(symbol).toUpperCase();
    return new Map(Object.entries(data[key] || {}));
  };
}

test('buildCryptoAggregateSeries sums total mcap, derives dominance and stablecoin mcap', async () => {
  const data = {
    BTC: { '2026-01-01': 1000, '2026-01-02': 1200 },
    ETH: { '2026-01-01': 400, '2026-01-02': 500 },
    USDT: { '2026-01-01': 100, '2026-01-02': 150 },
  };
  const r = await buildCryptoAggregateSeries({
    universe: ['BTC', 'ETH'],
    stablecoins: ['USDT'],
    throttleMs: 0,
    minCoins: 2,
    fetchMcapSeries: fakeFetcher(data),
  });

  assert.strictEqual(r.total_mcap.length, 2, 'two aligned days');
  // Day 1: total = 1000+400+100 = 1500; dominance = 1000/1500; stable = 100
  assert.strictEqual(r.total_mcap[0].date, '2026-01-01');
  assert.strictEqual(r.total_mcap[0].value, 1500);
  assert.ok(Math.abs(r.btc_dominance[0].value - 1000 / 1500) < 1e-9, 'btc dominance day1');
  assert.strictEqual(r.stablecoin_mcap[0].value, 100, 'stablecoin mcap day1');
  // Day 2: total = 1200+500+150 = 1850
  assert.strictEqual(r.total_mcap[1].value, 1850);
  assert.ok(Math.abs(r.btc_dominance[1].value - 1200 / 1850) < 1e-9, 'btc dominance day2');
});

test('buildCryptoAggregateSeries gates days below the coin quorum and requires BTC', async () => {
  const data = {
    BTC: { '2026-01-01': 1000 },                 // day1 has BTC + ETH (quorum ok)
    ETH: { '2026-01-01': 400, '2026-01-02': 500 }, // day2 has ETH only -> dropped (no BTC, below quorum)
  };
  const r = await buildCryptoAggregateSeries({
    universe: ['BTC', 'ETH'],
    stablecoins: [],
    throttleMs: 0,
    minCoins: 2,
    fetchMcapSeries: fakeFetcher(data),
  });
  assert.strictEqual(r.total_mcap.length, 1, 'only the quorum-satisfying day with BTC survives');
  assert.strictEqual(r.total_mcap[0].date, '2026-01-01');
  assert.strictEqual(r.stablecoin_mcap[0].value, 0, 'no stablecoins -> zero');
});

test('refreshCryptoAggregates writes a file in the shape loadCryptoAggregateAnchors reads', async () => {
  const data = {
    BTC: { '2026-01-01': 1000, '2026-01-02': 1200 },
    ETH: { '2026-01-01': 400, '2026-01-02': 500 },
    USDT: { '2026-01-01': 100, '2026-01-02': 150 },
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlagg-'));
  const out = path.join(dir, 'crypto_aggregates.json');
  const result = await refreshCryptoAggregates({
    out,
    universe: ['BTC', 'ETH'],
    stablecoins: ['USDT'],
    throttleMs: 0,
    fetchMcapSeries: fakeFetcher(data),
  });
  assert.strictEqual(result.out, out);
  assert.strictEqual(result.days_emitted, 2);

  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  // Keys must match what loadCryptoAggregateAnchors maps (total_mcap/btc_dominance/stablecoin_mcap).
  assert.ok(Array.isArray(written.total_mcap) && written.total_mcap.length === 2);
  assert.ok(Array.isArray(written.btc_dominance) && written.btc_dominance.length === 2);
  assert.ok(Array.isArray(written.stablecoin_mcap) && written.stablecoin_mcap.length === 2);
  assert.strictEqual(written.total_mcap[0].value, 1500);
  assert.ok(written.meta && typeof written.meta.generated_at === 'string');
});
