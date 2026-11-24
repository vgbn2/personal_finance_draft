'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repo = process.env.ALPACA_CONTRACT_ROOT || path.resolve(__dirname, '../../..');
const cycle = require(path.join(repo, 'shared/lib/runtime/alpaca_bot_cycle.js'));
const gatewayDist = path.join(repo, 'backend/execution/dist/index.js');
const gatewayReady = fs.existsSync(gatewayDist)
  && /allocations/.test(fs.readFileSync(gatewayDist, 'utf8'))
  && /accountNamespace/.test(fs.readFileSync(gatewayDist, 'utf8'));

test('bot account seam forwards the provider-paper positions selector', () => {
  const calls = [];
  const inventory = cycle.fetchAlpacaPositions(false, {
    paperProvider: true,
    runGatewayCommand(args) {
      calls.push(args);
      return {
        ok: true,
        accountNamespace: 'alpaca:paper:fixture-account',
        positions: [],
      };
    },
  });

  assert.deepEqual(calls, [['positions', '--paper-provider', '--json']]);
  assert.equal(inventory.status, 'confirmed_empty');
  assert.equal(inventory.accountNamespace, 'alpaca:paper:fixture-account');
});

test('real bot -> CLI -> compiled gateway -> SDK loopback seam', {
  skip: !gatewayReady
    ? 'BLOCKED: compiled gateway does not yet expose allocations/accountNamespace; run the tmpfs recipe after gateway worker rebuild'
    : 'BLOCKED: HTTP-worker process harness is not staged; no mock dispatcher qualifies',
}, async () => {
  assert.fail('This test is enabled only after the tmpfs HTTP-worker harness is staged');
});
