'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DeribitAdapter,
} = require('../../../../backend/gateway/dist/adapters/deribit_adapter.js');
const {
  resolveDeribitSettings,
  buildDeribitReport,
  TESTNET_BASE_URL,
  LIVE_BASE_URL,
} = require('../../../../shared/lib/brokers/deribit_env.js');
const {
  buildCockpitModel,
  cockpitInspectPayload,
} = require('../../../../backend/cli/commands/operational/status.js');

test('resolveDeribitSettings defaults to testnet and resolves keys from env', () => {
  const settings = resolveDeribitSettings({
    DERIBIT_CLIENT_ID: 'test_client_id',
    DERIBIT_CLIENT_SECRET: 'test_client_secret',
    DERIBIT_TESTNET: 'true',
  });
  assert.equal(settings.testnet, true);
  assert.equal(settings.baseUrl, TESTNET_BASE_URL);
  assert.equal(settings.clientId, 'test_client_id');
  assert.equal(settings.clientSecret, 'test_client_secret');

  const liveSettings = resolveDeribitSettings({
    DERIBIT_CLIENT_ID: 'live_client_id',
    DERIBIT_CLIENT_SECRET: 'live_client_secret',
    DERIBIT_TESTNET: 'false',
  });
  assert.equal(liveSettings.testnet, false);
  assert.equal(liveSettings.baseUrl, LIVE_BASE_URL);
});

test('buildDeribitReport outputs broker specification report', () => {
  const report = buildDeribitReport({
    DERIBIT_CLIENT_ID: 'key_12345678',
    DERIBIT_CLIENT_SECRET: 'secret_12345678',
  });
  assert.equal(report.broker, 'deribit');
  assert.equal(report.ok, true);
  assert.ok(Array.isArray(report.fields));
});

test('DeribitAdapter zero-key simulation fallback returns simulated orders and balances', async () => {
  const adapter = new DeribitAdapter({
    clientId: '',
    clientSecret: '',
    simulateIfMissingCredentials: true,
    testnet: true,
  });

  assert.equal(adapter.hasCredentials(), false);
  assert.equal(adapter.isTestnet(), true);
  assert.equal(adapter.getBaseUrl(), TESTNET_BASE_URL);

  const orderRes = await adapter.placeOrder({
    instrumentId: 'BTC-27SEP24-60000-C',
    quantity: 1,
    side: 'buy',
    type: 'limit',
    price: 0.05,
  });
  assert.ok(orderRes.orderId.startsWith('deribit-sim-'));
  assert.equal(orderRes.status, 'open');

  const canceled = await adapter.cancelOrder('deribit-sim-123');
  assert.equal(canceled, true);

  const balances = await adapter.getPortfolioBalance();
  assert.deepEqual(balances, { BTC: 0, ETH: 0, SOL: 0 });

  const positions = await adapter.getPositions();
  assert.deepEqual(positions, []);

  const greeks = await adapter.getOptionsGreeks('BTC');
  assert.deepEqual(greeks, { delta: 0, gamma: 0, vega: 0, theta: 0 });
});

test('DeribitAdapter throws when uncredentialed and simulation is disabled', async () => {
  const adapter = new DeribitAdapter({
    clientId: '',
    clientSecret: '',
    simulateIfMissingCredentials: false,
    testnet: true,
  });

  await assert.rejects(
    () => adapter.placeOrder({
      instrumentId: 'BTC-27SEP24-60000-C',
      quantity: 1,
      side: 'buy',
      type: 'market',
    }),
    /Deribit credentials are not configured/
  );

  await assert.rejects(
    () => adapter.getPortfolioBalance(),
    /Deribit credentials are not configured/
  );
});

test('buildCockpitModel includes options & derivatives card with inspection support', () => {
  const model = buildCockpitModel();
  assert.ok(Array.isArray(model.cards));
  assert.equal(model.cards.length, 6);

  const optionsCard = model.cards[5];
  assert.ok(optionsCard.title.includes('OPTIONS & DERIVATIVES'));
  assert.ok(optionsCard.metrics);
  assert.equal(typeof optionsCard.metrics.delta_oi, 'number');
  assert.equal(typeof optionsCard.metrics.smile_points, 'number');

  const inspected = cockpitInspectPayload('options');
  assert.ok(inspected);
  assert.equal(inspected.title, optionsCard.title);
});
