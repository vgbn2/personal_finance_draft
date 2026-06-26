'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTradeGatewayLaunch, stripFlagValue } = require('../../../shared/lib/runtime/backend_bridge');

/**
 * TEST: buildTradeGatewayLaunch strips --pin unconditionally (session-59 fix --
 * the original cf4f7026 fix only stripped --pin at the commandTrade call site;
 * this covers all 8 callers of buildTradeGatewayLaunch, including any future one).
 */

test('buildTradeGatewayLaunch never lets --pin or its value reach the spawned argv', () => {
  const launch = buildTradeGatewayLaunch(['sell', 'AAPL', '10', 'market', '--live', '--pin', 'SECRET999']);
  assert.ok(!launch.args.includes('--pin'), '--pin flag itself must not appear in the spawned argv');
  assert.ok(!launch.args.includes('SECRET999'), 'the PIN value must not appear in the spawned argv');
});

test('buildTradeGatewayLaunch leaves args untouched when no --pin is present', () => {
  const launch = buildTradeGatewayLaunch(['positions', '--json']);
  assert.ok(launch.args.includes('positions'));
  assert.ok(launch.args.includes('--json'));
});

test('stripFlagValue is the same canonical export used by backend/cli/lib/utils.js', () => {
  const { stripFlagValue: utilsStripFlagValue } = require('../../../backend/cli/lib/utils.js');
  assert.equal(utilsStripFlagValue, stripFlagValue, 'utils.js must re-export the shared/lib/runtime implementation, not a duplicate');
});
