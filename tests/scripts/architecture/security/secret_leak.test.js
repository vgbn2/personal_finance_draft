const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const CLI_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'frontend', 'cli-tui', 'sovereign_cli.js');

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

test('setup output redacts secret values in json mode', () => {
  const result = runCli([
    'setup',
    'alpaca',
    '--dry-run',
    '--json',
    '--set',
    'ALPACA_PAPER_API_KEY=publishable_secret_123456789',
    '--set',
    'ALPACA_PAPER_SECRET_KEY=server_secret_987654321',
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[redacted\]/);
  assert.doesNotMatch(result.stdout, /publishable_secret_123456789/);
  assert.doesNotMatch(result.stdout, /server_secret_987654321/);
});

test('doctor output redacts secret values in json mode', () => {
  const result = runCli(
    ['doctor', 'gateio', '--json', '--no-network'],
    {
      GATEIO_API_KEY: 'publishable_secret_123456789',
      GATEIO_API_SECRET: 'server_secret_987654321',
      GATEIO_API_PASSPHRASE: 'gateio_pass_555',
    }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[redacted\]/);
  assert.doesNotMatch(result.stdout, /publishable_secret_123456789/);
  assert.doesNotMatch(result.stdout, /server_secret_987654321/);
});
