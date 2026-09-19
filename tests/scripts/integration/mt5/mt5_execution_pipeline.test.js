'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const { Mt5Adapter } = require('../../../../backend/gateway/src/adapters/mt5_adapter.ts');
const { MockMt5Client } = require('../../../fixtures/mock_mt5_bridge.js');
const { MagicCodec } = require('../../../../shared/lib/runtime/mt5_magic_codec.js');

test('MT5 Execution Pipeline: comprehensive trade execution, positions, and balance query', async () => {
  const PORT = 19284;
  const adapter = new Mt5Adapter({ port: PORT, host: '127.0.0.1', autoStartServer: false });
  await adapter.startServer();

  const mockClient = new MockMt5Client(PORT, '127.0.0.1');
  await mockClient.connect();
  await new Promise((r) => setTimeout(r, 100));

  // 1. Submit Market Buy Order with strategy attribution
  const buyRes = await adapter.placeOrder({
    instrumentId: 'EURUSD',
    side: 'buy',
    type: 'market',
    quantity: 100000,
    strategyId: 'forex_trend_breakout',
    clientOrderId: 'sov-ord-001',
  });
  assert.equal(buyRes.status, 'filled');
  assert.ok(buyRes.orderId);

  // 2. Submit Limit Sell Order with sub-position strategy attribution
  const sellRes = await adapter.placeOrder({
    instrumentId: 'GBPUSD',
    side: 'sell',
    type: 'limit',
    quantity: 50000,
    price: 1.2850,
    strategyId: 'mean_reversion',
    clientOrderId: 'sov-ord-002',
  });
  assert.equal(sellRes.status, 'filled');

  // 3. Query open positions
  const positions = await adapter.getPositions();
  assert.ok(Array.isArray(positions));
  assert.equal(positions.length, 1);
  assert.equal(positions[0].symbol, 'EURUSD');
  assert.equal(positions[0].quantity, 0.10);
  assert.equal(positions[0].unrealizedPl, 10.0);
  assert.equal(positions[0].asset_id, '1001');

  // 4. Query account balances
  const balances = await adapter.getPortfolioBalance();
  assert.equal(balances.USD, 50000.0);
  assert.equal(balances.EQUITY, 50010.0);
  assert.equal(balances.FREE_MARGIN, 49500.0);

  // 5. Query symbol quote
  const quote = await adapter.getQuote('EURUSD');
  assert.equal(quote, 1.0855);

  // 6. Modify open position SL/TP
  const modifyOk = await adapter.modifyOrder('1001', { sl: 1.0850, tp: 1.0920 });
  assert.equal(modifyOk, true);

  // 7. Cancel order by ticket ID
  const cancelOk = await adapter.cancelOrder('889900');
  assert.equal(cancelOk, true);

  mockClient.disconnect();
  await adapter.stop();
});

test('MT5 Execution Pipeline: handles rejection from EA bridge', async () => {
  const PORT = 19285;
  const adapter = new Mt5Adapter({ port: PORT, host: '127.0.0.1', autoStartServer: false });
  await adapter.startServer();

  const mockClient = new MockMt5Client(PORT, '127.0.0.1');
  await mockClient.connect();
  await new Promise((r) => setTimeout(r, 100));

  // Custom responder simulating order rejection (e.g., retcode 10013 TRADE_RETCODE_INVALID_STOPS)
  mockClient.handleCommand = (line) => {
    const msg = JSON.parse(line.trim());
    if (msg.type === 'ORDER_SUBMIT') {
      mockClient.socket.write(JSON.stringify({
        type: 'ORDER_RESULT',
        nonce: msg.nonce,
        ok: false,
        retcode: 10013,
        retcodeDescription: 'TRADE_RETCODE_INVALID_STOPS',
        error: 'Invalid stop levels',
      }) + '\n');
    }
  };

  await assert.rejects(
    adapter.placeOrder({
      instrumentId: 'INVALID_SYM',
      side: 'buy',
      type: 'market',
      quantity: 1000,
    }),
    /MT5 Order Rejected: TRADE_RETCODE_INVALID_STOPS Invalid stop levels/
  );

  mockClient.disconnect();
  await adapter.stop();
});
