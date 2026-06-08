const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeProposedOrder,
  validateProposedOrdersPayload,
} = require('../../../backend/gateway/src/proposed_orders');

test('normalizeProposedOrder accepts a standard buy record', () => {
  const result = normalizeProposedOrder({
    instrumentId: 'AAPL',
    side: 'buy',
    quantity: 2,
    type: 'limit',
    price: 10.5,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.order, {
    instrumentId: 'AAPL',
    side: 'buy',
    quantity: 2,
    price: 10.5,
    type: 'limit',
  });
});

test('validateProposedOrdersPayload fails closed on malformed orders', () => {
  const result = validateProposedOrdersPayload({
    orders: [
      {
        instrumentId: 'AAPL',
        side: 'buy',
        quantity: 1,
      },
      {
        symbol: 'TSLA',
        side: 'hold',
        quantity: 0,
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.total, 2);
  assert.equal(result.orders.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].errors.join('; '), /side must be buy or sell/);
});
