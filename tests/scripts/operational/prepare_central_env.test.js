'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseEnvFile, validateCentralEnvironment } = require('../../../backend/scripts/ops/central_host_preflight.js');
const { prepareCentralEnvironment } = require('../../../backend/scripts/ops/prepare_central_env.js');

test('central environment preparation copies only approved research settings and generates an isolated token', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-prepare-central-env-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const templatePath = path.join(root, '.env.central.example');
  const sourcePath = path.join(root, '.env');
  const outputPath = path.join(root, '.env.central');
  fs.writeFileSync(templatePath, [
    'SOVEREIGN_DEPLOYMENT_PROFILE=central-host',
    'SOVEREIGN_RUNTIME_MODE=cloud-compute',
    'LIVE_TRADING=false',
    'SOVEREIGN_EXECUTION_AUTHORIZED=false',
    'SOVEREIGN_API_TOKEN=',
    'SOVEREIGN_CLIENT_TOKEN=',
    'SOVEREIGN_WEB_BIND=127.0.0.1',
    'SOVEREIGN_DEFAULT_USER_ROLE=viewer',
    'SOVEREIGN_USER_ROLE_MAP={}',
    'SOVEREIGN_AUTH_SESSION_TRACKING=true',
    'SOVEREIGN_IP_CHANGE_POLICY=audit',
    'SOVEREIGN_TRUST_PROXY=false',
    'BACKFILL_INTERVAL_SECS=1800',
    'ALPACA_API_KEY=',
    'ALPACA_SECRET_KEY=',
    'ALPACA_BASE_URL=https://paper-api.alpaca.markets',
    'FINNHUB_API_KEY=',
    'TWELVE_DATA_API_KEY=',
    'SOVEREIGN_SUPABASE_SECRET_KEY=',
    '',
  ].join('\n'));
  fs.writeFileSync(sourcePath, [
    'ALPACA_API_KEY=research-key',
    'ALPACA_API_SECRET=research-secret',
    'ALPACA_URL=https://live-api.example.invalid',
    'FINHUB_API_KEY=finnhub-alias',
    'TWELVE_API_KEY=twelve-alias',
    'SOVEREIGN_SUPABASE_SECRET_KEY="value with spaces"',
    'SOVEREIGN_API_TOKEN=must-not-reuse',
    'SOVEREIGN_TRADE_PIN=must-not-copy',
    'POLYMARKET_PRIVATE_KEY=must-not-copy',
    '',
  ].join('\n'));

  const result = prepareCentralEnvironment({ repoRoot: root, templatePath, sourcePath, outputPath });
  const prepared = parseEnvFile(outputPath);
  assert.equal(result.execution_credentials_copied, false);
  assert.deepEqual(result.copied_keys, [
    'ALPACA_API_KEY',
    'ALPACA_SECRET_KEY',
    'FINNHUB_API_KEY',
    'SOVEREIGN_SUPABASE_SECRET_KEY',
    'TWELVE_DATA_API_KEY',
  ]);
  assert.equal(prepared.ALPACA_SECRET_KEY, 'research-secret');
  assert.equal(prepared.ALPACA_BASE_URL, 'https://paper-api.alpaca.markets');
  assert.equal(prepared.FINNHUB_API_KEY, 'finnhub-alias');
  assert.equal(prepared.TWELVE_DATA_API_KEY, 'twelve-alias');
  assert.equal(prepared.SOVEREIGN_API_TOKEN.length, 64);
  assert.equal(prepared.SOVEREIGN_CLIENT_TOKEN.length, 64);
  assert.equal(prepared.SOVEREIGN_DEPLOYMENT_PROFILE, 'central-host');
  assert.notEqual(prepared.SOVEREIGN_CLIENT_TOKEN, prepared.SOVEREIGN_API_TOKEN);
  assert.notEqual(prepared.SOVEREIGN_API_TOKEN, 'must-not-reuse');
  assert.equal(prepared.SOVEREIGN_TRADE_PIN, undefined);
  assert.equal(prepared.POLYMARKET_PRIVATE_KEY, undefined);
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
  assert.equal(validateCentralEnvironment(prepared).ok, true);
  assert.doesNotMatch(JSON.stringify(result), /research-secret|must-not-copy|must-not-reuse/);
});

test('central environment preparation refuses an existing destination unless force is explicit', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-prepare-central-env-existing-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.env.central.example'), 'SOVEREIGN_API_TOKEN=\nSOVEREIGN_CLIENT_TOKEN=\n');
  fs.writeFileSync(path.join(root, '.env'), 'FRED_API_KEY=test\n');
  fs.writeFileSync(path.join(root, '.env.central'), 'preserve=true\n');
  assert.throws(() => prepareCentralEnvironment({ repoRoot: root }), /refusing to overwrite/);
  assert.equal(fs.readFileSync(path.join(root, '.env.central'), 'utf8'), 'preserve=true\n');
});

test('central environment preparation can render the explicit all-in-one rehearsal profile', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-prepare-all-in-one-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const templatePath = path.join(root, '.env.central.example');
  const sourcePath = path.join(root, '.env');
  const outputPath = path.join(root, '.env.central');
  fs.writeFileSync(templatePath, [
    'SOVEREIGN_DEPLOYMENT_PROFILE=central-host',
    'SOVEREIGN_API_TOKEN=',
    'SOVEREIGN_CLIENT_TOKEN=',
    '',
  ].join('\n'));
  fs.writeFileSync(sourcePath, '');
  prepareCentralEnvironment({
    repoRoot: root,
    templatePath,
    sourcePath,
    outputPath,
    profile: 'all-in-one',
  });
  assert.equal(parseEnvFile(outputPath).SOVEREIGN_DEPLOYMENT_PROFILE, 'all-in-one');
});
