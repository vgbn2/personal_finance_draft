const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const CLI_PATH = path.resolve(__dirname, '..', '..', '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.resolve(__dirname, '..', '..', '..', '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function stripSecretEnv(source) {
  const env = { ...source, SOVEREIGN_SKIP_DOTENV: '1' };
  for (const key of [
    'ALPACA_API_KEY',
    'ALPACA_API_SECRET',
    'ALPACA_SECRET_KEY',
    'ALPACA_BASE_URL',
    'ALPACA_LIVE_API_KEY',
    'ALPACA_LIVE_SECRET_KEY',
    'ALPACA_LIVE_BASE_URL',
    'ALPACA_PAPER_API_KEY',
    'ALPACA_PAPER_SECRET_KEY',
    'ALPACA_PAPER_BASE_URL',
    'GATEIO_API_KEY',
    'GATEIO_API_SECRET',
    'GATEIO_API_PASSPHRASE',
    'GATEIO_BASE_URL',
    'MT5_TERMINAL_ID',
    'MT5_METAEDITOR_PATH',
    'HEADWAY_MT5_QUOTES_PATH',
    'SOVEREIGN_HEADWAY_MT5_QUOTES_PATH',
    'POLYMARKET_PRIVATE_KEY',
    'POLYMARKET_API_KEY',
    'POLYMARKET_API_SECRET',
    'POLYMARKET_API_PASSPHRASE',
    'POLYMARKET_FUNDER_ADDRESS',
    'POLYMARKET_WALLET_ADDRESS',
    'POLYMARKET_SIGNATURE_TYPE',
    'POLYMARKET_CLOB_HOST',
    'SOVEREIGN_SUPABASE_URL',
    'SOVEREIGN_SUPABASE_PUBLISHABLE_KEY',
    'SOVEREIGN_SUPABASE_SECRET_KEY',
    'SOVEREIGN_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
  ]) {
    delete env[key];
  }
  return env;
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

test('doctor reports missing broker fields when no local dotenv is loaded', () => {
  const result = runCli(['doctor', 'alpaca', '--json', '--no-network'], stripSecretEnv(process.env));

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.brokers[0].broker, 'alpaca');
  assert.match(JSON.stringify(payload), /ALPACA_PAPER_API_KEY/);
  assert.match(JSON.stringify(payload), /ALPACA_PAPER_SECRET_KEY/);
});

test('setup writes broker secrets to a caller-specified local env file without printing them', () => {
  const envPath = path.join(os.tmpdir(), `sovereign-alpaca-${Date.now()}.env`);
  try {
    const result = runCli([
      'setup',
      'alpaca',
      '--env-path',
      envPath,
      '--json',
      '--set',
      'ALPACA_PAPER_API_KEY=alpaca_key_123456789',
      '--set',
      'ALPACA_PAPER_SECRET_KEY=alpaca_secret_987654321',
    ], { SOVEREIGN_SKIP_DOTENV: '1' });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /\[redacted\]/);
    assert.doesNotMatch(result.stdout, /alpaca_key_123456789/);
    assert.doesNotMatch(result.stdout, /alpaca_secret_987654321/);
    assert.equal(fs.existsSync(envPath), true);
    const contents = fs.readFileSync(envPath, 'utf8');
    assert.match(contents, /ALPACA_PAPER_API_KEY=alpaca_key_123456789/);
    assert.match(contents, /ALPACA_PAPER_SECRET_KEY=alpaca_secret_987654321/);
    assert.match(contents, /ALPACA_PAPER_BASE_URL=https:\/\/paper-api\.alpaca\.markets/);
  } finally {
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
  }
});

test('setup writes polymarket secrets to a caller-specified local env file without printing them', () => {
  const envPath = path.join(os.tmpdir(), `sovereign-polymarket-${Date.now()}.env`);
  try {
    const result = runCli([
      'setup',
      'polymarket',
      '--env-path',
      envPath,
      '--json',
      '--set',
      'POLYMARKET_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111',
    ], { SOVEREIGN_SKIP_DOTENV: '1' });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /\[redacted\]/);
    assert.doesNotMatch(result.stdout, /0x1111111111111111111111111111111111111111111111111111111111111111/);
    assert.equal(fs.existsSync(envPath), true);
    const contents = fs.readFileSync(envPath, 'utf8');
    assert.match(contents, /POLYMARKET_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111/);
  } finally {
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
  }
});
