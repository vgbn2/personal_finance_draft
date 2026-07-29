'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseEnvFile, validateCentralEnvironment } = require('../../../backend/scripts/ops/central_host_preflight.js');
const {
  buildComposeServiceProjectionReport,
  prepareCentralEnvironment,
} = require('../../../backend/scripts/ops/prepare_central_env.js');
const {
  validateComposeServiceEnvironment,
} = require('../../../shared/lib/runtime/environment_manifest.js');

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
    'POLYMARKET_RESEARCH_SCOPE_FILE=',
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
    'POLYMARKET_RESEARCH_SCOPE_FILE=/app/storage/polymarket/scope.json',
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
  assert.equal(result.compose_contract.ok, true);
  assert.equal(result.service_environments.services.length, 7);
  for (const service of result.service_environments.services) {
    const serviceFile = path.join(root, '.env.services', service.file);
    assert.equal(fs.statSync(serviceFile).mode & 0o777, 0o600);
    const projected = parseEnvFile(serviceFile);
    assert.equal(validateComposeServiceEnvironment(service.service, projected).ok, true);
  }
  assert.equal(
    parseEnvFile(path.join(root, '.env.services', 'web.env')).ALPACA_API_KEY,
    undefined,
  );
  assert.equal(
    parseEnvFile(path.join(root, '.env.services', 'backfill.env')).ALPACA_API_KEY,
    'research-key',
  );
  const monitorEnvironment = parseEnvFile(
    path.join(root, '.env.services', 'portfolio-monitor.env'),
  );
  assert.equal(monitorEnvironment.ALPACA_API_KEY, 'research-key');
  assert.equal(monitorEnvironment.ALPACA_SECRET_KEY, 'research-secret');
  assert.equal(monitorEnvironment.ALPACA_BASE_URL, 'https://paper-api.alpaca.markets');
  assert.equal(monitorEnvironment.SOVEREIGN_TRADE_PIN, undefined);
  assert.equal(monitorEnvironment.POLYMARKET_PRIVATE_KEY, undefined);
  assert.doesNotMatch(JSON.stringify(result), /research-secret|must-not-copy|must-not-reuse/);
});

test('central service projection preview is name-only and closes when required inputs exist', () => {
  const report = buildComposeServiceProjectionReport({
    SOVEREIGN_API_TOKEN: 'api-token',
    SOVEREIGN_CLIENT_TOKEN: 'client-token',
    POLYMARKET_RESEARCH_SCOPE_FILE: '/app/storage/polymarket/scope.json',
    FRED_API_KEY: 'provider-poison',
    POLYMARKET_PRIVATE_KEY: 'execution-poison',
    SOVEREIGN_TRADE_PIN: 'pin-poison',
  });
  assert.equal(report.ok, true);
  assert.equal(report.services.length, 7);
  assert.ok(
    report.services.find((service) => service.service === 'backfill').projected_keys.includes('FRED_API_KEY'),
  );
  assert.equal(
    report.services.find((service) => service.service === 'web').projected_keys.includes('FRED_API_KEY'),
    false,
  );
  assert.doesNotMatch(JSON.stringify(report), /provider-poison|execution-poison|pin-poison/);
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
    'POLYMARKET_RESEARCH_SCOPE_FILE=',
    '',
  ].join('\n'));
  fs.writeFileSync(sourcePath, 'POLYMARKET_RESEARCH_SCOPE_FILE=/app/storage/polymarket/scope.json\n');
  prepareCentralEnvironment({
    repoRoot: root,
    templatePath,
    sourcePath,
    outputPath,
    profile: 'all-in-one',
  });
  assert.equal(parseEnvFile(outputPath).SOVEREIGN_DEPLOYMENT_PROFILE, 'all-in-one');
});
