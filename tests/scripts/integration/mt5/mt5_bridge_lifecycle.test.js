'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const net = require('node:net');

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

test('MT5 Bridge Lifecycle: starts, performs registration handshake, and handles clean stop', async () => {
  const PORT = 19281;
  const adapter = new Mt5Adapter({ port: PORT, host: '127.0.0.1', autoStartServer: false });
  await adapter.startServer();

  const mockClient = new MockMt5Client(PORT, '127.0.0.1');
  await mockClient.connect();

  // Allow handshake tick
  await new Promise((r) => setTimeout(r, 100));

  const info = adapter.getTerminalInfo();
  assert.ok(info, 'Terminal info must be populated after REGISTER');
  assert.equal(info.terminalId, 'mock_mt5_01');
  assert.equal(info.account, 12345678);
  assert.equal(info.marginMode, 'RETAIL_HEDGING');

  mockClient.disconnect();
  // Allow disconnect tick
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(adapter.getTerminalInfo(), null, 'Terminal info must reset to null on disconnect');
  await adapter.stop();
});

test('MT5 Bridge Lifecycle: in-flight requests are immediately rejected when socket disconnects', async () => {
  const PORT = 19282;
  const adapter = new Mt5Adapter({ port: PORT, host: '127.0.0.1', autoStartServer: false, timeoutMs: 5000 });
  await adapter.startServer();

  const mockClient = new MockMt5Client(PORT, '127.0.0.1');
  await mockClient.connect();
  await new Promise((r) => setTimeout(r, 100));

  // Start an async request but disconnect before mock responds
  // Override mock's handleCommand to silence quote response
  mockClient.handleCommand = () => {};

  const quotePromise = adapter.getQuote('EURUSD');

  // Immediately disconnect
  mockClient.disconnect();

  await assert.rejects(
    quotePromise,
    /MT5 terminal bridge disconnected/,
    'Pending request must reject immediately on disconnect without waiting for timeout'
  );

  await adapter.stop();
});

test('MT5 Bridge Lifecycle: new client connection replaces previous socket safely', async () => {
  const PORT = 19283;
  const adapter = new Mt5Adapter({ port: PORT, host: '127.0.0.1', autoStartServer: false });
  await adapter.startServer();

  const client1 = new MockMt5Client(PORT, '127.0.0.1');
  await client1.connect();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(adapter.getTerminalInfo()?.account, 12345678);

  // Second client connects with different account
  const rawClient2 = net.createConnection({ port: PORT, host: '127.0.0.1' }, () => {
    rawClient2.write(JSON.stringify({
      type: 'REGISTER',
      terminalId: 'mock_mt5_02',
      account: 87654321,
      server: 'SecondServer',
      marginMode: 'RETAIL_NETTING',
      currency: 'EUR',
      leverage: 50,
      tradeAllowed: true,
    }) + '\n');
  });

  await new Promise((r) => setTimeout(r, 150));

  const info2 = adapter.getTerminalInfo();
  assert.equal(info2?.account, 87654321, 'Second client must take over active terminal slot');
  assert.equal(info2?.currency, 'EUR');

  client1.disconnect();
  rawClient2.destroy();
  await adapter.stop();
});
