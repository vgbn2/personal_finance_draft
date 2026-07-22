'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isPrivateBind,
  loadCentralEnvironment,
  probeCentralHost,
  validateCentralEnvironment,
} = require('../../../backend/scripts/ops/central_host_preflight.js');

const SAFE_ENV = {
  SOVEREIGN_RUNTIME_MODE: 'cloud-compute',
  LIVE_TRADING: 'false',
  SOVEREIGN_EXECUTION_AUTHORIZED: 'false',
  SOVEREIGN_API_TOKEN: 'a'.repeat(32),
  SOVEREIGN_WEB_BIND: '127.0.0.1',
  BACKFILL_INTERVAL_SECS: '1800',
};

function tempHost() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-central-preflight-'));
  fs.mkdirSync(path.join(root, 'infra', 'docker'), { recursive: true });
  fs.mkdirSync(path.join(root, 'storage'), { recursive: true });
  fs.writeFileSync(path.join(root, 'infra', 'docker', 'docker-compose.yml'), 'services: {}\n');
  const envPath = path.join(root, '.env.central');
  fs.writeFileSync(envPath, 'SOVEREIGN_RUNTIME_MODE=cloud-compute\n', { mode: 0o600 });
  return { root, envPath };
}

test('private bind policy accepts loopback, RFC1918, and private VPN ranges only', () => {
  for (const bind of ['127.0.0.1', 'localhost', '::1', '10.2.3.4', '172.16.0.1', '172.31.255.2', '192.168.1.2', '100.64.0.1', '100.127.2.3', 'fd12::1']) {
    assert.equal(isPrivateBind(bind), true, `${bind} should be private`);
  }
  for (const bind of ['0.0.0.0', '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.0.1', '10.999.2.3', 'fd::::1', 'example.com', '']) {
    assert.equal(isPrivateBind(bind), false, `${bind || '<blank>'} should be rejected`);
  }
});

test('central environment fails closed on live mode, public bind, short token, or execution secrets', () => {
  assert.equal(validateCentralEnvironment(SAFE_ENV).ok, true);
  assert.equal(validateCentralEnvironment({ ...SAFE_ENV, LIVE_TRADING: 'true' }).checks.live_trading_disabled.ok, false);
  assert.equal(validateCentralEnvironment({ ...SAFE_ENV, SOVEREIGN_WEB_BIND: '0.0.0.0' }).checks.private_bind.ok, false);
  assert.equal(validateCentralEnvironment({ ...SAFE_ENV, SOVEREIGN_API_TOKEN: 'short' }).checks.api_token.ok, false);
  const secretResult = validateCentralEnvironment({ ...SAFE_ENV, POLYMARKET_PRIVATE_KEY: 'must-not-print' });
  assert.equal(secretResult.checks.no_execution_secrets.ok, false);
  assert.deepEqual(secretResult.checks.no_execution_secrets.present_keys, ['POLYMARKET_PRIVATE_KEY']);
  assert.doesNotMatch(JSON.stringify(secretResult), /must-not-print/);
});

test('central environment loader reads only the selected file plus explicit process overrides', () => {
  const { root, envPath } = tempHost();
  try {
    fs.writeFileSync(path.join(root, '.env'), 'POLYMARKET_PRIVATE_KEY=must-not-bleed\n');
    fs.writeFileSync(envPath, [
      'SOVEREIGN_RUNTIME_MODE=cloud-compute',
      'LIVE_TRADING=false',
      'SOVEREIGN_EXECUTION_AUTHORIZED=false',
      `SOVEREIGN_API_TOKEN=${'b'.repeat(32)}`,
      'SOVEREIGN_WEB_BIND=127.0.0.1',
      'BACKFILL_INTERVAL_SECS=1800',
      '',
    ].join('\n'), { mode: 0o600 });
    const env = loadCentralEnvironment({
      SOVEREIGN_ENV_FILE: envPath,
      BACKFILL_INTERVAL_SECS: '3600',
    }, root);
    assert.equal(env.BACKFILL_INTERVAL_SECS, '3600', 'explicit process values override the selected file');
    assert.equal(env.POLYMARKET_PRIVATE_KEY, undefined, 'the adjacent general .env is never loaded');
    assert.equal(validateCentralEnvironment(env).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('central host preflight reports clean tools, private env, manifest, and disk without secret values', () => {
  const { root, envPath } = tempHost();
  const invocations = [];
  const run = (command, args) => {
    invocations.push([command, ...args]);
    if (command === 'git') return { status: 0, stdout: '', stderr: '' };
    return { status: 0, stdout: 'available', stderr: '' };
  };
  try {
    const result = probeCentralHost({
      repoRoot: root,
      env: { ...SAFE_ENV, SOVEREIGN_ENV_FILE: envPath },
      run,
      minFreeBytes: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.checks.git_clean.dirty_entry_count, 0);
    assert.equal(result.checks.env_file.reason, 'owner_only');
    assert.equal(result.checks.docker_compose.ok, true);
    assert.equal(result.checks.docker_daemon.ok, true);
    assert.ok(invocations.some((args) => args.join(' ') === 'docker compose version'));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(SAFE_ENV.SOVEREIGN_API_TOKEN));
    console.log(JSON.stringify({
      type: result.type,
      checks: Object.keys(result.checks).length,
      dirty_entries: result.checks.git_clean.dirty_entry_count,
      private_bind: result.checks.environment.checks.private_bind.bind,
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('central host preflight exposes dirty Git and missing Docker as blockers', () => {
  const { root, envPath } = tempHost();
  const run = (command, args) => {
    if (command === 'git') return { status: 0, stdout: ' M package.json\n', stderr: '' };
    if (command === 'docker') return { status: 1, stdout: '', stderr: 'unavailable' };
    return { status: 0, stdout: 'available', stderr: '' };
  };
  try {
    const result = probeCentralHost({
      repoRoot: root,
      env: { ...SAFE_ENV, SOVEREIGN_ENV_FILE: envPath },
      run,
      minFreeBytes: 0,
    });
    assert.equal(result.ok, false);
    assert.equal(result.checks.git_clean.reason, 'dirty');
    assert.equal(result.checks.git_clean.dirty_entry_count, 1);
    assert.equal(result.checks.docker_compose.reason, 'unavailable');
    assert.equal(result.checks.docker_daemon.reason, 'unavailable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
