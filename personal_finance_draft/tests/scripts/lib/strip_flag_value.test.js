'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { stripFlagValue } = require('../../../backend/cli/lib/utils.js');

/**
 * TEST: stripFlagValue (keep secrets like --pin out of a spawned subprocess argv)
 *
 * The trade PIN is consumed by the in-process gate in commandTrade, then the
 * same args are forwarded to the gateway subprocess. Stripping --pin (and its
 * value) before the spawn stops the PIN appearing in OS process listings.
 */

test('stripFlagValue removes the flag and its following value', () => {
  const out = stripFlagValue(['sell', 'AAPL', '10', 'market', '--live', '--pin', 'SECRET123'], '--pin');
  assert.deepEqual(out, ['sell', 'AAPL', '10', 'market', '--live']);
  assert.ok(!out.includes('SECRET123'), 'the secret value is gone too, not just the flag');
});

test('stripFlagValue leaves args untouched when the flag is absent', () => {
  const args = ['sell', 'AAPL', '10', 'market', '--live'];
  assert.deepEqual(stripFlagValue(args, '--pin'), args);
});

test('stripFlagValue strips a mid-args flag without disturbing surrounding args', () => {
  const out = stripFlagValue(['buy', '--pin', 'P', 'TSLA', '5', 'market', '--live'], '--pin');
  assert.deepEqual(out, ['buy', 'TSLA', '5', 'market', '--live']);
});

test('stripFlagValue does not mutate the original array', () => {
  const args = ['sell', 'AAPL', '--pin', 'SECRET'];
  const out = stripFlagValue(args, '--pin');
  assert.deepEqual(args, ['sell', 'AAPL', '--pin', 'SECRET'], 'input array is unchanged');
  assert.deepEqual(out, ['sell', 'AAPL']);
});

test('stripFlagValue drops a trailing flag with no value gracefully', () => {
  assert.deepEqual(stripFlagValue(['sell', 'AAPL', '--pin'], '--pin'), ['sell', 'AAPL']);
});
