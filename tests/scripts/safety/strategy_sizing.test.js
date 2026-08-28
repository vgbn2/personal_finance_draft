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

test('strategy sizing supports fractional unit contracts when enabled', () => {
  const equityDecision = buildStrategySizingDecision({
    symbol: 'SPY',
    allocationUsd: 50,
    referencePrice: 500,
    allowFractional: true,
  });
  assert.equal(equityDecision.ok, true);
  assert.equal(equityDecision.quantity, 0.1);
  assert.equal(equityDecision.quantity_step, 0.001);
  assert.equal(equityDecision.projected_notional, 50);
  assert.equal(equityDecision.instrument.metadata_source, 'fractional_unit_contract');

  const cryptoDecision = buildStrategySizingDecision({
    symbol: 'BTCUSDT',
    allocationUsd: 65,
    referencePrice: 65000,
    allowFractional: true,
  });
  assert.equal(cryptoDecision.ok, true);
  assert.equal(cryptoDecision.quantity, 0.001);
  assert.equal(cryptoDecision.quantity_step, 0.0001);
  assert.equal(cryptoDecision.projected_notional, 65);
  assert.equal(cryptoDecision.instrument.metadata_source, 'fractional_unit_contract');
});
