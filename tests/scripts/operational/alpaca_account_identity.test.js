'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

const root = process.env.ALPACA_CONTRACT_ROOT;
assert.ok(root && root.startsWith('/tmp/opencode/'), 'Isolated source build required');
const { AlpacaAdapter } = require(path.join(root, 'backend/execution/dist/adapters/alpaca_adapter.js'));

test('account namespace uses authenticated SDK account ID and configured paper/live mode', async (t) => {
  let account = { id: 'account-one' };
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push([req.method, req.url]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(account));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const options = {
    keyId: 'fixture-key',
    secretKey: 'fixture-secret',
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
  const paper = new AlpacaAdapter({ ...options, paper: true });
  const live = new AlpacaAdapter({ ...options, paper: false });
  assert.equal(await paper.getAccountNamespace(), 'alpaca:paper:account-one');
  assert.equal(await live.getAccountNamespace(), 'alpaca:live:account-one');
  account = { id: 'account-two' };
  assert.equal(await paper.getAccountNamespace(), 'alpaca:paper:account-two');
  for (const id of [undefined, '', ' ', 'account:malformed', 123]) {
    account = { id };
    await assert.rejects(paper.getAccountNamespace(), /Malformed Alpaca account ID/);
  }
  const unauthenticated = new AlpacaAdapter({ keyId: '', secretKey: '' });
  await assert.rejects(unauthenticated.getAccountNamespace(), /Authenticated Alpaca account required/);
  assert.equal(requests.length, 8);
  assert.ok(requests.every(([method, url]) => method === 'GET' && url === '/v2/account'));
});
