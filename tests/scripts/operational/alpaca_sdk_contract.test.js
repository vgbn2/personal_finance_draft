'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const path = require('node:path');
const root = process.env.ALPACA_CONTRACT_ROOT || path.resolve(__dirname, '../../..');
const { Alpaca, trading, marketData } = require(require.resolve('@alpacahq/alpaca-trade-api', { paths: [root] }));
const { AlpacaAdapter } = require(path.join(root, 'backend/execution/dist/adapters/alpaca_adapter.js'));

const position = {
  symbol: 'BTC/USD',
  qty: '2.5',
  qty_available: '0.75',
  avg_entry_price: '100',
  market_value: '275',
  unrealized_pl: '25',
};
const order = {
  id: 'order-fixture',
  status: 'accepted',
  symbol: 'BTC/USD',
  client_order_id: 'strategy-fixture',
  type: 'market',
  time_in_force: 'gtc',
  submitted_at: '2026-11-18T10:00:00Z',
  filled_at: '2026-11-18T10:01:00Z',
};

async function fixture(t) {
  const requests = [];
  const state = {
    account: { cash: '0', buying_power: '250.25', equity: '300' },
    positions: [position],
    orders: [order],
    submit: order,
    quote: { ap: 101.5, bp: 100.5, t: '2026-11-18T10:00:00Z' },
    status: 200,
    historyStatus: 200,
    cancelStatus: 204,
  };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    requests.push({
      method: req.method,
      url: new URL(req.url, 'http://fixture'),
      body: body ? JSON.parse(body) : undefined,
      key: req.headers['apca-api-key-id'],
      secret: req.headers['apca-api-secret-key'],
    });
    const url = requests.at(-1).url;
    let status = state.status;
    let payload;
    if (url.pathname === '/v2/account') payload = state.account;
    else if (url.pathname === '/v2/positions') payload = state.positions;
    else if (url.pathname === '/v2/orders' && req.method === 'POST') payload = state.submit;
    else if (url.pathname === '/v2/orders') {
      status = state.historyStatus;
      payload = state.orders;
    } else if (url.pathname.startsWith('/v2/orders/')) status = state.cancelStatus;
    else if (url.pathname === '/v2/stocks/AAPL/quotes/latest') payload = { symbol: 'AAPL', quote: state.quote };
    else if (url.pathname === '/v1beta3/crypto/us/latest/quotes') payload = { quotes: { 'BTC/USD': state.quote } };
    else status = 404;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(status === 204 ? undefined : JSON.stringify(status >= 400
      ? { code: status, message: `fixture HTTP ${status}` }
      : payload));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const options = {
    keyId: 'fixture-key',
    secret: 'fixture-secret',
    basePath: baseUrl,
    retry: undefined,
    rateLimit: undefined,
    timeoutMs: 1000,
  };
  const tradingConfig = new trading.Configuration(options);
  const dataConfig = new marketData.Configuration(options);
  // Actual SDK APIs and HTTP transport; no fake client methods or network to providers.
  const client = {
    trading: {
      account: new trading.AccountsApi(tradingConfig),
      positions: new trading.PositionsApi(tradingConfig),
      orders: new trading.OrdersApi(tradingConfig),
    },
    marketData: {
      stocks: new marketData.StockApi(dataConfig),
      crypto: new marketData.CryptoApi(dataConfig),
    },
  };
  return { state, requests, baseUrl, client, adapter: new AlpacaAdapter({ client }) };
}

