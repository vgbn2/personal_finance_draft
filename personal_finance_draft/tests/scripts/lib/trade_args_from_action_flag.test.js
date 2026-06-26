'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTradeArgsFromActionFlag } = require('../../../backend/cli/commands/trade/trade.js');

/**
 * TEST: buildTradeArgsFromActionFlag (dashboard flag-grid -> wizard's own
 * positional shape, so picking 'alpaca' from the dashboard never falls into
 * the interactive trade wizard -- the "still defaults to legacy" bug).
 */

test('passes args through unchanged when --action is absent (bare CLI / wizard path)', () => {
  assert.deepEqual(buildTradeArgsFromActionFlag([]), []);
  assert.deepEqual(buildTradeArgsFromActionFlag(['buy', 'AAPL', '10', 'market']), ['buy', 'AAPL', '10', 'market']);
});

test('translates a buy action into the wizard\'s positional shape', () => {
  const args = ['--action', 'buy', '--symbol', 'aapl', '--qty', '10', '--order-type', 'market'];
  assert.deepEqual(buildTradeArgsFromActionFlag(args), ['buy', 'AAPL', '10', 'market']);
});

test('uppercases the symbol', () => {
  const args = ['--action', 'sell', '--symbol', 'tsla', '--qty', '5', '--order-type', 'market'];
  assert.deepEqual(buildTradeArgsFromActionFlag(args), ['sell', 'TSLA', '5', 'market']);
});

test('appends the limit price only when order-type is limit and a price was given', () => {
  const limitWithPrice = ['--action', 'buy', '--symbol', 'AAPL', '--qty', '10', '--order-type', 'limit', '--price', '180'];
  assert.deepEqual(buildTradeArgsFromActionFlag(limitWithPrice), ['buy', 'AAPL', '10', 'limit', '180']);

  const marketWithPrice = ['--action', 'buy', '--symbol', 'AAPL', '--qty', '10', '--order-type', 'market', '--price', '180'];
  assert.deepEqual(buildTradeArgsFromActionFlag(marketWithPrice), ['buy', 'AAPL', '10', 'market'], 'price ignored when not a limit order');

  const limitNoPrice = ['--action', 'buy', '--symbol', 'AAPL', '--qty', '10', '--order-type', 'limit', '--price', ''];
  assert.deepEqual(buildTradeArgsFromActionFlag(limitNoPrice), ['buy', 'AAPL', '10', 'limit'], 'no trailing price arg when blank');
});

test('preserves --live and --pin after the translated positional args', () => {
  const args = ['--action', 'sell', '--symbol', 'AAPL', '--qty', '5', '--order-type', 'market', '--live', '--pin', 'SECRET'];
  assert.deepEqual(buildTradeArgsFromActionFlag(args), ['sell', 'AAPL', '5', 'market', '--live', '--pin', 'SECRET']);
});

test('non-order actions (balance/aggregate_portfolio/favorites) become a single positional arg', () => {
  assert.deepEqual(buildTradeArgsFromActionFlag(['--action', 'balance']), ['balance']);
  assert.deepEqual(buildTradeArgsFromActionFlag(['--action', 'aggregate_portfolio']), ['aggregate_portfolio']);
  assert.deepEqual(buildTradeArgsFromActionFlag(['--action', 'favorites']), ['favorites']);
});

test('defaults action to balance when --action is present with no value following', () => {
  assert.deepEqual(buildTradeArgsFromActionFlag(['--action']), ['balance']);
});
