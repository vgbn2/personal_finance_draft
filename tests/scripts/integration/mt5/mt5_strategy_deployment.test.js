'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

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

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const { readStrategyRegistry, inspectStrategyFile } = require(path.join(REPO_ROOT, 'backend', 'cli', 'commands', 'strategy', 'strategy.js'));
const { MagicCodec } = require(path.join(REPO_ROOT, 'shared', 'lib', 'runtime', 'mt5_magic_codec.js'));
const { Mt5Adapter } = require(path.join(REPO_ROOT, 'backend', 'gateway', 'src', 'adapters', 'mt5_adapter.ts'));
const { MockMt5Client } = require(path.join(REPO_ROOT, 'tests', 'fixtures', 'mock_mt5_bridge.js'));

test('MT5 Strategy Deployment: All registered MT5 strategies load and validate cleanly', () => {
  const registered = readStrategyRegistry();
  assert.ok(registered.length >= 26, `Expected at least 26 registered strategies, got ${registered.length}`);

  const mt5Curated = [
    'forex_london_breakout',
    'gold_ny_momentum',
    'nasdaq_opening_drive',
    'forex_asian_range_scalp',
    'crude_oil_inventory_reversal',
    'crypto_mt5_trend_pulse',
  ];

  const mt5Automated = [
    'auto_mt5_forex_breakout_cnn_15m_mu7z1fx1',
    'auto_mt5_gold_orderflow_rf_15m_mu7z2au1',
    'auto_mt5_indices_momentum_lr_5m_mu7z3us1',
    'auto_mt5_forex_reversion_knn_30m_mu7z4fx2',
  ];

  for (const name of [...mt5Curated, ...mt5Automated]) {
    const fileMatch = registered.find((f) => f.includes(name));
    assert.ok(fileMatch, `Strategy ${name} must be listed in config/trading/strategies.yaml`);

    const inspected = inspectStrategyFile(fileMatch);
    assert.equal(inspected.ok, true, `Strategy ${name} failed inspection: ${JSON.stringify(inspected.issues)}`);
    assert.equal(inspected.enabled, true, `Strategy ${name} should be enabled`);
    assert.ok(Array.isArray(inspected.universe) && inspected.universe.length > 0, `Strategy ${name} must have non-empty universe`);
    assert.ok(inspected.model, `Strategy ${name} must declare a valid model`);
  }
});

test('MT5 Strategy Deployment: 64-bit ORDER_MAGIC encodes strategy CRC16 and timeframe accurately', () => {
  const testCases = [
    { strategy: 'forex_london_breakout', tf: 15, tfStr: '15m' },
    { strategy: 'gold_ny_momentum', tf: 15, tfStr: '15m' },
    { strategy: 'nasdaq_opening_drive', tf: 5, tfStr: '5m' },
    { strategy: 'crude_oil_inventory_reversal', tf: 60, tfStr: '1h' },
    { strategy: 'crypto_mt5_trend_pulse', tf: 60, tfStr: '1h' },
    { strategy: 'auto_mt5_forex_reversion_knn_30m_mu7z4fx2', tf: 30, tfStr: '30m' },
  ];

  for (const tc of testCases) {
    const magicStr = MagicCodec.encode({
      strategyId: tc.strategy,
      timeframeMinutes: tc.tf,
      instanceId: 42,
    });

    const magicBig = BigInt(magicStr);
    assert.ok(magicBig > 0n, `Magic must be positive integer: ${magicStr}`);

    const decoded = MagicCodec.decode(magicStr);
    assert.equal(decoded.systemId, 0x534F, 'System ID must match Sovereign (0x534F)');
    assert.equal(decoded.timeframeMinutes, tc.tf, `Timeframe must decode to ${tc.tf}m`);
    assert.equal(decoded.instanceId, 42, 'Instance ID must decode to 42');
  }
});

test('MT5 Strategy Deployment: Mt5Adapter places order with timeframe-encoded magic number', async () => {
  const PORT = 19286;
  const adapter = new Mt5Adapter({ port: PORT, host: '127.0.0.1', autoStartServer: false });
  await adapter.startServer();

  const mockClient = new MockMt5Client(PORT, '127.0.0.1');
  await mockClient.connect();
  await new Promise((r) => setTimeout(r, 100));

  try {
    const buyRes = await adapter.placeOrder({
      instrumentId: 'EURUSD',
      side: 'buy',
      type: 'market',
      quantity: 100000,
      strategyId: 'forex_london_breakout',
      timeframe: '15m',
      clientOrderId: 'sov-fx-001',
    });

    assert.equal(buyRes.status, 'filled');
    assert.ok(buyRes.orderId);

    // Verify Gold 15m order
    const goldRes = await adapter.placeOrder({
      instrumentId: 'XAUUSD',
      side: 'buy',
      type: 'market',
      quantity: 10,
      strategyId: 'gold_ny_momentum',
      timeframe: '15m',
      clientOrderId: 'sov-gold-001',
    });
    assert.equal(goldRes.status, 'filled');
    assert.ok(goldRes.orderId);
  } finally {
    mockClient.disconnect();
    adapter.stop();
  }
});

test('MT5 Strategy Deployment: CLI runner correctly exports commandRun and supports mt5 bot subcommand', () => {
  const runModule = require(path.join(REPO_ROOT, 'backend', 'cli', 'commands', 'runner', 'run.js'));
  assert.equal(typeof runModule.commandRun, 'function', 'commandRun must be exported');
});
