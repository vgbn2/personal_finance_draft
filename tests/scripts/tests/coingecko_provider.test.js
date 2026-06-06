'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const commonPath = require.resolve('../../../shared/lib/providers/common');
const coingeckoPath = require.resolve('../../../shared/lib/providers/coingecko');

// Re-require coingecko with a stubbed `fetchJson` so the HTTP layer is deterministic.
function withStubbedCoinGecko(fetchJsonImpl, run) {
  const originalCommon = require.cache[commonPath];
  const originalCoingecko = require.cache[coingeckoPath];

  require.cache[commonPath] = {
    id: commonPath,
    filename: commonPath,
    loaded: true,
    exports: { fetchJson: fetchJsonImpl, cachedFetch: async () => ({}), REPO_ROOT: process.cwd() },
  };
  delete require.cache[coingeckoPath];

  try {
    return run(require(coingeckoPath));
  } finally {
    if (originalCommon) require.cache[commonPath] = originalCommon; else delete require.cache[commonPath];
    if (originalCoingecko) require.cache[coingeckoPath] = originalCoingecko; else delete require.cache[coingeckoPath];
  }
}

test('resolveCoinGeckoId resolves the frozen pair symbols via explicit overrides (no network)', async () => {
  // These are the symbols that were stuck stale in cache; the override map must
  // pin them to canonical ids without hitting the symbol->id list.
  await withStubbedCoinGecko(
    () => { throw new Error('network should not be called for overridden symbols'); },
    async (cg) => {
      assert.equal(await cg.resolveCoinGeckoId('POLUSDT'), 'polygon-ecosystem-token');
      assert.equal(await cg.resolveCoinGeckoId('SUIUSDT'), 'sui');
      assert.equal(await cg.resolveCoinGeckoId('PEPEUSDT'), 'pepe');
      assert.equal(await cg.resolveCoinGeckoId('BTCUSDT'), 'bitcoin');
      // Bare ticker (no quote suffix) also resolves.
      assert.equal(await cg.resolveCoinGeckoId('POL'), 'polygon-ecosystem-token');
    }
  );
});

test('fetchCoinGeckoBaseCandles maps market_chart prices to OHLCV base candles', async () => {
  const t0 = Date.UTC(2026, 0, 1);
  const dayMs = 86400000;
  const fakeChart = {
    prices: [[t0, 0.50], [t0 + dayMs, 0.55], [t0 + 2 * dayMs, 0.48]],
    total_volumes: [[t0, 1000], [t0 + dayMs, 2000], [t0 + 2 * dayMs, 1500]],
  };

  await withStubbedCoinGecko(
    async (url) => {
      // Override resolves POLUSDT -> polygon-ecosystem-token, so the market_chart
      // request must target that id.
      assert.match(url, /coins\/polygon-ecosystem-token\/market_chart/);
      return fakeChart;
    },
    async (cg) => {
      const candles = await cg.fetchCoinGeckoBaseCandles('POLUSDT', 365);
      assert.equal(candles.length, 3);
      const first = candles[0];
      assert.equal(first.openTime, t0);
      // Single-price synthesis: open=high=low=close=price.
      assert.equal(first.open, 0.50);
      assert.equal(first.high, 0.50);
      assert.equal(first.low, 0.50);
      assert.equal(first.close, 0.50);
      assert.equal(first.volume, 1000);
      // Sorted ascending by openTime.
      assert.ok(candles[0].openTime < candles[1].openTime);
    }
  );
});
