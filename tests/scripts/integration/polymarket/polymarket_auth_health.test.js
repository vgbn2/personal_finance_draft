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

test('polymarket auth-health reports not_configured when creds are absent', () => {
  const result = spawnSync(process.execPath, [
    GATEWAY_RUNNER,
    'polymarket',
    'auth-health',
    '--json',
  ], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      POLYMARKET_PRIVATE_KEY: '',
      POLYMARKET_API_KEY: '',
      POLYMARKET_API_SECRET: '',
      POLYMARKET_API_PASSPHRASE: '',
      POLYMARKET_FUNDER_ADDRESS: '',
      DEPOSIT_ADDRESS: '',
      PROXY_ADDRESS: '',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.equal(payload.configured, false);
  assert.equal(payload.likelyFailureStage, 'not_configured');
  assert.equal(payload.env.hasPrivateKey, false);
  assert.equal(payload.env.hasApiCreds, false);
});
