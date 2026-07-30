'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeSizingIntent,
  roundDownToStep,
} = require('../../../shared/lib/trading/position_sizing.js');

function instrument(overrides = {}) {
  return {
    instrumentId: 'TEST',
    assetClass: 'equity',
    quoteCurrency: 'USD',
    quantityStep: 1,
    contractMultiplier: 1,
    metadataSource: 'test_contract',
    observedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

test('roundDownToStep handles whole and fractional quantity steps', () => {
  assert.equal(roundDownToStep(10.99, 1), 10);
  assert.equal(roundDownToStep(0.259, 0.001), 0.259);
  assert.equal(roundDownToStep(1.239, 0.01), 1.23);
});

test('notional sizing preserves intent and rounds by the instrument contract', () => {
  const fractional = normalizeSizingIntent({
    intent: { mode: 'notional', value: 50, currency: 'USD' },
    instrument: instrument({ quantityStep: 0.001 }),
    referencePrice: 200,
  });
  assert.equal(fractional.ok, true);
  assert.equal(fractional.quantity, 0.25);
  assert.equal(fractional.projected_notional, 50);
  assert.equal(fractional.requested_intent.mode, 'notional');
  assert.equal(fractional.rounding, 'down_to_quantity_step');

  const whole = normalizeSizingIntent({
    intent: { mode: 'notional', value: 50, currency: 'USD' },
    instrument: instrument(),
    referencePrice: 200,
  });
  assert.equal(whole.ok, false);
  assert.equal(whole.code, 'below_quantity_step');
});

test('contract and lot sizing use their economic multipliers', () => {
  const contracts = normalizeSizingIntent({
    intent: { mode: 'contracts', value: 2 },
    instrument: instrument({ assetClass: 'future', contractMultiplier: 50 }),
    referencePrice: 100,
  });
  assert.equal(contracts.ok, true);
  assert.equal(contracts.quantity, 2);
  assert.equal(contracts.projected_notional, 10000);

  const lots = normalizeSizingIntent({
    intent: { mode: 'lots', value: 0.25 },
    instrument: instrument({
      assetClass: 'fx',
      quantityStep: 0.01,
      contractMultiplier: 1,
      unitsPerLot: 100000,
    }),
    referencePrice: 1.1,
  });
  assert.equal(lots.ok, true);
  assert.equal(lots.quantity, 0.25);
  assert.equal(lots.projected_notional, 27500);
});

test('risk-budget sizing uses stop loss and fails closed on invalid prices', () => {
  const sized = normalizeSizingIntent({
    intent: { mode: 'risk_budget', value: 100, stopPrice: 95, currency: 'USD' },
    instrument: instrument(),
    referencePrice: 100,
  });
  assert.equal(sized.ok, true);
  assert.equal(sized.quantity, 20);
  assert.equal(sized.projected_notional, 2000);

  const totalLossStop = normalizeSizingIntent({
    intent: { mode: 'risk_budget', value: 10, stopPrice: 0, currency: 'USD' },
    instrument: instrument({ assetClass: 'prediction', quantityStep: 0.001 }),
    referencePrice: 0.2,
  });
  assert.equal(totalLossStop.ok, true);
  assert.equal(totalLossStop.quantity, 50);
  assert.equal(totalLossStop.projected_notional, 10);

  for (const referencePrice of [undefined, null, 0, -1, Number.NaN]) {
    const rejected = normalizeSizingIntent({
      intent: { mode: 'notional', value: 100 },
      instrument: instrument(),
      referencePrice,
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, 'invalid_reference_price');
  }
});

test('available cash, minimum quantity, and missing lot metadata fail safely', () => {
  const capped = normalizeSizingIntent({
    intent: { mode: 'units', value: 20 },
    instrument: instrument({ quantityStep: 0.1 }),
    referencePrice: 2,
    availableNotional: 10,
  });
  assert.equal(capped.ok, true);
  assert.equal(capped.quantity, 5);
  assert.deepEqual(capped.binding_caps, ['available_notional']);

  const belowMinimum = normalizeSizingIntent({
    intent: { mode: 'notional', value: 1 },
    instrument: instrument({ assetClass: 'prediction', quantityStep: 0.001, minQuantity: 5 }),
    referencePrice: 0.5,
  });
  assert.equal(belowMinimum.ok, false);
  assert.equal(belowMinimum.code, 'below_minimum_quantity');

  const missingLotContract = normalizeSizingIntent({
    intent: { mode: 'lots', value: 1 },
    instrument: instrument({ assetClass: 'fx', quantityStep: 0.01 }),
    referencePrice: 1.1,
  });
  assert.equal(missingLotContract.ok, false);
  assert.equal(missingLotContract.code, 'missing_units_per_lot');
});
