'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findNearestOption,
  calculate25DeltaSkew,
  calculateSkewZScore,
} = require('../../../shared/lib/strategy/options_smile_model.js');

test('findNearestOption locates option matching target delta and option type', () => {
  const records = [
    { strike: 90000, option_type: 'P', delta: -0.15, mark_iv: 0.62 },
    { strike: 95000, option_type: 'P', delta: -0.26, mark_iv: 0.58 },
    { strike: 100000, option_type: 'C', delta: 0.51, mark_iv: 0.52 },
    { strike: 105000, option_type: 'C', delta: 0.24, mark_iv: 0.56 },
    { strike: 110000, option_type: 'C', delta: 0.12, mark_iv: 0.61 },
  ];

  const call25 = findNearestOption(records, 0.25, 'C');
  assert.ok(call25);
  assert.equal(call25.strike, 105000);
  assert.equal(call25.delta, 0.24);

  const put25 = findNearestOption(records, -0.25, 'P');
  assert.ok(put25);
  assert.equal(put25.strike, 95000);
  assert.equal(put25.delta, -0.26);
});

test('calculate25DeltaSkew computes RR25 and BF25 correctly', () => {
  const records = [
    { strike: 95000, option_type: 'P', delta: -0.25, mark_iv: 0.60 },
    { strike: 100000, option_type: 'C', delta: 0.50, mark_iv: 0.50 },
    { strike: 105000, option_type: 'C', delta: 0.25, mark_iv: 0.55 },
  ];

  const res = calculate25DeltaSkew(records);
  assert.equal(res.sampleCount, 3);
  assert.equal(res.call25Iv, 0.55);
  assert.equal(res.put25Iv, 0.60);
  assert.equal(res.atmIv, 0.50);

  // RR25 = call25 - put25 = 0.55 - 0.60 = -0.05
  assert.ok(Math.abs(res.rr25 - (-0.05)) < 1e-9);

  // BF25 = (call25 + put25)/2 - atm = (0.55 + 0.60)/2 - 0.50 = 0.575 - 0.50 = 0.075
  assert.ok(Math.abs(res.bf25 - 0.075) < 1e-9);
});

test('calculate25DeltaSkew handles empty and sparse records gracefully', () => {
  const empty = calculate25DeltaSkew([]);
  assert.equal(empty.rr25, 0);
  assert.equal(empty.bf25, 0);
  assert.equal(empty.sampleCount, 0);

  const single = calculate25DeltaSkew([{ strike: 100000, mark_iv: 0.5, delta: 0.5 }]);
  assert.equal(single.sampleCount, 1);
});

test('calculateSkewZScore computes standardized z-score with zero-std boundary protection', () => {
  assert.equal(calculateSkewZScore(0.05, 0.01, 0.02), 2.0);
  assert.equal(calculateSkewZScore(-0.03, 0.01, 0.02), -2.0);
  // Zero standard deviation does not throw division by zero
  assert.equal(calculateSkewZScore(0.05, 0.01, 0), 0);
});