test('SDK v5: complete legacy injection seam uses real local HTTP transport', async (t) => {
  const f = await fixture(t);
  async function request(method, route, body) {
    const response = await fetch(`${f.baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`legacy HTTP ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  }
  const client = {
    getAccount: () => request('GET', '/v2/account'),
    getPositions: () => request('GET', '/v2/positions'),
    getOrders: (query) => request('GET', `/v2/orders?${new URLSearchParams(query)}`),
    createOrder: (body) => request('POST', '/v2/orders', body),
    cancelOrder: (id) => request('DELETE', `/v2/orders/${encodeURIComponent(id)}`),
    getLatestQuote: async (symbol) => {
      const response = await request('GET', symbol.includes('/')
        ? `/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(symbol)}`
        : `/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`);
      const quote = response.quote ?? response.quotes[symbol];
      return { AskPrice: quote.ap, BidPrice: quote.bp };
    },
  };
  const adapter = new AlpacaAdapter({ client });
  assert.equal((await adapter.placeOrder({ instrumentId: 'AAPL', quantity: 1, side: 'buy', type: 'market' })).orderId, 'order-fixture');
  assert.equal(f.requests.at(-1).body.time_in_force, 'gtc');
  assert.deepEqual(await adapter.getPortfolioBalance(), { USD: 0, BUYING_POWER: 250.25, EQUITY: 300 });
  assert.equal((await adapter.getPositions())[0].qty_available, 0.75);
  assert.equal((await adapter.getPositions())[0].submittedAt, '2026-11-18T10:00:00.000Z');
  assert.equal(await adapter.cancelOrder('order-fixture'), true);
  assert.equal(await adapter.getQuote('AAPL'), 101.5);
  f.state.quote.ap = 0;
  assert.equal(await adapter.getQuote('AAPL'), 100.5);
  assert.equal(await adapter.getQuote('BTCUSDT'), 100.5);
  const partial = new AlpacaAdapter({ client: { getAccount: client.getAccount } });
  assert.equal((await partial.getPortfolioBalance()).EQUITY, 300);
  await assert.rejects(partial.cancelOrder('missing'), /cancelOrder/);
});

test('SDK v5: malformed financial fields independently fail closed', async (t) => {
  const f = await fixture(t);
  for (const field of ['buying_power', 'equity']) {
    f.state.account = { cash: '0', buying_power: '1', equity: '1', [field]: 'malformed' };
    await assert.rejects(f.adapter.getPortfolioBalance(), /Malformed Alpaca/);
  }
  for (const field of ['avg_entry_price', 'market_value', 'unrealized_pl']) {
    f.state.positions = [{ ...position, [field]: 'malformed' }];
    await assert.rejects(f.adapter.getPositions(), /Malformed Alpaca/);
  }
});

test('SDK v5: constructor credentials, paper/live and configured HTTP basePath', async (t) => {
  const f = await fixture(t);
  for (const paper of [true, false]) {
    const adapter = new AlpacaAdapter({
      keyId: 'fixture-key',
      secretKey: 'fixture-secret',
      paper,
      baseUrl: `${f.baseUrl}/`,
    });
    assert.deepEqual(await adapter.getPortfolioBalance(), { USD: 0, BUYING_POWER: 250.25, EQUITY: 300 });
    assert.equal(f.requests.at(-1).url.pathname, '/v2/account');
    assert.equal(f.requests.at(-1).key, 'fixture-key');
    assert.equal(f.requests.at(-1).secret, 'fixture-secret');
  }
  assert.equal(new Alpaca({ keyId: 'fixture', secret: 'fixture', paper: true }).paper, true);
  assert.equal(new trading.Configuration({ paper: true }).basePath, 'https://paper-api.alpaca.markets');
  assert.equal(new trading.Configuration({ paper: false }).basePath, 'https://api.alpaca.markets');
});

test('SDK v5: position model conversion preserves partial/zero availability and ISO history', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.adapter.getPositions(), [{
    symbol: 'BTCUSD',
    quantity: 2.5,
    qty_available: 0.75,
    averagePrice: 100,
    marketValue: 275,
    unrealizedPl: 25,
    submittedAt: '2026-11-18T10:00:00.000Z',
  }]);
  assert.equal(f.requests.at(-1).url.searchParams.get('limit'), '500');
  assert.equal(f.requests.at(-1).url.searchParams.get('status'), 'all');
  assert.equal(f.requests.at(-1).url.searchParams.get('nested'), 'false');
  assert.equal(f.requests.at(-1).url.searchParams.get('direction'), 'desc');
  const model = (await f.client.trading.orders.getAllOrders())[0];
  assert.equal(model.clientOrderId, 'strategy-fixture');
  assert.equal(model.filledAt.toISOString(), '2026-11-18T10:01:00.000Z');
  f.state.positions = [{ ...position, qty_available: '0', unrealized_pl: '0' }];
  assert.equal((await f.adapter.getPositions())[0].qty_available, 0);
  f.state.positions = [{ ...position, qty_available: undefined }];
  assert.equal((await f.adapter.getPositions())[0].qty_available, 2.5);
  f.state.orders = [{ ...order, submitted_at: null, created_at: null }];
  assert.equal((await f.adapter.getPositions())[0].submittedAt, '2026-11-18T10:01:00.000Z');
  f.state.orders = [{ ...order, submitted_at: null, created_at: '2026-11-18T09:59:00Z' }];
  assert.equal((await f.adapter.getPositions())[0].submittedAt, '2026-11-18T09:59:00.000Z');
  f.state.positions = [];
  assert.deepEqual(await f.adapter.getPositions(), []);
});

