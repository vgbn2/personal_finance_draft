'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decideExit,
  canOpenPosition,
  resolveEntryQty,
  resolveExitQty,
  buildExitOutcome,
  fetchAlpacaPositions,
  runAlpacaExitCheck,
} = require('../../../shared/lib/runtime/alpaca_bot_cycle');

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

/**
 * TEST: canOpenPosition (pure concurrency-cap gate for new live entries)
 */
test('canOpenPosition allows entry while under the cap and blocks once at/over it', () => {
  assert.equal(canOpenPosition(0, 10), true);
  assert.equal(canOpenPosition(9, 10), true);
  assert.equal(canOpenPosition(10, 10), false, 'at the cap, no new position');
  assert.equal(canOpenPosition(11, 10), false, 'over the cap, no new position');
});

test('canOpenPosition treats a missing/invalid cap as unlimited', () => {
  assert.equal(canOpenPosition(50, 0), true);
  assert.equal(canOpenPosition(50, NaN), true);
  assert.equal(canOpenPosition(50, undefined), true);
});

/**
 * TEST: resolveEntryQty (record the broker's filled qty, not the requested qty)
 */
test('resolveEntryQty prefers the broker position quantity over the requested qty', () => {
  assert.equal(resolveEntryQty({ quantity: 7 }, 10), 7, 'partial fill: record what the broker actually holds');
  assert.equal(resolveEntryQty({ quantity: '7' }, 10), 7, 'string broker qty is coerced');
});

test('resolveEntryQty falls back to the requested qty when the broker reports nothing usable', () => {
  assert.equal(resolveEntryQty(undefined, 10), 10);
  assert.equal(resolveEntryQty({ quantity: 0 }, 10), 10, 'zero broker qty is not a usable fill');
  assert.equal(resolveEntryQty({ quantity: 'NaN' }, 10), 10);
});

/**
 * TEST: resolveExitQty (clamp the exit sell to what the broker actually holds)
 */
test('resolveExitQty clamps the sell to the available broker shares', () => {
  assert.equal(resolveExitQty(10, 10), 10, 'full holding: sell all');
  assert.equal(resolveExitQty(10, 4), 4, 'broker holds fewer than tracked: sell only what is held');
  assert.equal(resolveExitQty(4, 10), 4, 'tracked fewer than held: sell only the tracked amount');
});

test('resolveExitQty never returns a negative sell quantity', () => {
  assert.equal(resolveExitQty(10, 0), 0, 'nothing left to sell');
  assert.equal(resolveExitQty(10, -3), 0, 'defensive: negative availability clamps to 0');
});

/**
 * TEST: buildExitOutcome (post-sell bookkeeping -- the fix for the session-59
 * finding: a clamped sell must record P&L on what was actually sold and keep
 * tracking the unsold remainder, not silently drop it).
 */
const fillPosition = { positionId: 'AAPL_1', symbol: 'AAPL', qty: 10, fillPrice: 100 };

test('buildExitOutcome: full exit (sellQty === position.qty) closes the position and records full P&L', () => {
  const { historyEntry, remainingPosition } = buildExitOutcome(fillPosition, 'target', 110, 10, 'cycle_1', true);
  assert.equal(historyEntry.realizedPnl, 100, '(110-100)*10');
  assert.equal(historyEntry.soldQty, 10);
  assert.equal(historyEntry.dryRun, false);
  assert.equal(remainingPosition, null, 'fully sold -- nothing left to track');
});

test('buildExitOutcome: clamped partial exit records P&L on the sold qty only and keeps the remainder tracked', () => {
  // Broker holds only 6 of the 10 tracked shares (e.g. two stacked positions
  // on one symbol sharing a single broker balance) -- resolveExitQty clamps
  // the sell to 6.
  const { historyEntry, remainingPosition } = buildExitOutcome(fillPosition, 'stop', 90, 6, 'cycle_2', true);
  assert.equal(historyEntry.realizedPnl, -60, '(90-100)*6 -- NOT (90-100)*10');
  assert.equal(historyEntry.soldQty, 6);
  assert.ok(remainingPosition, 'unsold remainder must stay tracked, not be dropped');
  assert.equal(remainingPosition.qty, 4, '10 tracked - 6 sold = 4 still open');
  assert.equal(remainingPosition.symbol, 'AAPL');
  assert.equal(remainingPosition.fillPrice, 100, 'remainder keeps its original entry fill price');
});

test('buildExitOutcome: dryRun flag mirrors the isLive argument', () => {
  assert.equal(buildExitOutcome(fillPosition, 'age', 100, 10, 'c', false).historyEntry.dryRun, true);
  assert.equal(buildExitOutcome(fillPosition, 'age', 100, 10, 'c', true).historyEntry.dryRun, false);
});

test('buildExitOutcome: a sellQty over the tracked qty clamps to the tracked qty (defensive)', () => {
  const { historyEntry, remainingPosition } = buildExitOutcome(fillPosition, 'target', 110, 999, 'c', true);
  assert.equal(historyEntry.soldQty, 10);
  assert.equal(remainingPosition, null);
});

test('fetchAlpacaPositions distinguishes confirmed empty inventory from failures', () => {
  assert.deepEqual(
    fetchAlpacaPositions(true, { runGatewayCommand: () => ({ ok: true, positions: [] }) }),
    { status: 'confirmed_empty', positions: [], reason: null },
  );
  assert.deepEqual(
    fetchAlpacaPositions(true, { runGatewayCommand: () => ({ ok: false, error: 'broker auth failed' }) }),
    { status: 'unavailable', positions: [], reason: 'broker auth failed' },
  );
  assert.equal(
    fetchAlpacaPositions(true, { runGatewayCommand: () => ({ ok: true, positions: [], truncated: true }) }).status,
    'incomplete',
  );
});

test('broker inventory failure preserves tracked positions and blocks the exit cycle', async () => {
  const originalState = {
    version: 1,
    config: { maxPositions: 10 },
    positions: [{ ...fillPosition, strategyName: 'test', entryTimestamp: new Date().toISOString() }],
    cycleHistory: [],
    lastCycleAt: null,
  };
  let saved = false;
  const stateStore = {
    LOCK_PATH: '/tmp/alpaca-test.lock',
    loadState: () => structuredClone(originalState),
    saveState: () => { saved = true; },
  };
  const result = await runAlpacaExitCheck(['--live'], {
    stateStore,
    acquireLock: () => true,
    releaseLock: () => {},
    fetchPositions: () => ({ status: 'unavailable', positions: [], reason: 'timeout' }),
  });

  assert.equal(result.blocked, true);
  assert.equal(result.inventoryStatus, 'unavailable');
  assert.equal(saved, false, 'uncertain inventory must never rewrite tracked state');
  assert.match(result.errors[0], /timeout/);
});
