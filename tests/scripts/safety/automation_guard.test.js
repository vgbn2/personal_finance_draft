'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  reconcileAutomationInventory,
} = require('../../../backend/cli/commands/strategy/automation_guard.js');

test('automation inventory reconciliation reads state only after broker truth is confirmed', async () => {
  const calls = [];
  const result = await reconcileAutomationInventory(['--live'], {
    runExitCheck: async () => {
      calls.push('broker');
      return { blocked: false, errors: [], sellsExecuted: 0 };
    },
    loadState: () => {
      calls.push('state');
      return {
        positions: [{ symbol: 'SPY' }],
        config: { maxPositions: 3 },
      };
    },
  });

  assert.deepEqual(calls, ['broker', 'state']);
  assert.equal(result.ok, true);
  assert.equal(result.openPositionCount, 1);
  assert.equal(result.maxOpenPositions, 3);
});

test('automation inventory reconciliation blocks before state access when broker truth is unavailable', async () => {
  let stateRead = false;
  const result = await reconcileAutomationInventory([], {
    runExitCheck: async () => ({
      blocked: true,
      errors: ['inventory unavailable'],
    }),
    loadState: () => {
      stateRead = true;
      throw new Error('state must not be read');
    },
  });

  assert.equal(stateRead, false);
  assert.deepEqual(result, {
    ok: false,
    blocked: true,
    reason: 'alpaca_inventory_unavailable',
    exitResult: {
      blocked: true,
      errors: ['inventory unavailable'],
    },
  });
});

test('automation inventory reconciliation converts broker exceptions into loud fail-closed results', async () => {
  const result = await reconcileAutomationInventory([], {
    runExitCheck: async () => {
      throw new Error('broker timeout');
    },
    loadState: () => {
      throw new Error('state must not be read');
    },
  });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'alpaca_inventory_unavailable');
  assert.deepEqual(result.exitResult.errors, ['broker timeout']);
});
