const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const GATEWAY_RUNNER = path.resolve(__dirname, '..', '..', '..',
  'backend',
  'cli',
  'lib',
  'run_trade_gateway.js'
);

test('polymarket buy --preflight validation via gateway execution seam', () => {
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
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      SOVEREIGN_ENVIRONMENT_SURFACE: 'execution',
      LIVE_TRADING: 'true',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /Quantity must be a positive number/);
});

test('polymarket buy live validation requiring explicit price between 0 and 1', () => {
  const result = spawnSync(process.execPath, [
    GATEWAY_RUNNER,
    'polymarket',
    'buy',
    'TOKEN_123',
    '10',
    '1.5',
    '--live',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      SOVEREIGN_ENVIRONMENT_SURFACE: 'execution',
      LIVE_TRADING: 'true',
      SOVEREIGN_TRADE_PIN: '123456',
      SOVEREIGN_EXECUTION_AUTHORIZED: 'true',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error, /Live Polymarket orders require an explicit price between 0 and 1/);
});
