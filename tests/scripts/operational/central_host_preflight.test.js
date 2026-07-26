'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  architectureCheck,
  isPrivateBind,
  loadCentralEnvironment,
  memoryCheck,
  probeCentralHost,
  validateAccessRoleConfiguration,
  validateCentralEnvironment,
} = require('../../../backend/scripts/ops/central_host_preflight.js');

const SAFE_ENV = {
  SOVEREIGN_DEPLOYMENT_PROFILE: 'central-host',
  SOVEREIGN_RUNTIME_MODE: 'cloud-compute',
  LIVE_TRADING: 'false',
  SOVEREIGN_EXECUTION_AUTHORIZED: 'false',
  SOVEREIGN_API_TOKEN: 'a'.repeat(32),
  SOVEREIGN_CLIENT_TOKEN: 'b'.repeat(32),
  SOVEREIGN_WEB_BIND: '127.0.0.1',
  SOVEREIGN_DEFAULT_USER_ROLE: 'viewer',
  SOVEREIGN_USER_ROLE_MAP: '{}',
  SOVEREIGN_AUTH_SESSION_TRACKING: 'true',
  SOVEREIGN_IP_CHANGE_POLICY: 'audit',
  SOVEREIGN_TRUST_PROXY: 'false',
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
  assert.equal(validateCentralEnvironment({
    ...SAFE_ENV,
    SOVEREIGN_DEPLOYMENT_PROFILE: 'client',
  }).checks.deployment_profile.ok, false);
  assert.equal(validateCentralEnvironment({
    ...SAFE_ENV,
    SOVEREIGN_AUTH_SESSION_TRACKING: 'false',
  }).checks.auth_session_tracking.ok, false);
  assert.equal(validateCentralEnvironment({
    ...SAFE_ENV,
    SOVEREIGN_IP_CHANGE_POLICY: 'block-forever',
  }).checks.ip_change_policy.ok, false);
  assert.equal(validateCentralEnvironment({
    ...SAFE_ENV,
    SOVEREIGN_TRUST_PROXY: 'true',
  }).checks.untrusted_forwarded_headers.ok, false);
  assert.equal(validateCentralEnvironment({ ...SAFE_ENV, LIVE_TRADING: 'true' }).checks.live_trading_disabled.ok, false);
  assert.equal(validateCentralEnvironment({ ...SAFE_ENV, SOVEREIGN_WEB_BIND: '0.0.0.0' }).checks.private_bind.ok, false);
  assert.equal(validateCentralEnvironment({ ...SAFE_ENV, SOVEREIGN_API_TOKEN: 'short' }).checks.api_token.ok, false);
  assert.equal(validateCentralEnvironment({ ...SAFE_ENV, SOVEREIGN_CLIENT_TOKEN: 'short' }).checks.client_token.ok, false);
  assert.equal(validateCentralEnvironment({
    ...SAFE_ENV,
    SOVEREIGN_CLIENT_TOKEN: SAFE_ENV.SOVEREIGN_API_TOKEN,
  }).checks.client_token.ok, false);
  const secretResult = validateCentralEnvironment({ ...SAFE_ENV, POLYMARKET_PRIVATE_KEY: 'must-not-print' });
  assert.equal(secretResult.checks.no_execution_secrets.ok, false);
  assert.deepEqual(secretResult.checks.no_execution_secrets.present_keys, ['POLYMARKET_PRIVATE_KEY']);
  assert.doesNotMatch(JSON.stringify(secretResult), /must-not-print/);
});

test('access-role configuration accepts trusted mappings and rejects malformed or service roles', () => {
  assert.deepEqual(validateAccessRoleConfiguration({
    SOVEREIGN_DEFAULT_USER_ROLE: 'viewer',
    SOVEREIGN_USER_ROLE_MAP: '{"user-1":"owner","user-2":"analyst"}',
  }), {
    ok: true,
    default_role: 'viewer',
    role_map_valid: true,
    role_map_entries: 2,
    invalid_entry_ids: [],
  });
  assert.equal(validateAccessRoleConfiguration({
    SOVEREIGN_DEFAULT_USER_ROLE: 'service',
    SOVEREIGN_USER_ROLE_MAP: '{}',
  }).ok, false);
  assert.equal(validateAccessRoleConfiguration({
    SOVEREIGN_DEFAULT_USER_ROLE: 'viewer',
    SOVEREIGN_USER_ROLE_MAP: '{"user-1":"service"}',
  }).ok, false);
  assert.equal(validateAccessRoleConfiguration({
    SOVEREIGN_DEFAULT_USER_ROLE: 'viewer',
    SOVEREIGN_USER_ROLE_MAP: '{broken',
  }).role_map_valid, false);
});

