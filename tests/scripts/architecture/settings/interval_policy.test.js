'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBotInterval } = require('../../../../shared/lib/settings/interval_policy');

test('bot interval defaults to one minute through the single resolver', () => {
  const result = resolveBotInterval({ settings: { trading: {} }, env: {} });
  assert.equal(result.effective_interval_min, 1);
  assert.equal(result.constrained_by, 'global');
});

test('personal interval can be slower but never bypasses the global minimum', () => {
  assert.equal(resolveBotInterval({
    requestedMinutes: 5,
    settings: { trading: { bot_interval_min: 3 } },
    env: { SOVEREIGN_GLOBAL_BOT_INTERVAL_MIN: '1' },
  }).effective_interval_min, 5);
  assert.equal(resolveBotInterval({
    requestedMinutes: 0.25,
    settings: { trading: {} },
    env: { SOVEREIGN_GLOBAL_BOT_INTERVAL_MIN: '1' },
  }).effective_interval_min, 1);
});

test('admin minimum is the final host-wide safety floor', () => {
  const result = resolveBotInterval({
    requestedMinutes: 1,
    settings: { trading: { bot_interval_min: 5 } },
    env: {
      SOVEREIGN_GLOBAL_BOT_INTERVAL_MIN: '1',
      SOVEREIGN_ADMIN_BOT_INTERVAL_MIN: '15',
    },
  });
  assert.equal(result.effective_interval_min, 15);
  assert.equal(result.constrained_by, 'admin');
});
