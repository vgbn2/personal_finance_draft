'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseAllowedTimeframes,
  decideEntryBudget,
  utcDay,
} = require('../../../shared/lib/runtime/alpaca_intraday_policy.js');

test('Alpaca Paper intraday policy permits only explicit 5m and 15m timeframes', () => {
  assert.deepEqual(parseAllowedTimeframes('5m,15m,5m'), ['5m', '15m']);
  assert.throws(() => parseAllowedTimeframes('5m,1h'), /allowed_timeframes_invalid/);
  assert.throws(() => parseAllowedTimeframes(''), /allowed_timeframes_invalid/);
});

test('Alpaca Paper daily entry budget clamps each entry and rejects exhausted UTC-day budget', () => {
  const base = {
    perOrderMaxNotional: 50,
    dailyMaxNotional: 1000,
    now: '2026-08-11T23:59:59.000Z',
  };
  const first = decideEntryBudget({ ...base, requestedNotional: 125, entryIntents: [] });
  assert.equal(first.ok, true);
  assert.equal(first.approvedNotional, 50);
  assert.equal(first.remainingNotional, 1000);

  const almostSpent = decideEntryBudget({
    ...base,
    requestedNotional: 100,
    entryIntents: [{ utcDay: '2026-08-11', reservedNotional: 980, status: 'submitted' }],
  });
  assert.equal(almostSpent.approvedNotional, 20);

  const exhausted = decideEntryBudget({
    ...base,
    requestedNotional: 10,
    entryIntents: [{ utcDay: '2026-08-11', reservedNotional: 1000, status: 'confirmed' }],
  });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.reason, 'alpaca_paper_daily_budget_exhausted');
});

test('Alpaca Paper daily budget rolls over at UTC midnight and excludes released intents', () => {
  assert.equal(utcDay('2026-08-12T00:00:00.000Z'), '2026-08-12');
  const decision = decideEntryBudget({
    requestedNotional: 50,
    perOrderMaxNotional: 50,
    dailyMaxNotional: 1000,
    now: '2026-08-12T00:00:00.000Z',
    entryIntents: [
      { utcDay: '2026-08-11', reservedNotional: 1000, status: 'confirmed' },
      { utcDay: '2026-08-12', reservedNotional: 25, status: 'released' },
    ],
  });
  assert.equal(decision.approvedNotional, 50);
  assert.equal(decision.usedNotional, 0);
});