test('central environment loader reads only the selected file plus explicit process overrides', () => {
  const { root, envPath } = tempHost();
  try {
    fs.writeFileSync(path.join(root, '.env'), 'POLYMARKET_PRIVATE_KEY=must-not-bleed\n');
    fs.writeFileSync(envPath, [
      'SOVEREIGN_RUNTIME_MODE=cloud-compute',
      'SOVEREIGN_DEPLOYMENT_PROFILE=central-host',
      'LIVE_TRADING=false',
      'SOVEREIGN_EXECUTION_AUTHORIZED=false',
      `SOVEREIGN_API_TOKEN=${'b'.repeat(32)}`,
      `SOVEREIGN_CLIENT_TOKEN=${'c'.repeat(32)}`,
      'SOVEREIGN_WEB_BIND=127.0.0.1',
      'SOVEREIGN_DEFAULT_USER_ROLE=viewer',
      'SOVEREIGN_USER_ROLE_MAP={}',
      'SOVEREIGN_AUTH_SESSION_TRACKING=true',
      'SOVEREIGN_IP_CHANGE_POLICY=audit',
      'SOVEREIGN_TRUST_PROXY=false',
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

test('central host hardware requires x64 and an 8 GiB-class memory module', () => {
  assert.equal(architectureCheck('x64').ok, true);
  assert.equal(architectureCheck('arm64').ok, false);
  assert.equal(memoryCheck(8 * 1024 ** 3).ok, true);
  const undersized = memoryCheck(4 * 1024 ** 3);
  assert.equal(undersized.ok, false);
  assert.equal(undersized.reason, 'memory_below_full_universe_floor');
  assert.equal(undersized.minimum_installed_gib, 8);
  assert.equal(undersized.recommended_installed_gib, 16);
});

test('central host preflight reports clean tools, private env, hardware, manifest, and disk without secret values', () => {
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
      architecture: 'x64',
      totalMemoryBytes: 8 * 1024 ** 3,
    });
    assert.equal(result.ok, true);
    assert.equal(result.checks.git_clean.dirty_entry_count, 0);
    assert.equal(result.checks.env_file.reason, 'owner_only');
    assert.equal(result.checks.docker_compose.ok, true);
    assert.equal(result.checks.docker_daemon.ok, true);
    assert.equal(result.checks.architecture.ok, true);
    assert.equal(result.checks.memory.ok, true);
    assert.ok(invocations.some((args) => args.join(' ') === 'docker compose version'));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(SAFE_ENV.SOVEREIGN_API_TOKEN));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(SAFE_ENV.SOVEREIGN_CLIENT_TOKEN));
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
      architecture: 'x64',
      totalMemoryBytes: 8 * 1024 ** 3,
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

test('central host preflight fails closed on arm64 or insufficient RAM', () => {
  const { root, envPath } = tempHost();
  const run = (command) => (
    command === 'git'
      ? { status: 0, stdout: '', stderr: '' }
      : { status: 0, stdout: 'available', stderr: '' }
  );
  try {
    const result = probeCentralHost({
      repoRoot: root,
      env: { ...SAFE_ENV, SOVEREIGN_ENV_FILE: envPath },
      run,
      minFreeBytes: 0,
      architecture: 'arm64',
      totalMemoryBytes: 4 * 1024 ** 3,
    });
    assert.equal(result.ok, false);
    assert.equal(result.checks.architecture.reason, 'onnx_runtime_image_architecture_unsupported');
    assert.equal(result.checks.memory.reason, 'memory_below_full_universe_floor');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
