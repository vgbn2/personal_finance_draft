const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.join(__dirname, '..', '..', '..'),
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
    'supabase',
    '--dry-run',
    '--json',
    '--set',
    'SOVEREIGN_SUPABASE_URL=https://example.supabase.co',
    '--set',
    'SOVEREIGN_SUPABASE_PUBLISHABLE_KEY=publishable_secret_123456789',
    '--set',
    'SOVEREIGN_SUPABASE_SECRET_KEY=server_secret_987654321',
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[redacted\]/);
  assert.doesNotMatch(result.stdout, /publishable_secret_123456789/);
  assert.doesNotMatch(result.stdout, /server_secret_987654321/);
});

test('doctor output redacts secret values in json mode', () => {
  const result = runCli(
    ['doctor', 'supabase', '--json', '--no-network'],
    {
      SOVEREIGN_SUPABASE_URL: 'https://kwrnlkvoqzmaolmwvhse.supabase.co',
      SOVEREIGN_SUPABASE_PUBLISHABLE_KEY: 'publishable_secret_123456789',
      SOVEREIGN_SUPABASE_SECRET_KEY: 'server_secret_987654321',
    }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[redacted\]/);
  assert.doesNotMatch(result.stdout, /publishable_secret_123456789/);
  assert.doesNotMatch(result.stdout, /server_secret_987654321/);
});
