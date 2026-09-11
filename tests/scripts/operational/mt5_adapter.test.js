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

const { Mt5Adapter } = require('../../../backend/gateway/src/adapters/mt5_adapter.ts');
const { MockMt5Client } = require('../../fixtures/mock_mt5_bridge.js');

test('Mt5Adapter starts TCP server, accepts registration, and routes trades', async () => {
  const TEST_PORT = 18282;
  const adapter = new Mt5Adapter({ port: TEST_PORT, host: '127.0.0.1', autoStartServer: false });
  await adapter.startServer();

  const mockClient = new MockMt5Client(TEST_PORT, '127.0.0.1');
  await mockClient.connect();

  // Wait briefly for registration handshake to complete
  await new Promise((r) => setTimeout(r, 100));

  const termInfo = adapter.getTerminalInfo();
  assert.notEqual(termInfo, null);
  assert.equal(termInfo?.terminalId, 'mock_mt5_01');
  assert.equal(termInfo?.account, 12345678);

  // 1. Balance check
  const balance = await adapter.getPortfolioBalance();
  assert.equal(balance.USD, 50000.0);
  assert.equal(balance.EQUITY, 50010.0);
  assert.equal(balance.FREE_MARGIN, 49500.0);

  // 2. Positions check
  const positions = await adapter.getPositions();
  assert.equal(positions.length, 1);
  assert.equal(positions[0].symbol, 'EURUSD');
  assert.equal(positions[0].quantity, 0.10);
  assert.equal(positions[0].side, 'buy');

  // 3. Quote check
  const quote = await adapter.getQuote('EURUSD');
  assert.equal(quote, 1.0855);

  // 4. Place order
  const orderResult = await adapter.placeOrder({
    instrumentId: 'EURUSD',
    side: 'buy',
    type: 'market',
    quantity: 10000,
    strategyId: 'trend_cnn',
    clientOrderId: 'sov-test-01',
  });
  assert.equal(orderResult.status, 'filled');
  assert.equal(typeof orderResult.orderId, 'string');
  assert.notEqual(orderResult.orderId, '');

  // 5. Cancel order
  const cancelOk = await adapter.cancelOrder('123456');
  assert.equal(cancelOk, true);

  // Teardown
  mockClient.disconnect();
  await adapter.stop();
});

test('Mt5Adapter fails cleanly when terminal is disconnected', async () => {
  const TEST_PORT = 18283;
  const adapter = new Mt5Adapter({ port: TEST_PORT, host: '127.0.0.1', autoStartServer: false });
  await adapter.startServer();

  await assert.rejects(
    adapter.getPortfolioBalance(),
    /MT5 terminal bridge is not connected/
  );

  await adapter.stop();
});
