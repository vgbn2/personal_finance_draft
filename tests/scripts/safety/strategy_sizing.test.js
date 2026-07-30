'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildStrategySizingDecision,
} = require('../../../backend/cli/commands/strategy/strategy.js');

test('strategy sizing fails closed instead of fabricating a one-dollar price', () => {
  for (const referencePrice of [undefined, null, 0, -1, Number.NaN]) {
    const decision = buildStrategySizingDecision({
      symbol: 'AAPL',
      allocationUsd: 100,
      referencePrice,
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.code, 'invalid_reference_price');
  }
});

test('strategy sizing preserves the legacy whole-unit contract explicitly', () => {
  const decision = buildStrategySizingDecision({
    symbol: 'AAPL',
    allocationUsd: 100,
    referencePrice: 30,
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.quantity, 3);
  assert.equal(decision.projected_notional, 90);
  assert.equal(decision.instrument.metadata_source, 'legacy_strategy_whole_unit_contract');
});
