const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');

test('cloud-compute mode blocks live trade execution at the CLI boundary', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH,
    'trade',
    'buy',
    'AAPL',
    '1',
    'market',
    '--live',
    '--json',
  ], {
    cwd: path.join(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      SOVEREIGN_RUNTIME_MODE: 'cloud-compute',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Live execution blocked in cloud-compute mode/);
});

test('cloud-compute mode blocks direct polymarket live execution', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH,
    'polymarket',
    'buy',
    'TOKEN_123',
    '1',
    '0.5',
    '--live',
    '--json',
  ], {
    cwd: path.join(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      SOVEREIGN_RUNTIME_MODE: 'cloud-compute',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Live execution blocked in cloud-compute mode/);
});
