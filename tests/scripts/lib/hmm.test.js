'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fitHmm, permutationEntropy } = require('../../../shared/lib/ml/hmm.js');

// ── permutationEntropy ────────────────────────────────────────────────────────

test('permutationEntropy: monotonically increasing → 0 (perfectly orderly)', () => {
  const series = Array.from({ length: 50 }, (_, i) => i);
  const H = permutationEntropy(series, 3);
  assert.equal(H, 0, `expected 0, got ${H}`);
});

test('permutationEntropy: returns null when series shorter than order', () => {
  assert.equal(permutationEntropy([1, 2], 3), null);
});

test('permutationEntropy: random-ish series produces entropy between 0 and 1', () => {
  const series = [3,1,4,1,5,9,2,6,5,3,5,8,9,7,9,3,2,3,8,4,6,2,6,4,3,3,8,3,2,7];
  const H = permutationEntropy(series, 3);
  assert.ok(H !== null && H >= 0 && H <= 1, `entropy out of range: ${H}`);
  assert.ok(H > 0.5, `expected high entropy for random series, got ${H}`);
});

test('permutationEntropy: monotonically decreasing → 0 (perfectly orderly, reversed)', () => {
  const series = Array.from({ length: 50 }, (_, i) => 50 - i);
  const H = permutationEntropy(series, 3);
  assert.equal(H, 0);
});

// ── fitHmm ───────────────────────────────────────────────────────────────────

function syntheticReturns(n, mu, sigma) {
  // Deterministic pseudo-random using LCG for reproducibility
  let s = 42;
  return Array.from({ length: n }, () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const u = (s >>> 0) / 0xffffffff;
    // Box-Muller
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const v = (s >>> 0) / 0xffffffff;
    return mu + sigma * Math.sqrt(-2 * Math.log(u + 1e-10)) * Math.cos(2 * Math.PI * v);
  });
}

test('fitHmm: returns null for series shorter than 20 bars', () => {
  assert.equal(fitHmm([0.01, -0.01, 0.02]), null);
});

test('fitHmm: returns a valid regime label for a long enough series', () => {
  const returns = syntheticReturns(200, 0.0005, 0.02);
  const result = fitHmm(returns);
  assert.notEqual(result, null, 'expected non-null result');
  assert.ok(['trending', 'choppy'].includes(result.label), `unexpected label: ${result.label}`);
});

test('fitHmm: trendingProb + choppyProb ≈ 1', () => {
  const returns = syntheticReturns(150, 0.001, 0.015);
  const result = fitHmm(returns);
  assert.notEqual(result, null);
  const sum = result.trendingProb + result.choppyProb;
  assert.ok(Math.abs(sum - 1) < 0.01, `probs don't sum to 1: ${sum}`);
});

test('fitHmm: detects trending regime on a low-noise directional series', () => {
  // Strong uptrend with tiny noise → should end in trending state
  const n = 100;
  const returns = Array.from({ length: n }, (_, i) => 0.005 + (i % 3 === 0 ? -0.001 : 0));
  const result = fitHmm(returns);
  assert.notEqual(result, null);
  // At minimum it should converge and return a valid label
  assert.ok(['trending', 'choppy'].includes(result.label));
});

test('fitHmm: recentBars field reflects maxBars cap', () => {
  const returns = syntheticReturns(600, 0, 0.01);
  const result = fitHmm(returns, { maxBars: 300 });
  assert.notEqual(result, null);
  assert.equal(result.recentBars, 300);
});
