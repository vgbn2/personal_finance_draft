'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateDepthImbalance,
  forecastBinaryProbability,
} = require('../../../shared/lib/strategy/polymarket_clob_model.js');

test('calculateDepthImbalance computes DIR5 and micro-price accurately', () => {
  const bids = [
    { price: 0.50, size: 200 },
    { price: 0.49, size: 100 },
  ];
  const asks = [
    { price: 0.52, size: 100 },
    { price: 0.53, size: 100 },
  ];

  const res = calculateDepthImbalance(bids, asks, 2);
  // Bid weight: 200/1 + 100/2 = 250
  // Ask weight: 100/1 + 100/2 = 150
  // DIR = (250 - 150) / (250 + 150) = 100 / 400 = 0.25
  assert.ok(Math.abs(res.dir5 - 0.25) < 1e-9);

  // Micro-price with best bid = 0.50 (size 200) and best ask = 0.52 (size 100)
  // MicroPrice = (0.52 * 200 + 0.50 * 100) / (200 + 100) = (104 + 50) / 300 = 154 / 300 = 0.513333...
  assert.ok(Math.abs(res.microPrice - (154 / 300)) < 1e-6);
});

test('calculateDepthImbalance handles empty books safely', () => {
  const res = calculateDepthImbalance([], []);
  assert.equal(res.dir5, 0);
  assert.equal(res.microPrice, 0.5);
});

test('forecastBinaryProbability computes logit drift and guards against pin-risk', () => {
  // Neutral book at 0.50: drift should be zero, forecast 0.50
  const neutral = forecastBinaryProbability(0.50, 0, 0);
  assert.ok(Math.abs(neutral.pForecast - 0.50) < 1e-6);
  assert.equal(neutral.pinRisk, false);
  assert.ok(Math.abs(neutral.signal) < 1e-6);

  // Strong bid pressure should increase forecast probability
  const bullish = forecastBinaryProbability(0.50, 0.8, 1.0);
  assert.ok(bullish.pForecast > 0.50);
  assert.ok(bullish.signal > 0);
  assert.equal(bullish.pinRisk, false);

  // Extreme tails (e.g. pMid = 0.98 or extreme drift to > 0.97) triggers pin-risk guard
  const pinHigh = forecastBinaryProbability(0.975, 0.9, 2.0);
  assert.equal(pinHigh.pinRisk, true);
  assert.equal(pinHigh.signal, 0); // trading halted to prevent pin-risk

  const pinLow = forecastBinaryProbability(0.02, -0.9, -2.0);
  assert.equal(pinLow.pinRisk, true);
  assert.equal(pinLow.signal, 0);
});