test('SDK v5: real order serialization, fractional/crypto TIF and bracket legs', async (t) => {
  const f = await fixture(t);
  for (const [symbol, qty, tif] of [['AAPL', 2, 'gtc'], ['AAPL', 0.5, 'day'], ['BTCUSDT', 0.25, 'gtc']]) {
    assert.deepEqual(await f.adapter.placeOrder({
      instrumentId: symbol,
      quantity: qty,
      side: 'buy',
      type: 'limit',
      price: 100.5,
      clientOrderId: 'strategy-fixture',
    }), { orderId: 'order-fixture', status: 'accepted' });
    assert.deepEqual(f.requests.at(-1).body, {
      symbol: symbol === 'BTCUSDT' ? 'BTC/USD' : symbol,
      qty: String(qty),
      side: 'buy',
      type: 'limit',
      time_in_force: tif,
      limit_price: '100.5',
      client_order_id: 'strategy-fixture',
    });
  }
  await f.adapter.placeBracketOrder('AAPL', 2, 110, 90);
  assert.deepEqual(f.requests.at(-1).body, {
    symbol: 'AAPL',
    qty: '2',
    side: 'buy',
    type: 'market',
    time_in_force: 'gtc',
    order_class: 'bracket',
    take_profit: { limit_price: '110' },
    stop_loss: { stop_price: '90' },
  });
  const count = f.requests.length;
  await assert.rejects(f.adapter.placeBracketOrder('BTCUSD', 1, 110, 90), /Invalid/);
  await assert.rejects(f.adapter.placeBracketOrder('AAPL', 0.5, 110, 90), /Invalid/);
  await assert.rejects(f.adapter.placeOrder({ instrumentId: 'AAPL', quantity: NaN, side: 'buy', type: 'market' }), /Invalid/);
  await assert.rejects(f.adapter.placeOrder({ instrumentId: 'AAPL', quantity: 1, side: 'buy', type: 'limit' }), /Invalid/);
  assert.equal(f.requests.length, count);
});

test('SDK v5: stock/crypto quote paths and wire price aliases', async (t) => {
  const f = await fixture(t);
  assert.equal(await f.adapter.getQuote('AAPL'), 101.5);
  assert.equal(f.requests.at(-1).url.pathname, '/v2/stocks/AAPL/quotes/latest');
  assert.equal(await f.adapter.getQuote('BTCUSDT'), 101.5);
  assert.equal(f.requests.at(-1).url.pathname, '/v1beta3/crypto/us/latest/quotes');
  assert.equal(f.requests.at(-1).url.searchParams.get('symbols'), 'BTC/USD');
  f.state.quote = { ...f.state.quote, ap: 0 };
  assert.equal(await f.adapter.getQuote('AAPL'), 100.5);
  f.state.quote = { ap: 'bad', bp: 100 };
  assert.equal(await f.adapter.getQuote('AAPL'), 0);
  f.state.quote = null;
  assert.equal(await f.adapter.getQuote('BTCUSD'), 0);
});

