'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideExit } = require('../../../shared/lib/runtime/alpaca_bot_cycle');

/**
 * TEST: decideExit (pure target/stop/age exit decision)
 *
 * Kept pure and I/O-free in alpaca_bot_cycle.js specifically so this case
 * table can run with no fixtures, no mocks, and no broker/network calls.
 */

const basePosition = { targetPrice: 110, stopPrice: 90, maxHoldingDays: 30 };

test('decideExit returns "target" when current price meets or exceeds the target', () => {
  assert.equal(decideExit(basePosition, 110, 1), 'target');
  assert.equal(decideExit(basePosition, 115, 1), 'target');
});

test('decideExit returns "stop" when current price falls to or below the stop', () => {
  assert.equal(decideExit(basePosition, 90, 1), 'stop');
  assert.equal(decideExit(basePosition, 85, 1), 'stop');
});

test('decideExit returns "age" when held at least maxHoldingDays with price between stop and target', () => {
  assert.equal(decideExit(basePosition, 100, 30), 'age');
  assert.equal(decideExit(basePosition, 100, 45), 'age');
});

test('decideExit returns null when price is between stop/target and age is under the limit', () => {
  assert.equal(decideExit(basePosition, 100, 1), null);
  assert.equal(decideExit(basePosition, 100, 29.9), null);
});

test('decideExit ignores a non-positive current price (no quote yet) rather than false-triggering stop', () => {
  assert.equal(decideExit(basePosition, 0, 1), null);
  assert.equal(decideExit(basePosition, -5, 1), null);
});

test('decideExit prioritizes target over age when both conditions are met simultaneously', () => {
  assert.equal(decideExit(basePosition, 110, 40), 'target');
});
