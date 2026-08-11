'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const botState = require('../../../shared/lib/runtime/alpaca_bot_state');
const { acquireLock, releaseLock } = require('../../../shared/lib/runtime/process_lock');

/**
 * TEST: alpaca_bot_state (persistent Alpaca position tracker)
 *
 * Backs up and restores the real STATE_PATH/LOCK_PATH around each test so the
 * suite never clobbers a developer's real local bot state.
 */

function withBackup(filePath, fn) {
  const existed = fs.existsSync(filePath);
  const backup = existed ? fs.readFileSync(filePath, 'utf8') : null;
  try {
    return fn();
  } finally {
    if (existed) fs.writeFileSync(filePath, backup, 'utf8');
    else { try { fs.unlinkSync(filePath); } catch { /* never existed */ } }
  }
}

test('loadState returns defaults when no state file exists', () => {
  withBackup(botState.STATE_PATH, () => {
    try { fs.unlinkSync(botState.STATE_PATH); } catch { /* already absent */ }
    const state = botState.loadState();
    assert.equal(state.version, 1);
    assert.deepEqual(state.positions, []);
    assert.deepEqual(state.cycleHistory, []);
    assert.equal(state.config.enabled, true);
  });
});

test('saveState then loadState round-trips a position atomically', () => {
  withBackup(botState.STATE_PATH, () => {
    const state = botState.loadState();
    state.positions.push({
      positionId: 'AAPL_123',
      symbol: 'AAPL',
      qty: 10,
      strategyName: 'test_strategy',
      entryPrice: 150,
      fillPrice: 150.25,
      entryTimestamp: new Date().toISOString(),
      stopPrice: 140,
      targetPrice: 170,
      maxHoldingDays: 7,
    });
    botState.saveState(state);
    assert.ok(!fs.existsSync(`${botState.STATE_PATH}.tmp`), 'temp file cleaned up after atomic rename');

    const reloaded = botState.loadState();
    assert.equal(reloaded.positions.length, 1);
    assert.equal(reloaded.positions[0].symbol, 'AAPL');
    assert.equal(reloaded.positions[0].fillPrice, 150.25);
  });
});

test('loadState merges a partial/legacy config with current defaults', () => {
  withBackup(botState.STATE_PATH, () => {
    fs.mkdirSync(require('node:path').dirname(botState.STATE_PATH), { recursive: true });
    fs.writeFileSync(botState.STATE_PATH, JSON.stringify({ config: { enabled: false } }), 'utf8');
    const state = botState.loadState();
    assert.equal(state.config.enabled, false, 'explicit field from disk wins');
    assert.equal(state.config.defaultStopLossPct, botState.DEFAULT_CONFIG.defaultStopLossPct, 'missing field falls back to default');
  });
});

test('entry intents reserve once, transition durably, and reject duplicate signals', () => {
  const state = botState.loadState({ fs: { existsSync: () => false } });
  const reservation = botState.reserveEntryIntent(state, {
    signalId: 'five-minute-signal',
    utcDay: '2026-08-11',
    reservedNotional: 50,
  });
  assert.equal(reservation.ok, true);
  assert.equal(reservation.intent.status, 'reserved');
  assert.equal(botState.reserveEntryIntent(state, {
    signalId: 'five-minute-signal',
    utcDay: '2026-08-11',
    reservedNotional: 50,
  }).ok, false);
  assert.equal(botState.setEntryIntentStatus(state, 'five-minute-signal', 'submitted').status, 'submitted');
  assert.equal(state.entryIntents.length, 1);
});

test('loadState fails loudly on corrupt existing state without rewriting it', () => {
  const dir = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'alpaca-state-corrupt-'));
  const statePath = require('node:path').join(dir, 'state.json');
  const corrupt = '{"positions":[';
  fs.writeFileSync(statePath, corrupt, 'utf8');
  try {
    assert.throws(
      () => botState.loadState({ statePath }),
      (error) => error.code === 'alpaca_bot_state_corrupt',
    );
    assert.equal(fs.readFileSync(statePath, 'utf8'), corrupt);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadState rejects a valid JSON document with an unsafe state shape', () => {
  const dir = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'alpaca-state-invalid-'));
  const statePath = require('node:path').join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ positions: 'silently-empty-before-fix' }), 'utf8');
  try {
    assert.throws(
      () => botState.loadState({ statePath }),
      (error) => error.code === 'alpaca_bot_state_invalid',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('acquireLock blocks a second concurrent acquire, releaseLock frees it', () => {
  withBackup(botState.LOCK_PATH, () => {
    try { fs.unlinkSync(botState.LOCK_PATH); } catch { /* already absent */ }
    assert.equal(acquireLock(botState.LOCK_PATH), true, 'first acquire succeeds');
    assert.equal(acquireLock(botState.LOCK_PATH), false, 'second acquire is blocked while the first holder (this process) is alive');
    releaseLock(botState.LOCK_PATH);
    assert.equal(acquireLock(botState.LOCK_PATH), true, 'acquire succeeds again after release');
    releaseLock(botState.LOCK_PATH);
  });
});

test('acquireLock reclaims a stale lock held by a dead PID', () => {
  withBackup(botState.LOCK_PATH, () => {
    fs.mkdirSync(require('node:path').dirname(botState.LOCK_PATH), { recursive: true });
    // PID 999999 is never a real running process on a dev/CI machine.
    fs.writeFileSync(botState.LOCK_PATH, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }), 'utf8');
    assert.equal(acquireLock(botState.LOCK_PATH), true, 'a dead-PID lock is reclaimed instead of blocking forever');
    releaseLock(botState.LOCK_PATH);
  });
});
