'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchClobPriceHistory,
  fetchPolymarketV2TradesHistory,
  buildPriceSeries,
  normalizePriceHistory,
  DATA_API_BASE,
} = require('../../../../shared/lib/market/polymarket_history.js');

test('DATA_API_BASE points to Polymarket Data API v2', () => {
  assert.equal(DATA_API_BASE, 'https://data-api.polymarket.com/v2');
});

test('normalizePriceHistory parses Polymarket v2 trade records into sorted price points', () => {
  const v2Trades = [
    {
      proxy_wallet: '0x123',
      side: 'SELL',
      token_id: 'tok-1',
      condition_id: '0xabc',
      size: 100,
      price: 0.89,
      timestamp: 1794028176,
      outcome: 'Yes',
    },
    {
      proxy_wallet: '0x456',
      side: 'BUY',
      token_id: 'tok-1',
      condition_id: '0xabc',
      size: 50,
      price: 0.95,
      timestamp: 1794028300,
      outcome: 'Yes',
    },
  ];

  const normalized = normalizePriceHistory(v2Trades, 'polymarket_v2_trades');
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].t, 1794028176);
  assert.equal(normalized[0].p, 0.89);
  assert.equal(normalized[0].source, 'polymarket_v2_trades');
  assert.equal(normalized[1].t, 1794028300);
  assert.equal(normalized[1].p, 0.95);

  const series = buildPriceSeries(normalized);
  assert.equal(series.length, 2);
  assert.equal(series[0].price, 0.89);
  assert.equal(series[1].price, 0.95);
});

test('fetchPolymarketV2TradesHistory requires conditionId', async () => {
  const res = await fetchPolymarketV2TradesHistory(null);
  assert.equal(res.ok, false);
  assert.match(res.error, /Missing conditionId/);
});

test('fetchClobPriceHistory delegates to v2 trades when conditionId is provided and CLOB is empty', async () => {
  const tokenId = '88183295639917452800377305335725503891971025517569548144827084390539552002498';
  const res = await fetchClobPriceHistory(tokenId, '1d', true, {
    conditionId: '0x9350b42a140f4eb532a765859b3c69d1e865a6b0d0fc8c5587281a63ee9e6111',
  });
  assert.equal(res.ok, true);
  assert.equal(res.source, 'polymarket_v2_trades');
  assert.ok(Array.isArray(res.data));
  assert.ok(res.data.length > 0);
  assert.ok(res.data[0].p > 0 && res.data[0].p <= 1.0);
});
