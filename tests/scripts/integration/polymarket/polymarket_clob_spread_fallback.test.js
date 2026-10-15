'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  calculatePolymarketReferencePrice,
  calculateDepthImbalance,
  forecastBinaryProbability,
} = require('../../../../shared/lib/strategy/polymarket_clob_model');

describe('Polymarket CLOB Reference Pricing & Spread Fallback Protocol', () => {
  test('tight spread (<= 0.10) selects midpoint price', () => {
    // Bid: 0.48, Ask: 0.52 -> Spread: 0.04 (<= 0.10) -> Midpoint: 0.50
    const result = calculatePolymarketReferencePrice(0.48, 0.52, 0.45);
    assert.equal(result.source, 'midpoint');
    assert.equal(result.referencePrice, 0.50);
    assert.equal(result.spread, 0.04);
    assert.equal(result.midpoint, 0.50);
  });

  test('exact boundary spread (0.10) selects midpoint price', () => {
    // Bid: 0.45, Ask: 0.55 -> Spread: 0.10 (<= 0.10) -> Midpoint: 0.50
    const result = calculatePolymarketReferencePrice(0.45, 0.55, 0.40);
    assert.equal(result.source, 'midpoint');
    assert.equal(result.referencePrice, 0.50);
    assert.equal(result.spread, 0.10);
  });

  test('wide spread (> 0.10) falls back to last trade price', () => {
    // Bid: 0.20, Ask: 0.80 -> Spread: 0.60 (> 0.10), Last Trade: 0.35
    const result = calculatePolymarketReferencePrice(0.20, 0.80, 0.35);
    assert.equal(result.source, 'last_trade');
    assert.equal(result.referencePrice, 0.35);
    assert.equal(result.spread, 0.60);
    assert.equal(result.midpoint, 0.50);
  });

  test('wide spread (> 0.10) without valid last trade price gracefully uses midpoint', () => {
    // Bid: 0.20, Ask: 0.80 -> Spread: 0.60 (> 0.10), Last Trade: null / 0 / NaN
    const resultNull = calculatePolymarketReferencePrice(0.20, 0.80, null);
    assert.equal(resultNull.source, 'midpoint');
    assert.equal(resultNull.referencePrice, 0.50);

    const resultZero = calculatePolymarketReferencePrice(0.20, 0.80, 0);
    assert.equal(resultZero.source, 'midpoint');
    assert.equal(resultZero.referencePrice, 0.50);

    const resultNan = calculatePolymarketReferencePrice(0.20, 0.80, NaN);
    assert.equal(resultNan.source, 'midpoint');
    assert.equal(resultNan.referencePrice, 0.50);
  });

  test('one-sided book falls back to last trade or available side', () => {
    // Only Ask: 0.70, Last Trade: 0.65
    const resultAskWithTrade = calculatePolymarketReferencePrice(0, 0.70, 0.65);
    assert.equal(resultAskWithTrade.source, 'last_trade');
    assert.equal(resultAskWithTrade.referencePrice, 0.65);

    // Only Ask: 0.70, No Last Trade
    const resultAskOnly = calculatePolymarketReferencePrice(0, 0.70, null);
    assert.equal(resultAskOnly.source, 'ask');
    assert.equal(resultAskOnly.referencePrice, 0.70);

    // Only Bid: 0.30, No Last Trade
    const resultBidOnly = calculatePolymarketReferencePrice(0.30, 0, null);
    assert.equal(resultBidOnly.source, 'bid');
    assert.equal(resultBidOnly.referencePrice, 0.30);
  });

  test('completely empty book returns default 0.50', () => {
    const result = calculatePolymarketReferencePrice(0, 0, null);
    assert.equal(result.source, 'default');
    assert.equal(result.referencePrice, 0.50);
  });

  test('calculateDepthImbalance integrates reference pricing and spread metadata', () => {
    const bids = [{ price: 0.40, size: 100 }, { price: 0.39, size: 200 }];
    const asks = [{ price: 0.60, size: 100 }, { price: 0.61, size: 200 }];

    // Spread = 0.20 (> 0.10) with lastTradePrice 0.42
    const depthWithLast = calculateDepthImbalance(bids, asks, 5, { lastTradePrice: 0.42 });
    assert.equal(depthWithLast.priceSource, 'last_trade');
    assert.equal(depthWithLast.referencePrice, 0.42);
    assert.equal(depthWithLast.spread, 0.20);
    assert.equal(depthWithLast.midpoint, 0.50);

    // Tight spread = 0.02
    const tightBids = [{ price: 0.49, size: 100 }];
    const tightAsks = [{ price: 0.51, size: 100 }];
    const depthTight = calculateDepthImbalance(tightBids, tightAsks, 5, { lastTradePrice: 0.42 });
    assert.equal(depthTight.priceSource, 'midpoint');
    assert.equal(depthTight.referencePrice, 0.50);
    assert.equal(depthTight.spread, 0.02);
  });

  test('forecastBinaryProbability preserves pin-risk boundary clamping', () => {
    // Extreme probability forecast > 0.97 clamps signal to 0
    const highProb = forecastBinaryProbability(0.95, 1, 3);
    assert.equal(highProb.pinRisk, true);
    assert.equal(highProb.signal, 0);

    // Normal probability forecast inside [0.03, 0.97]
    const normalProb = forecastBinaryProbability(0.50, 0.2, 0);
    assert.equal(normalProb.pinRisk, false);
    assert.notEqual(normalProb.signal, 0);
  });
});
