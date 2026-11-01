'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const CLI_PATH = path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js');
const MOCK_RUNNER_PATH = path.join(__dirname, 'mock_mt5_terminal_runner.js');

function createMockTerminalWorker(port) {
  const child = spawn(process.execPath, [MOCK_RUNNER_PATH, String(port)], {
    stdio: 'ignore',
  });
  return {
    stop: () => {
      try {
        child.kill('SIGTERM');
      } catch {}
    },
  };
}

test('MT5 Interactive CLI: fails closed when bridge is disconnected', () => {
  const UNUSED_PORT = 19991;
  const res = spawnSync(process.execPath, [
    CLI_PATH,
    'trade',
    'balance',
    '--broker', 'mt5',
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      MT5_BRIDGE_PORT: String(UNUSED_PORT),
      MT5_CONNECT_TIMEOUT_MS: '50',
      SOVEREIGN_NONINTERACTIVE: 'true',
    },
  });

  assert.equal(res.status, 1, 'Command must exit with error status code');
  assert.ok(
    res.stdout.includes('MT5 terminal bridge is not connected') ||
    res.stderr.includes('MT5 terminal bridge is not connected'),
    'Output must indicate bridge disconnection'
  );
});

test('MT5 Interactive CLI: executes balance query over active bridge', async () => {
  const PORT = 19992;
  const terminal = createMockTerminalWorker(PORT);
  await new Promise((r) => setTimeout(r, 100));

  try {
    const res = spawnSync(process.execPath, [
      CLI_PATH,
      'trade',
      'balance',
      '--broker', 'mt5',
      '--json',
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        MT5_BRIDGE_PORT: String(PORT),
        MT5_CONNECT_TIMEOUT_MS: '3000',
      },
    });

    assert.equal(res.status, 0, `CLI failed with stderr: ${res.stderr}`);
    const payload = JSON.parse(res.stdout.trim());
    assert.equal(payload.ok, true);
    assert.equal(payload.USD, 100000.0);
    assert.equal(payload.EQUITY, 100500.0);
    assert.equal(payload.FREE_MARGIN, 95000.0);
  } finally {
    terminal.stop();
  }
});

test('MT5 Interactive CLI: queries open positions over active bridge', async () => {
  const PORT = 19993;
  const terminal = createMockTerminalWorker(PORT);
  await new Promise((r) => setTimeout(r, 100));

  try {
    const res = spawnSync(process.execPath, [
      CLI_PATH,
      'trade',
      'positions',
      '--broker', 'mt5',
      '--json',
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        MT5_BRIDGE_PORT: String(PORT),
        MT5_CONNECT_TIMEOUT_MS: '3000',
      },
    });

    assert.equal(res.status, 0, `CLI failed with stderr: ${res.stderr}`);
    const payload = JSON.parse(res.stdout.trim());
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.positions));
    assert.equal(payload.positions.length, 1);
    assert.equal(payload.positions[0].symbol, 'EURUSD');
    assert.equal(payload.positions[0].quantity, 0.10);
    assert.equal(payload.positions[0].unrealizedPl, 10.0);
  } finally {
    terminal.stop();
  }
});

test('MT5 Interactive CLI: submits buy order through risk engine to active bridge', async () => {
  const PORT = 19994;
  const terminal = createMockTerminalWorker(PORT);
  await new Promise((r) => setTimeout(r, 100));

  try {
    const res = spawnSync(process.execPath, [
      CLI_PATH,
      'trade',
      'buy',
      'EURUSD',
      '0.01',
      '--broker', 'mt5',
      '--json',
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        MT5_BRIDGE_PORT: String(PORT),
        MT5_CONNECT_TIMEOUT_MS: '3000',
      },
    });

    assert.equal(res.status, 0, `CLI failed with stderr: ${res.stderr}`);
    // Locate JSON payload in stdout lines
    const jsonLine = res.stdout.trim().split('\n').find((l) => l.startsWith('{') && l.endsWith('}'));
    assert.ok(jsonLine, `Expected JSON output line in: ${res.stdout}`);
    const payload = JSON.parse(jsonLine);

    assert.equal(payload.ok, true);
    assert.equal(payload.order.instrumentId, 'EURUSD');
    assert.equal(payload.order.side, 'buy');
    assert.equal(payload.order.quantity, 0.01);
    assert.equal(payload.order.broker, 'mt5');
    assert.equal(payload.order.status, 'submitted');
  } finally {
    terminal.stop();
  }
});
