'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  commandPolymarket,
  runPolymarketMarketActionLoop,
  submitPolymarketBuyOrder,
} = require('../../../../backend/cli/commands/trade/trade_polymarket');

test('public Polymarket browser cancel requires no live authorization and does not mutate parent authorization', async () => {
  const previous = process.env.SOVEREIGN_EXECUTION_AUTHORIZED;
  process.env.SOVEREIGN_EXECUTION_AUTHORIZED = 'sentinel-before-browser';
  let browserCalls = 0;
  try {
    const status = await commandPolymarket(['markets'], {
      featureGate: () => ({ ok: true }),
      isRichTerminal: () => true,
      promptMarketBrowser: async () => {
        browserCalls += 1;
        return { cancelled: true };
      },
      authorizeLive: async () => {
        throw new Error('public browser entry must not request live authorization');
      },
    });
    assert.equal(status, 0);
    assert.equal(browserCalls, 1);
    assert.equal(process.env.SOVEREIGN_EXECUTION_AUTHORIZED, 'sentinel-before-browser');
  } finally {
    if (previous === undefined) delete process.env.SOVEREIGN_EXECUTION_AUTHORIZED;
    else process.env.SOVEREIGN_EXECUTION_AUTHORIZED = previous;
  }
});

test('selecting Buy invokes live authorization before credentialed account or orderbook work', async () => {
  const actions = ['buy_yes', 'exit'];
  let authorizationCalls = 0;
  const result = await runPolymarketMarketActionLoop(
    {
      question: 'Fixture market?',
      tokens: [
        { outcome: 'Yes', token_id: 'yes-token' },
        { outcome: 'No', token_id: 'no-token' },
      ],
    },
    { category: 'fixture' },
    [],
    {
      promptAction: async () => actions.shift(),
      fetchOrderbook: () => ({ book: { bids: [{ price: '0.5', size: '10' }], asks: [{ price: '0.51', size: '10' }] } }),
      authorizeLive: async () => {
        authorizationCalls += 1;
        return false;
      },
    },
  );
  assert.equal(result, 'exit');
  assert.equal(authorizationCalls, 1);
});

test('submit helper rejects callers that did not receive the module-private live authorization', () => {
  assert.throws(
    () => submitPolymarketBuyOrder('token', 5, 0.5, 0.01, true),
    /authorization is required immediately before submission/,
  );
});