test('SDK v5: 401/403/429 propagate without retries; cancel 404 rejects', async (t) => {
  const f = await fixture(t);
  for (const status of [401, 403, 429]) {
    f.state.status = status;
    let count = f.requests.length;
    await assert.rejects(f.adapter.getPortfolioBalance(), new RegExp(`fixture HTTP ${status}`));
    assert.equal(f.requests.length, count + 1);
    count = f.requests.length;
    await assert.rejects(f.adapter.placeOrder({ instrumentId: 'AAPL', quantity: 1, side: 'buy', type: 'market' }), new RegExp(`fixture HTTP ${status}`));
    assert.equal(f.requests.length, count + 1);
    await assert.rejects(f.adapter.getPositions(), new RegExp(`fixture HTTP ${status}`));
    assert.equal(await f.adapter.getQuote('AAPL'), 0);
  }
  f.state.status = 200;
  assert.equal(await f.adapter.cancelOrder('order-fixture'), true);
  assert.equal(f.requests.at(-1).method, 'DELETE');
  assert.equal(f.requests.at(-1).url.pathname, '/v2/orders/order-fixture');
  f.state.cancelStatus = 404;
  await assert.rejects(f.adapter.cancelOrder('missing'), (err) => err.status === 404);
});

test('SDK v5: optional history failure is observable; malformed core payloads reject', async (t) => {
  const f = await fixture(t);
  const warnings = [];
  const warn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    f.state.historyStatus = 403;
    assert.equal((await f.adapter.getPositions())[0].submittedAt, undefined);
    assert.match(warnings.join('\n'), /history enrichment unavailable.*fixture HTTP 403/);
  } finally {
    console.warn = warn;
  }
  for (const account of [null, {}, { cash: 'bad', buying_power: '1', equity: '1' }]) {
    f.state.account = account;
    await assert.rejects(f.adapter.getPortfolioBalance(), /Alpaca SDK Account Error/);
  }
  for (const positions of [null, {}, [null], [{ ...position, qty: 'bad' }], [{ ...position, qty_available: 'bad' }]]) {
    f.state.positions = positions;
    await assert.rejects(f.adapter.getPositions(), /Alpaca SDK Positions Error/);
  }
  f.state.submit = {};
  await assert.rejects(f.adapter.placeOrder({ instrumentId: 'AAPL', quantity: 1, side: 'buy', type: 'market' }), /Malformed Alpaca order/);
});

test('SDK v5: missing credentials fail closed including bracket; simulation is explicit', async () => {
  const adapter = new AlpacaAdapter({ keyId: '', secretKey: '' });
  const request = { instrumentId: 'AAPL', quantity: 1, side: 'buy', type: 'market' };
  await assert.rejects(adapter.placeOrder(request), /credentials/);
  await assert.rejects(adapter.placeBracketOrder('AAPL', 1, 110, 90), /credentials/);
  await assert.rejects(adapter.getPortfolioBalance(), /credentials/);
  await assert.rejects(adapter.getPositions(), /credentials/);
  assert.equal(await adapter.cancelOrder('missing'), false);
  assert.equal(await adapter.getQuote('AAPL'), 0);
  const simulation = new AlpacaAdapter({ keyId: '', secretKey: '', simulateIfMissingCredentials: true });
  assert.equal((await simulation.placeOrder(request)).status, 'accepted');
  assert.deepEqual(await simulation.placeBracketOrder('AAPL', 1, 110, 90), { id: 'sim-bracket' });
  assert.deepEqual(await simulation.getPositions(), []);
});
