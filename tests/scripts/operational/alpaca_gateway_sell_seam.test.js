'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

// Require an explicitly isolated current-source build; never fall back to workspace dist.
const root = process.env.ALPACA_CONTRACT_ROOT;
assert.ok(root && root.startsWith('/tmp/opencode/'), 'Set ALPACA_CONTRACT_ROOT to an isolated build');
const { ExecutionGateway } = require(path.join(root, 'backend/execution/dist/index.js'));
const { AlpacaAdapter } = require(path.join(root, 'backend/execution/dist/adapters/alpaca_adapter.js'));
const ledger = require(path.join(root, 'shared/lib/runtime/sub_positions_ledger.js'));

async function fixture(t, quantities) {
  const dir = fs.mkdtempSync('/tmp/opencode/sell-seam-');
  const file = path.join(dir, 'ledger.json');
  const namespace = 'alpaca:paper:fixture-account';
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [strategy, quantity] of Object.entries(quantities)) {
    const entryOrder = {
      clientOrderId: `entry-client-${strategy}`,
      accountNamespace: namespace,
      instrumentId: 'SPY',
      side: 'buy',
      quantity,
      allocations: [{ strategyId: strategy, quantity }],
    };
    ledger.beginPendingOrder(entryOrder, file);
    ledger.attachPendingOrder(entryOrder.clientOrderId, `entry-${strategy}`, file, namespace);
    ledger.applyPendingOrderReceipt(entryOrder.clientOrderId, {
      accountNamespace: namespace,
      orderId: `entry-${strategy}`,
      symbol: 'SPY',
      side: 'buy',
      quantity,
      filledQty: quantity,
      filledAvgPrice: 100,
      status: 'filled',
    }, file, namespace);
  }
  const requests = [];
  let receipt = {
    id: 'sell-fixture',
    symbol: 'SPY',
    side: 'sell',
    type: 'market',
    qty: '4',
    filled_qty: '0',
    filled_avg_price: null,
    status: 'accepted',
    client_order_id: 'sell-client',
    time_in_force: 'gtc',
    submitted_at: '2026-11-24T00:00:00Z',
  };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    requests.push({
      method: req.method,
      url: req.url,
      body: body ? JSON.parse(body) : null,
    });
    let payload;
    if (req.url === '/v2/account' && req.method === 'GET') {
      payload = { id: 'fixture-account', cash: '10000', equity: '10000', buying_power: '10000' };
    } else if (req.url === '/v2/orders' && req.method === 'POST') {
      payload = receipt;
    } else if (req.url === `/v2/orders/${receipt.id}` && req.method === 'GET') {
      payload = receipt;
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ message: 'Unexpected fixture route' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const adapter = new AlpacaAdapter({
    keyId: 'fixture-key',
    secretKey: 'fixture-secret',
    paper: true,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  });
  const gateway = new ExecutionGateway({
    dryRun: false,
    adapter,
    ledgerPath: file,
  });
  const allocations = Object.entries(quantities).map(([strategyId, quantity]) => ({ strategyId, quantity }));
  return {
    adapter,
    gateway,
    file,
    requests,
    update: (values) => { receipt = { ...receipt, ...values }; },
    order: {
      instrumentId: 'SPY',
      side: 'sell',
      type: 'market',
      quantity: allocations.reduce((sum, item) => sum + item.quantity, 0),
      // Explicit reference avoids the separate market-data service entirely.
      price: 110,
      broker: 'alpaca',
      providerPaper: true,
      allocations,
      clientOrderId: 'sell-client',
    },
  };
}

test('real SDK gateway sell: accepted, partial, replay, canceled, restarted and filled', async (t) => {
  const f = await fixture(t, { alpha: 4 });
  await f.gateway.execute(f.order);
  assert.equal(f.order.error, undefined);
  let state = ledger.loadAccountLedger(f.file, 'alpaca:paper:fixture-account');
  assert.equal(state.positions.SPY[0].quantity, 4);
  assert.equal(state.history.length, 0);
  assert.equal(state.pending_orders['sell-client'].order_id, 'sell-fixture');
  assert.equal(f.requests.filter((request) => request.method === 'POST').length, 1);
  const submitted = f.requests.find((request) => request.method === 'POST').body;
  assert.equal(submitted.side, 'sell');
  assert.equal(Number(submitted.qty), 4);
  assert.equal(submitted.client_order_id, 'sell-client');

  f.update({ status: 'partially_filled', filled_qty: '1', filled_avg_price: '110' });
  const restarted = new ExecutionGateway({ adapter: f.adapter, ledgerPath: f.file });
  await restarted.reconcilePendingOrders(true);
  await restarted.reconcilePendingOrders(true);
  state = ledger.loadAccountLedger(f.file, 'alpaca:paper:fixture-account');
  assert.equal(state.positions.SPY[0].quantity, 3);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].quantity, 1);
  assert.equal(state.history[0].exit_price, 110);

  f.update({ status: 'canceled', filled_qty: '2', filled_avg_price: '115' });
  await restarted.reconcilePendingOrders(true);
  await restarted.reconcilePendingOrders(true);
  state = ledger.loadAccountLedger(f.file, 'alpaca:paper:fixture-account');
  assert.equal(state.positions.SPY[0].quantity, 2);
  assert.equal(state.history.length, 2);
  assert.equal(state.history[1].exit_price, 120);
  assert.equal(state.pending_orders['sell-client'].terminal, true);
  assert.equal(f.requests.filter((request) => request.method === 'POST').length, 1);

  f.update({
    id: 'sell-remainder',
    client_order_id: 'remainder-client',
    status: 'filled',
    qty: '2',
    filled_qty: '2',
    filled_avg_price: '125',
  });
  const remainder = {
    ...f.order,
    quantity: 2,
    allocations: [{ strategyId: 'alpha', quantity: 2 }],
    clientOrderId: 'remainder-client',
    status: undefined,
  };
  await f.gateway.execute(remainder);
  assert.equal(remainder.error, undefined);
  await restarted.reconcilePendingOrders(true);
  state = ledger.loadAccountLedger(f.file, 'alpaca:paper:fixture-account');
  assert.deepEqual(state.positions, {});
  assert.equal(state.history.reduce((sum, row) => sum + row.quantity, 0), 4);
  assert.equal(state.history.reduce((sum, row) => sum + row.quantity * row.exit_price, 0), 480);
  assert.equal(f.requests.filter((request) => request.method === 'POST').length, 2);
  assert.ok(f.requests.every((request) => ['GET', 'POST'].includes(request.method)));
  console.log('data-flow: loopback HTTP -> SDK parser -> compiled gateway -> file ledger; accepted 4 retained; partial/replay 3; canceled 2; filled 0; executed notional 480');
});

test('mixed-strategy aggregate sell must not fail accounting after confirmed full fill', async (t) => {
  const f = await fixture(t, { alpha: 2, beta: 2 });
  await f.gateway.execute(f.order);
  assert.equal(f.order.error, undefined);
  f.update({ status: 'filled', filled_qty: '4', filled_avg_price: '110' });
  // No FIFO/LIFO policy asserted: merely expose whether the current aggregate
  // contract can account for the full quantity across its attributed holdings.
  await f.gateway.reconcilePendingOrders(true);
  const state = ledger.loadAccountLedger(f.file, 'alpaca:paper:fixture-account');
  assert.deepEqual(state.positions, {});
  assert.equal(state.history.reduce((sum, row) => sum + row.quantity, 0), 4);
});
