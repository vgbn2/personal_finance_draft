'use strict';

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

const root = process.env.ALPACA_CONTRACT_ROOT;
assert.ok(root && root.startsWith('/tmp/opencode/'), 'Set ALPACA_CONTRACT_ROOT to an isolated build');
const { ExecutionGateway } = require(path.join(root, 'backend/execution/dist/index.js'));
const { AlpacaAdapter } = require(path.join(root, 'backend/execution/dist/adapters/alpaca_adapter.js'));
const ledger = require(path.join(root, 'shared/lib/runtime/sub_positions_ledger.js'));

function accountFixture(t, accountId = 'account-a') {
  const dir = fs.mkdtempSync('/tmp/opencode/account-gateway-test-');
  const file = path.join(dir, 'ledger.json');
  const requests = [];
  const orders = new Map();
  let sequence = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    requests.push({ method: req.method, url: req.url, body });
    let payload;
    if (req.method === 'GET' && req.url === '/v2/account') {
      payload = { id: accountId, cash: '10000', equity: '10000', buying_power: '10000' };
    } else if (req.method === 'GET' && req.url === '/v2/positions') {
      payload = [];
    } else if (req.method === 'POST' && req.url === '/v2/orders') {
      const id = `fixture-order-${++sequence}`;
      const order = {
        id,
        client_order_id: body.client_order_id,
        symbol: body.symbol,
        side: body.side,
        qty: String(body.qty),
        status: 'accepted',
        filled_qty: '0',
        filled_avg_price: null,
      };
      orders.set(id, order);
      payload = order;
    } else if (req.method === 'GET' && req.url.startsWith('/v2/orders/')) {
      payload = orders.get(req.url.slice('/v2/orders/'.length));
      if (!payload) {
        res.writeHead(404);
        res.end(JSON.stringify({ message: 'unknown order' }));
        return;
      }
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ message: `Unexpected fixture route ${req.method} ${req.url}` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1');
  return once(server, 'listening').then(() => {
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const adapter = new AlpacaAdapter({ keyId: 'fixture-key', secretKey: 'fixture-secret', paper: true, baseUrl });
    return {
      adapter,
      gateway: new ExecutionGateway({ dryRun: false, adapter, ledgerPath: file }),
      file,
      requests,
      orders,
      baseUrl,
    };
  });
}

function receipt(order, status, filledQty, filledAvgPrice) {
  return {
    orderId: order.id,
    symbol: order.symbol,
    side: order.side,
    status,
    quantity: Number(order.qty),
    filledQty,
    filledAvgPrice,
  };
}

function startCliFixture(t, requestFile) {
  const worker = cp.spawn(process.execPath, ['-e', `
    const http = require('node:http');
    const fs = require('node:fs');
    const requestFile = process.argv[1];
    const orders = new Map();
    let sequence = 0;
    const requests = [];
    const server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      requests.push({ method: req.method, url: req.url, body });
      fs.writeFileSync(requestFile, JSON.stringify(requests));
      let payload;
      if (req.method === 'GET' && req.url === '/v2/account') payload = { id: 'account-cli', cash: '10000', equity: '10000', buying_power: '10000' };
      else if (req.method === 'GET' && req.url === '/v2/positions') payload = [];
      else if (req.method === 'POST' && req.url === '/v2/orders') {
        const id = 'cli-order-' + (++sequence);
        payload = { id, client_order_id: body.client_order_id, symbol: body.symbol, side: body.side, qty: String(body.qty), status: 'accepted', filled_qty: '0', filled_avg_price: null };
        orders.set(id, payload);
      } else if (req.method === 'GET' && req.url.startsWith('/v2/orders/')) {
        payload = orders.get(req.url.slice('/v2/orders/'.length));
        if (!payload) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'order not found' }));
          return;
        }
      }
      else { res.writeHead(404); res.end(JSON.stringify({ message: 'unexpected route' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
    server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port) + '\\n'));
    process.on('SIGTERM', () => {
      fs.writeFileSync(requestFile, JSON.stringify(requests));
      server.closeAllConnections?.();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 100).unref();
    });
  `, requestFile], { encoding: 'utf8' });
  t.after(async () => {
    if (worker.exitCode === null) {
      worker.kill('SIGTERM');
      await once(worker, 'exit');
    }
  });
  return new Promise((resolve, reject) => {
    worker.stdout.once('data', (data) => resolve({
      process: worker,
      port: Number(String(data).trim()),
      baseUrl: `http://127.0.0.1:${Number(String(data).trim())}`,
      stop: async () => {
        if (worker.exitCode === null) {
          worker.kill('SIGTERM');
          await once(worker, 'exit');
        }
        return JSON.parse(fs.readFileSync(requestFile, 'utf8'));
      },
    }));
    worker.once('error', reject);
  });
  /* return once(worker, 'message').then(({ port }) => ({
    baseUrl: `http://127.0.0.1:${port}`,
    stop: async () => {
      worker.postMessage('stop');
      await once(worker, 'exit');
      return JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    },
  })); */
}

test('authenticated Alpaca namespace persists ordered allocations and applies cumulative fills once', async (t) => {
  const f = await accountFixture(t);
  const buy = {
    instrumentId: 'SPY', side: 'buy', type: 'market', quantity: 4, price: 100,
    broker: 'alpaca', providerPaper: true, clientOrderId: 'buy-client',
    allocations: [{ strategyId: 'alpha', quantity: 2 }, { strategyId: 'beta', quantity: 2 }],
  };
  await f.gateway.execute(buy);
  assert.equal(buy.error, undefined);
  const namespace = 'alpaca:paper:account-a';
  let state = ledger.loadAccountLedger(f.file, namespace);
  assert.deepEqual(state.positions, {});
  assert.equal(state.pending_orders['buy-client'].account_namespace, namespace);
  assert.deepEqual(state.pending_orders['buy-client'].allocations.map(({ strategyId, quantity }) => ({ strategyId, quantity })), buy.allocations);
  assert.equal(f.requests.filter(({ method }) => method === 'POST').length, 1);

  const buyOrder = f.orders.get('fixture-order-1');
  f.orders.set(buyOrder.id, { ...buyOrder, status: 'filled', filled_qty: '4', filled_avg_price: '100' });
  await f.gateway.reconcilePendingOrders(true);
  await f.gateway.reconcilePendingOrders(true);
  state = ledger.loadAccountLedger(f.file, namespace);
  assert.deepEqual(state.positions.SPY.map((row) => [row.strategy_id, row.quantity]), [['alpha', 2], ['beta', 2]]);

  const sell = {
    instrumentId: 'SPY', side: 'sell', type: 'market', quantity: 4, price: 110,
    broker: 'alpaca', providerPaper: true, clientOrderId: 'sell-client',
    allocations: [{ strategyId: 'alpha', quantity: 2 }, { strategyId: 'beta', quantity: 2 }],
  };
  await f.gateway.execute(sell);
  const sellOrder = f.orders.get('fixture-order-2');
  f.orders.set(sellOrder.id, { ...sellOrder, status: 'partially_filled', filled_qty: '1', filled_avg_price: '110' });
  await f.gateway.reconcilePendingOrders(true);
  await f.gateway.reconcilePendingOrders(true);
  state = ledger.loadAccountLedger(f.file, namespace);
  assert.deepEqual(state.positions.SPY.map((row) => [row.strategy_id, row.quantity]), [['alpha', 1], ['beta', 2]]);
  f.orders.set(sellOrder.id, { ...sellOrder, status: 'canceled', filled_qty: '3', filled_avg_price: '120' });
  await f.gateway.reconcilePendingOrders(true);
  state = ledger.loadAccountLedger(f.file, namespace);
  assert.deepEqual(state.positions.SPY.map((row) => [row.strategy_id, row.quantity]), [['beta', 1]]);
  assert.equal(state.history.filter((row) => row.exit_order_id === sellOrder.id).reduce((sum, row) => sum + row.quantity, 0), 3);
  assert.equal(f.requests.filter(({ method }) => method === 'POST').length, 2);
  console.log('data-flow: loopback HTTP -> real Alpaca SDK -> authenticated namespace -> atomic disk ledger; ordered alpha/beta fills are cumulative and replay-safe');
});

test('wrong account and legacy root quarantine fail before any order POST', async (t) => {
  const first = await accountFixture(t, 'account-a');
  const second = await accountFixture(t, 'account-b');
  const order = { instrumentId: 'SPY', side: 'buy', type: 'market', quantity: 1, price: 110, broker: 'alpaca', providerPaper: true, clientOrderId: 'wrong-account', strategyId: 'alpha' };
  await first.gateway.execute({ ...order, clientOrderId: 'account-a-buy' });
  const firstOrder = first.orders.get('fixture-order-1');
  first.orders.set(firstOrder.id, { ...firstOrder, status: 'filled', filled_qty: '1', filled_avg_price: '110' });
  await first.gateway.reconcilePendingOrders(true);

  const shared = new ExecutionGateway({ dryRun: false, adapter: second.adapter, ledgerPath: first.file });
  const wrongAccountOrder = { ...order, side: 'sell' };
  await shared.execute(wrongAccountOrder);
  assert.match(wrongAccountOrder.error, /Exit plan exceeds attributed holdings/);
  assert.equal(second.requests.filter(({ method }) => method === 'POST').length, 0);

  const legacyDir = fs.mkdtempSync('/tmp/opencode/account-gateway-legacy-');
  const legacyPath = path.join(legacyDir, 'ledger.json');
  fs.writeFileSync(legacyPath, JSON.stringify({ positions: { SPY: [{ symbol: 'SPY', strategy_id: 'alpha', quantity: 1, entry_price: 100, status: 'open' }] }, history: [], pending_orders: {} }));
  t.after(() => fs.rmSync(legacyDir, { recursive: true, force: true }));
  const legacy = new ExecutionGateway({ dryRun: false, adapter: first.adapter, ledgerPath: legacyPath });
  const legacyOrder = { ...order, clientOrderId: 'legacy-client' };
  await legacy.execute(legacyOrder);
  assert.match(legacyOrder.error, /Legacy ledger quarantined/);
  assert.equal(first.requests.filter(({ method }) => method === 'POST').length, 1);
});

test('position reconciliation fails closed on legacy data and exposes authenticated namespace', async (t) => {
  const f = await accountFixture(t);
  const namespace = await f.adapter.getAccountNamespace();
  assert.equal(namespace, 'alpaca:paper:account-a');
  const legacyDir = fs.mkdtempSync('/tmp/opencode/account-gateway-position-');
  const file = path.join(legacyDir, 'ledger.json');
  fs.writeFileSync(file, JSON.stringify({ positions: { SPY: [{ symbol: 'SPY', strategy_id: 'alpha', quantity: 1, entry_price: 100, status: 'open' }] }, history: [], pending_orders: {} }));
  t.after(() => fs.rmSync(legacyDir, { recursive: true, force: true }));
  assert.throws(() => ledger.reconcilePositions([], file, namespace), /Legacy ledger quarantined/);
});

test('CLI allocations value is consumed as a flag value, not a positional order type', async (t) => {
  const requestFile = path.join(fs.mkdtempSync('/tmp/opencode/account-gateway-cli-'), 'requests.json');
  t.after(() => fs.rmSync(path.dirname(requestFile), { recursive: true, force: true }));
  const f = await startCliFixture(t, requestFile);
  const cliLedger = path.join(root, 'storage/data/runtime/ledger/sub_positions.json');
  fs.rmSync(cliLedger, { force: true });
  fs.mkdirSync(path.dirname(cliLedger), { recursive: true });
  const result = cp.spawnSync(process.execPath, [path.join(root, 'backend/execution/dist/index.js'), 'buy', 'SPY', '2', 'limit', '100', '--paper-provider', '--paper-max-notional', '1000', '--json', '--allocations', '[{"strategyId":"alpha","quantity":1},{"strategyId":"beta","quantity":1}]'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SOVEREIGN_ENVIRONMENT_SURFACE: 'gateway_account',
      ALPACA_PAPER_API_KEY: 'fixture-key',
      ALPACA_PAPER_SECRET_KEY: 'fixture-secret',
      ALPACA_PAPER_BASE_URL: f.baseUrl,
      CURRENT_PORTFOLIO_DRAWDOWN: '0',
    },
  });
  const observedRequests = fs.existsSync(requestFile) ? fs.readFileSync(requestFile, 'utf8') : 'worker did not stop';
  assert.equal(result.status, 0, `${result.stderr}\nrequests=${observedRequests}`);
  const requests = await f.stop();
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);
  const cliState = ledger.loadAccountLedger(cliLedger, 'alpaca:paper:account-cli');
  assert.deepEqual(cliState.pending_orders[Object.keys(cliState.pending_orders)[0]].allocations.map(({ strategyId, quantity }) => ({ strategyId, quantity })), [{ strategyId: 'alpha', quantity: 1 }, { strategyId: 'beta', quantity: 1 }]);
});
