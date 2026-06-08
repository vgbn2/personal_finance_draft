const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const GATEWAY_RUNNER = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'backend',
  'cli',
  'lib',
  'run_trade_gateway.js'
);

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
    cwd: path.join(__dirname, '..', '..', '..'),
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
