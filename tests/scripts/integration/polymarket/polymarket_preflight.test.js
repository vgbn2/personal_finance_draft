const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const GATEWAY_RUNNER = path.resolve(__dirname, '..', '..', '..', '..',
  'backend',
  'cli',
  'lib',
  'run_trade_gateway.js'
);
const CLI_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');

test('polymarket buy --preflight rejects invalid quantity before any live submit', () => {
  const result = spawnSync(process.execPath, [
    GATEWAY_RUNNER,
    'polymarket',
    'buy',
    'TOKEN_123',
    '0',
    '0.5',
    '--preflight',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      LIVE_TRADING: 'true',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /Quantity must be a positive number/);
});

test('polymarket gateway blocks direct live submission without CLI authorization', () => {
  const result = spawnSync(process.execPath, [
    GATEWAY_RUNNER,
    'polymarket',
    'buy',
    'TOKEN_123',
    '1',
    '0.5',
    '--live',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      LIVE_TRADING: 'true',
      SOVEREIGN_EXECUTION_AUTHORIZED: '',
    },
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /requires --live and CLI authorization/);
});

test('polymarket gateway blocks direct live bot cycles without CLI authorization', () => {
  const result = spawnSync(process.execPath, [
    GATEWAY_RUNNER,
    'bot',
    'cycle',
    '--live',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      LIVE_TRADING: 'true',
      SOVEREIGN_EXECUTION_AUTHORIZED: '',
    },
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /bot execution requires --live and CLI authorization/);
});

test('polymarket gateway rejects env-only live bot mode before cycle work', () => {
  const result = spawnSync(process.execPath, [
    GATEWAY_RUNNER,
    'bot',
    'cycle',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      LIVE_TRADING: 'true',
      SOVEREIGN_EXECUTION_AUTHORIZED: '',
    },
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /requires --live and CLI authorization/);
});

test('polymarket CLI rejects inherited live bot mode without explicit --live', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH,
    'bot',
    'cycle',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      LIVE_TRADING: 'true',
      SOVEREIGN_EXECUTION_AUTHORIZED: '',
    },
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.reason, /requires explicit --live authorization/);
});

test('polymarket CLI blocks direct orders without explicit --live authorization', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH,
    'polymarket',
    'buy',
    'TOKEN_123',
    '1',
    '0.5',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.reason, /require explicit --live authorization/);
});

test('authorized polymarket gateway submission still requires an explicit limit price', () => {
  const result = spawnSync(process.execPath, [
    GATEWAY_RUNNER,
    'polymarket',
    'buy',
    'TOKEN_123',
    '1',
    '--live',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      LIVE_TRADING: 'true',
      SOVEREIGN_EXECUTION_AUTHORIZED: 'true',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /explicit price between 0 and 1/);
});
