'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { WebSocketServer } = require('../../../../backend/gateway/node_modules/ws');

require('../../../../shared/lib/runtime/ts_register');
const {
  reconnectDelayMs,
  startPolyBoltBboMonitor,
} = require('../../../../backend/gateway/src/polymarket/polybolt_bbo_monitor');

const fixture = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'fixtures', 'polymarket', 'polybolt_bbo_gap.json'),
  'utf8',
));

async function waitFor(predicate, message, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

async function createHarness(options = {}) {
  let snapshotRequests = 0;
  let releaseDelayedSnapshot;
  const delayedSnapshot = new Promise((resolve) => { releaseDelayedSnapshot = resolve; });
  const subscriptions = [];
  const sockets = [];

  const server = http.createServer(async (request, response) => {
    snapshotRequests += 1;
    if (options.delaySecondSnapshot && snapshotRequests === 2) {
      await delayedSnapshot;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(fixture.rest_snapshot));
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (raw) => subscriptions.push(JSON.parse(raw.toString())));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const monitor = startPolyBoltBboMonitor({
    url: `ws://127.0.0.1:${address.port}`,
    reconnectDelay: options.reconnectDelay || (() => 0),
    fetchSnapshot: async (assetId) => {
      const response = await fetch(`${baseUrl}/book/${encodeURIComponent(assetId)}`);
      return response.json();
    },
    log: { warn() {}, error() {} },
  });

  return {
    monitor,
    subscriptions,
    sockets,
    get snapshotRequests() { return snapshotRequests; },
    releaseDelayedSnapshot,
    async close() {
      monitor.stop();
      for (const socket of sockets) {
        try { socket.terminate(); } catch {}
      }
      wss.close();
      server.close();
      await Promise.allSettled([once(wss, 'close'), once(server, 'close')]);
    },
  };
}

test('sequence gap invalidates BBO/depth, restores REST book, and starts a new epoch', async () => {
  const harness = await createHarness({ delaySecondSnapshot: true });
  try {
    await harness.monitor.setAssetIds([fixture.asset_id]);
    await waitFor(() => harness.subscriptions.length === 1, 'initial PolyBolt subscription was not sent');
    assert.deepEqual(harness.subscriptions[0].subscriptions, [{
      channel: 'price.polymarket',
      filter: { asset_id: fixture.asset_id },
    }]);
    assert.equal(harness.snapshotRequests, 1);

    harness.sockets[0].send(JSON.stringify(fixture.frames[0]));
    await waitFor(() => harness.monitor.getStatus().lastSeq === 1, 'initial sequence was not observed');
    assert.equal(harness.monitor.getStatus().assets[fixture.asset_id].bbo.best_bid, '0.51');

    harness.sockets[0].send(JSON.stringify(fixture.frames[1]));
    await waitFor(() => harness.monitor.getStatus().recovering, 'gap did not start recovery');
    const invalidated = harness.monitor.getStatus().assets[fixture.asset_id];
    assert.equal(invalidated.state, 'INVALID_AWAITING_SNAPSHOT');
    assert.equal(invalidated.bbo, undefined);
    assert.equal(invalidated.book, undefined);

    harness.releaseDelayedSnapshot();
    await waitFor(() => harness.subscriptions.length === 2, 'monitor did not reconnect after REST recovery');
    const recovered = harness.monitor.getStatus();
    assert.equal(recovered.assets[fixture.asset_id].state, 'SYNCHRONIZED');
    assert.deepEqual(recovered.assets[fixture.asset_id].book, fixture.rest_snapshot.book);
    assert.equal(recovered.lastSeq, null);
    assert.equal(harness.snapshotRequests, 2);

    harness.sockets[1].send(JSON.stringify(fixture.frames[0]));
    await waitFor(() => harness.monitor.getStatus().lastSeq === 1, 'new connection epoch did not reset sequence');
  } finally {
    await harness.close();
  }
});

test('contiguous PolyBolt frames do not trigger REST recovery', async () => {
  const harness = await createHarness();
  try {
    await harness.monitor.setAssetIds([fixture.asset_id]);
    await waitFor(() => harness.subscriptions.length === 1, 'PolyBolt subscription was not sent');
    harness.sockets[0].send(JSON.stringify(fixture.frames[0]));
    harness.sockets[0].send(JSON.stringify({ ...fixture.frames[1], seq: 2 }));
    await waitFor(() => harness.monitor.getStatus().lastSeq === 2, 'contiguous sequence was not applied');
    assert.equal(harness.snapshotRequests, 1);
    assert.equal(harness.monitor.getStatus().assets[fixture.asset_id].bbo.best_bid, '0.52');
  } finally {
    await harness.close();
  }
});

test('terminal policy close code 4008 does not reconnect blindly', async () => {
  const harness = await createHarness({ reconnectDelay: reconnectDelayMs });
  try {
    await harness.monitor.setAssetIds([fixture.asset_id]);
    await waitFor(() => harness.subscriptions.length === 1, 'PolyBolt subscription was not sent');
    harness.sockets[0].close(4008, 'policy violation');
    await waitFor(() => !harness.monitor.getStatus().connected, 'terminal close was not observed');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(harness.sockets.length, 1);
    assert.equal(
      harness.monitor.getStatus().assets[fixture.asset_id].state,
      'INVALID_AWAITING_SNAPSHOT',
    );
  } finally {
    await harness.close();
  }
});

test('subscription set rejects more than 64 unique assets before opening a socket', async () => {
  const monitor = startPolyBoltBboMonitor({
    url: 'ws://127.0.0.1:1',
    fetchSnapshot: async () => fixture.rest_snapshot,
  });
  try {
    await assert.rejects(
      () => monitor.setAssetIds(Array.from({ length: 65 }, (_, index) => `asset-${index}`)),
      /at most 64 active subscriptions/,
    );
    assert.equal(monitor.getStatus().connected, false);
  } finally {
    monitor.stop();
  }
});
