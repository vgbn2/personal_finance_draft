'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  aggregatePolymarketFilledPositions,
  buildPolymarketTokenMetadata,
  markPolymarketHistoryIncomplete,
  partitionPolymarketPositions,
  projectPolymarketPosition,
} = require('../../../../backend/gateway/src/polymarket_positions.js');

test('fill reducer keeps only unsold shares and leaves valuation unavailable', () => {
  const positions = aggregatePolymarketFilledPositions([
    { asset_id: 'yes-active', outcome: 'Yes', side: 'BUY', size: 100, price: 0.2, match_time: '2026-01-01T00:00:00Z' },
    { asset_id: 'yes-active', outcome: 'Yes', side: 'SELL', size: 40, price: 0.3, match_time: '2026-01-02T00:00:00Z' },
    { asset_id: 'sold-out', outcome: 'No', side: 'BUY', size: 20, price: 0.7, match_time: '2026-01-01T00:00:00Z' },
    { asset_id: 'sold-out', outcome: 'No', side: 'SELL', size: 20, price: 0.6, match_time: '2026-01-02T00:00:00Z' },
  ]);

  assert.equal(positions.length, 1);
  assert.equal(positions[0].assetId, 'yes-active');
  assert.equal(positions[0].quantity, 6);
  assert.ok(Math.abs(positions[0].averagePrice - 0.2) < 1e-12);
  assert.equal(positions[0].marketValue, 0);
  assert.equal(positions[0].lifecycle, 'unknown');
  assert.equal(positions[0].valuationStatus, 'unavailable');
});

test('Gamma metadata classifies active and ended tokens without treating outcome price as owned equity', () => {
  const metadata = buildPolymarketTokenMetadata([
    {
      question: 'Will BTC close above 100k?',
      active: true,
      closed: false,
      clobTokenIds: '["yes-active","no-active"]',
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.40","0.60"]',
    },
    {
      question: 'Did the ended market resolve Yes?',
      active: false,
      closed: true,
      clobTokenIds: '["yes-ended","no-ended"]',
      outcomes: '["Yes","No"]',
      outcomePrices: '["1","0"]',
    },
  ]);

  assert.equal(metadata.get('yes-active').lifecycle, 'active');
  assert.equal(metadata.get('yes-ended').lifecycle, 'ended');
  assert.equal(metadata.get('yes-ended').resolutionPrice, 1);
  assert.equal(metadata.get('no-ended').resolutionPrice, 0);
});

test('projection marks only verified-active quoted positions and partitions ended/unknown rows', () => {
  const base = {
    assetId: 'yes-active',
    symbol: 'Yes',
    quantity: 6,
    averagePrice: 0.2,
    marketValue: 0,
    unrealizedPl: 0,
  };
  const active = projectPolymarketPosition(base, {
    lifecycle: 'active',
    question: 'Will BTC close above 100k?',
    outcome: 'Yes',
  }, 0.4);
  const ended = projectPolymarketPosition({ ...base, assetId: 'yes-ended' }, {
    lifecycle: 'ended',
    question: 'Did the ended market resolve Yes?',
    outcome: 'Yes',
    resolutionPrice: 1,
  }, 1);
  const unknown = projectPolymarketPosition({ ...base, assetId: 'missing' }, null, 0.5);

  assert.ok(Math.abs(active.marketValue - 2.4) < 1e-12);
  assert.ok(Math.abs(active.unrealizedPl - 1.2) < 1e-12);
  assert.equal(active.valuationStatus, 'live_quote');
  assert.equal(ended.marketValue, 0, 'fill history cannot prove an ended payout is still owned');
  assert.equal(ended.valuationStatus, 'unavailable');
  assert.equal(unknown.marketValue, 0);

  const partitioned = partitionPolymarketPositions([active, ended, unknown]);
  assert.equal(partitioned.active.length, 1);
  assert.equal(partitioned.ended.length, 1);
  assert.equal(partitioned.unknown.length, 1);
});

test('truncated trade history fails every reconstructed position closed before valuation', () => {
  const incomplete = markPolymarketHistoryIncomplete([
    {
      assetId: 'active-looking-token',
      symbol: 'Yes',
      quantity: 5,
      averagePrice: 0.25,
      marketValue: 1.25,
      unrealizedPl: 0.5,
      lifecycle: 'active',
      valuationStatus: 'live_quote',
    },
  ]);

  assert.deepEqual(incomplete, [{
    assetId: 'active-looking-token',
    symbol: 'Yes',
    quantity: 5,
    averagePrice: 0.25,
    marketValue: 0,
    unrealizedPl: 0,
    lifecycle: 'unknown',
    valuationStatus: 'unavailable',
    historyStatus: 'trade_history_truncated',
    currentPrice: null,
  }]);

  const projected = projectPolymarketPosition(incomplete[0], {
    lifecycle: 'active',
    question: 'Looks active but quantity history is incomplete',
    outcome: 'Yes',
  }, 0.8);
  assert.equal(projected.lifecycle, 'unknown');
  assert.equal(projected.marketValue, 0);
  assert.equal(projected.valuationStatus, 'unavailable');
});

test('gateway no longer suppresses process-global console.error while pricing positions', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../../backend/gateway/src/index.ts'), 'utf8');
  const start = source.indexOf('async getPositions(): Promise<Position[]>', source.indexOf('class PolymarketAdapter'));
  const end = source.indexOf('async getQuote(', start);
  const getPositionsSource = source.slice(start, end);
  assert.doesNotMatch(getPositionsSource, /console\.error\s*=/);
  assert.match(getPositionsSource, /position\.lifecycle !== 'active'/);
});
