'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadMutatedModule(relativePath, before, after) {
  const filename = path.join(REPO_ROOT, relativePath);
  const original = fs.readFileSync(filename, 'utf8');
  assert.ok(original.includes(before), `mutation target drifted: ${relativePath}`);
  const source = original.replace(before, after);
  const mutated = new Module(filename, module);
  mutated.filename = filename;
  mutated.paths = Module._nodeModulePaths(path.dirname(filename));
  mutated._compile(source, filename);
  return mutated.exports;
}

function assertSynchronousGuardRejects(mutatedBehaviour) {
  assert.throws(mutatedBehaviour, assert.AssertionError);
}

async function assertAsynchronousGuardRejects(mutatedBehaviour) {
  await assert.rejects(mutatedBehaviour, assert.AssertionError);
}

test('trade PIN safety contract detects an unconditional-approval mutation', () => {
  const auth = loadMutatedModule(
    'backend/cli/lib/auth.js',
    'function verifyPin(candidate, expected) {',
    'function verifyPin(candidate, expected) { return true;',
  );
  assertSynchronousGuardRejects(() => {
    assert.equal(auth.verifyPin('wrong-pin', 'correct-pin'), false);
  });
});

test('inventory preservation contract detects removal of the unavailable guard', async () => {
  const cycle = loadMutatedModule(
    'shared/lib/runtime/alpaca_bot_cycle.js',
    "if (!['confirmed', 'confirmed_empty'].includes(inventory.status)) {",
    "if (false && !['confirmed', 'confirmed_empty'].includes(inventory.status)) {",
  );
  let saved = false;
  const stateStore = {
    LOCK_PATH: '/tmp/alpaca-mutation.lock',
    loadState: () => ({
      version: 1,
      config: { maxPositions: 10 },
      positions: [{
        positionId: 'AAPL_1',
        symbol: 'AAPL',
        qty: 1,
        fillPrice: 100,
        stopPrice: 90,
        targetPrice: 110,
        maxHoldingDays: 30,
        entryTimestamp: new Date().toISOString(),
      }],
      cycleHistory: [],
      lastCycleAt: null,
    }),
    saveState: () => { saved = true; },
  };

  await assertAsynchronousGuardRejects(async () => {
    const result = await cycle.runAlpacaExitCheck(['--live'], {
      stateStore,
      acquireLock: () => true,
      releaseLock: () => {},
      fetchPositions: () => ({ status: 'unavailable', positions: [], reason: 'timeout' }),
    });
    assert.equal(result.blocked, true);
    assert.equal(saved, false);
  });
});
