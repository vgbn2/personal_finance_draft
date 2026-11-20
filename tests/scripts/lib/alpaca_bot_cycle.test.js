'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeAlpacaPosition } = require('../../../shared/lib/brokers/alpaca_env');
const alpacaBotState = require('../../../shared/lib/runtime/alpaca_bot_state');
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
const alpacaPositionsFixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../fixtures/alpaca_positions_pending_exit.json'),
  'utf8'
));

test('default exit dispatcher loads the canonical trade command without placing an order', () => {
  const cyclePath = require.resolve('../../../shared/lib/runtime/alpaca_bot_cycle');
  const source = fs.readFileSync(cyclePath, 'utf8');
  const match = source.match(/options\.commandTrade \|\| require\('([^']+)'\)\.commandTrade/);
  assert.ok(match, 'default exit dispatcher must be covered');
  const load = require('node:module').createRequire(cyclePath);
  assert.equal(
    load.resolve(match[1]),
    require.resolve('../../../frontend/cli-tui/commands/trade/trade.js'),
  );
  assert.equal(typeof load(match[1]).commandTrade, 'function');
});

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

test('decideExit returns "age" when elapsedBars meets or exceeds maxHoldingBars (BT-05 parity)', () => {
  const barPosition = { targetPrice: 110, stopPrice: 90, maxHoldingDays: 30, maxHoldingBars: 5 };
  assert.equal(decideExit(barPosition, 100, 0.1, 5), 'age');
  assert.equal(decideExit(barPosition, 100, 0.1, 6), 'age');
  assert.equal(decideExit(barPosition, 100, 0.1, 4.9), null);
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

test('composite: 10 attributed AAPL rows, 1 broker position, 1 exit command, deterministic reduction (ALPACA-EXIT-01)', async () => {
  const tenRows = Array.from({ length: 10 }, (_, i) => ({
    symbol: 'AAPL',
    qty: 1,
    fillPrice: 100,
    targetPrice: 200,
    stopPrice: 50,
    maxHoldingDays: 30,
    strategyName: `strat_${i + 1}`,
    entryTimestamp: new Date(Date.now() - 40 * 86400000).toISOString(), // 40 days old -> age exit
  }));

  let savedState = null;
  const stateStore = {
    LOCK_PATH: '/tmp/alpaca-test-composite.lock',
    loadState: () => ({
      version: 1,
      config: { maxPositions: 10 },
      positions: structuredClone(tenRows),
      cycleHistory: [],
      lastCycleAt: null,
    }),
    saveState: (s) => { savedState = structuredClone(s); },
  };

  const tradeCalls = [];
  const mockCommandTrade = async (args) => {
    tradeCalls.push(args);
    return { ok: true, order: { orderId: 'exit-fixture' } };
  };

  const prevEnv = process.env.ALPACA_PAPER_MAX_NOTIONAL;
  process.env.ALPACA_PAPER_MAX_NOTIONAL = '5'; // $5 entry cap, AAPL is $100.91

  try {
    // Phase 1: Order submission transitions positions to exit_pending without premature P&L realization
    const result = await runAlpacaExitCheck(['--paper-provider'], {
      stateStore,
      acquireLock: () => true,
      releaseLock: () => {},
      fetchPositions: () => ({
        status: 'confirmed',
        positions: [{ symbol: 'AAPL', quantity: '10', marketValue: '1009.10' }], // $100.91/share
      }),
      commandTrade: mockCommandTrade,
    });

    // 1. Exactly one exit command dispatched to broker
    assert.equal(tradeCalls.length, 1, 'must aggregate 10 rows into 1 broker sell command');
    assert.equal(tradeCalls[0][0], 'sell');
    assert.equal(tradeCalls[0][1], 'AAPL');
    assert.equal(tradeCalls[0][2], '10', 'sell quantity must be sum of all exiting rows');

    // 2. No cap rejection errors, order submitted
    assert.equal(result.errors.length, 0, 'exit sell must not be rejected by entry notional cap');
    assert.equal(result.sellsSubmitted, 10, 'all 10 rows must transition to exit_pending');
    assert.equal(result.sellsExecuted, 0, 'no fills executed before broker confirmation');

    // 3. State retained as exit_pending pending fill confirmation
    assert.ok(savedState, 'state must be saved');
    assert.equal(savedState.positions.length, 10, 'all 10 positions must be preserved as exit_pending');
    assert.ok(savedState.positions.every((p) => p.exit_pending === true), 'every position marked exit_pending');
    assert.equal(savedState.cycleHistory.length, 0, 'cycle history must not record premature P&L before fill confirmation');

    // Order-specific receipt, not missing inventory, confirms the execution price.
    stateStore.loadState = () => structuredClone(savedState);
    const fillResult = await runAlpacaExitCheck(['--paper-provider'], {
      stateStore,
      acquireLock: () => true,
      releaseLock: () => {},
      fetchPositions: () => ({
        status: 'confirmed_empty',
        positions: [], // Broker confirms all shares sold
      }),
      commandTrade: mockCommandTrade,
      fetchOrder: () => ({
        ok: true,
        order: {
          orderId: 'exit-fixture',
          symbol: 'AAPL',
          side: 'sell',
          status: 'filled',
          filledQty: 10,
          filledAvgPrice: 110,
        },
      }),
    });

    // 4. Inhibit duplicate sell orders
    assert.equal(tradeCalls.length, 1, 'duplicate sell must not be dispatched during fill reconciliation');
    assert.equal(fillResult.sellsExecuted, 10, 'all 10 rows confirmed filled');
    assert.equal(savedState.positions.length, 0, 'all 10 exiting positions must be cleared after fill confirmation');

    // 5. Attribution preserved upon confirmed fill
    assert.equal(savedState.cycleHistory.length, 10, 'each strategy must receive individual exit attribution');
    assert.ok(savedState.cycleHistory.every((entry) => entry.exitPrice === 110 && entry.realizedPnl === 10));
    const attributedStrategies = savedState.cycleHistory.map((h) => h.strategyName);
    for (let i = 1; i <= 10; i++) {
      assert.ok(attributedStrategies.includes(`strat_${i}`), `missing attribution for strat_${i}`);
    }

    // 5. Failure deduplication: if broker sell fails, emit exactly 1 error and retain all 10 positions
    let failSavedState = null;
    const failStateStore = {
      LOCK_PATH: '/tmp/alpaca-test-composite-fail.lock',
      loadState: () => ({
        version: 1,
        config: { maxPositions: 10 },
        positions: structuredClone(tenRows),
        cycleHistory: [],
        lastCycleAt: null,
      }),
      saveState: (s) => { failSavedState = structuredClone(s); },
    };
    const failResult = await runAlpacaExitCheck(['--paper-provider'], {
      stateStore: failStateStore,
      acquireLock: () => true,
      releaseLock: () => {},
      fetchPositions: () => ({
        status: 'confirmed',
        positions: [{ symbol: 'AAPL', quantity: '10', marketValue: '1009.10' }],
      }),
      commandTrade: async () => 1, // Broker failure exit code 1
    });

    assert.equal(failResult.errors.length, 1, 'must emit exactly 1 error instead of 10 identical errors');
    assert.match(failResult.errors[0], /Exit sell failed for AAPL: non-zero exit 1/);
    assert.equal(failSavedState.positions.length, 10, 'all 10 positions must be preserved upon failure');
  } finally {
    if (prevEnv !== undefined) process.env.ALPACA_PAPER_MAX_NOTIONAL = prevEnv;
    else delete process.env.ALPACA_PAPER_MAX_NOTIONAL;
  }
});

test('recorded pending exit skips duplicate sell and preserves file-backed tracking', async () => {
  const statePath = path.join(os.tmpdir(), `alpaca_pending_exit_${process.pid}_${Date.now()}.json`);
  const lockPath = `${statePath}.lock`;
  const stateStore = {
    LOCK_PATH: lockPath,
    loadState: () => alpacaBotState.loadState({ statePath }),
    saveState: (state) => alpacaBotState.saveState(state, { statePath }),
  };
  fs.writeFileSync(statePath, `${JSON.stringify(alpacaPositionsFixture.bot_state, null, 2)}\n`);

  const rawPosition = alpacaPositionsFixture.positions.find((position) => position.symbol === 'AAPL');
  const openOrder = alpacaPositionsFixture.open_orders.find((order) => order.symbol === 'AAPL');
  const brokerPosition = normalizeAlpacaPosition(rawPosition, openOrder);

  try {
    const result = await runAlpacaExitCheck(['--paper-provider'], {
      stateStore,
      fetchPositions: () => ({ status: 'confirmed', positions: [brokerPosition] }),
      commandTrade: async () => { throw new Error('duplicate sell dispatched'); },
    });
    const savedState = alpacaBotState.loadState({ statePath });

    assert.equal(result.sellsExecuted, 0);
    assert.equal(savedState.positions.length, 1, 'tracked position must be preserved');
    assert.equal(savedState.positions[0].symbol, 'AAPL');
    assert.equal(savedState.positions[0].qty, 30.182);
    assert.deepEqual(savedState.cycleHistory, []);
    assert.match(result.errors[0], /held by an open order/);
  } finally {
    fs.rmSync(statePath, { force: true });
    fs.rmSync(lockPath, { force: true });
  }
});

test('order receipts: partial fills, replay, cancellation and missing legacy IDs preserve accounting', async () => {
  let state = {
    positions: [{
      symbol: 'AAPL',
      qty: 2,
      fillPrice: 100,
      exit_pending: true,
      exitOrderId: 'exit-partial',
      exitFilledQty: 0,
      exitFilledNotional: 0,
      exitReason: 'target',
    }],
    cycleHistory: [],
  };
  let order = {
    orderId: 'exit-partial',
    symbol: 'AAPL',
    side: 'sell',
    status: 'partially_filled',
    filledQty: 0.5,
    filledAvgPrice: 110,
  };
  const options = {
    stateStore: {
      LOCK_PATH: '/tmp/alpaca-order-receipt.lock',
      loadState: () => structuredClone(state),
      saveState: (next) => { state = structuredClone(next); },
    },
    acquireLock: () => true,
    releaseLock: () => {},
    // Manual/nonpending holdings must not influence this order's fill attribution.
    fetchPositions: () => ({
      status: 'confirmed',
      positions: [{ symbol: 'AAPL', quantity: 50, marketValue: 5500 }],
    }),
    fetchOrder: () => ({ ok: true, order }),
    commandTrade: async () => { throw new Error('duplicate sell dispatched'); },
  };
  let result = await runAlpacaExitCheck(['--paper-provider'], options);
  assert.deepEqual(result.errors, []);
  assert.equal(state.positions[0].qty, 1.5);
  assert.equal(state.cycleHistory[0].realizedPnl, 5);
  result = await runAlpacaExitCheck(['--paper-provider'], options);
  assert.equal(result.sellsExecuted, 0, 'receipt replay must not double-account');
  assert.equal(state.cycleHistory.length, 1);
  order = { ...order, status: 'canceled', filledQty: 1, filledAvgPrice: 115 };
  result = await runAlpacaExitCheck(['--paper-provider'], options);
  assert.equal(result.errors.length, 0);
  assert.equal(state.positions[0].qty, 1);
  assert.equal(state.positions[0].exit_pending, false);
  assert.equal(state.cycleHistory[0].exitPrice, 120, 'incremental fill price comes from cumulative notional delta');
  assert.equal(state.cycleHistory[0].realizedPnl, 10);

  state.positions[0].exit_pending = true;
  state.positions[0].exitOrderId = null;
  options.fetchPositions = () => ({ status: 'confirmed_empty', positions: [] });
  const before = structuredClone(state);
  result = await runAlpacaExitCheck(['--paper-provider'], options);
  assert.equal(result.sellsExecuted, 0);
  assert.deepEqual(state.positions, before.positions);
  assert.deepEqual(state.cycleHistory, before.cycleHistory);
  assert.match(result.errors[0], /legacy pending exit needs order reconciliation/);

  state.positions.push({
    symbol: 'AAPL',
    qty: 1,
    fillPrice: 100,
    targetPrice: 105,
    entryTimestamp: new Date().toISOString(),
  });
  options.fetchPositions = () => ({
    status: 'confirmed',
    positions: [{ symbol: 'AAPL', quantity: 50, marketValue: 5500 }],
  });
  result = await runAlpacaExitCheck(['--paper-provider'], options);
  assert.equal(result.sellsSubmitted || 0, 0);
  assert.equal(state.positions.length, 2);
  assert.ok(result.errors.some((error) => /skipping duplicate exit/.test(error)));
});
