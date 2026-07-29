'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  EXPECTED_COMPOSE_SERVICES,
  MANIFEST_PATH,
  aliasesForCentralCopy,
  buildChildEnvironment,
  forbiddenEnvironmentNames,
  loadEnvironmentManifest,
  projectEnvironmentForComposeService,
  projectEnvironmentForSurface,
  validateComposeServiceEnvironment,
} = require('../../../../../shared/lib/runtime/environment_manifest');
const {
  checkEnvironmentManifest,
  discoverFrontendSourceNames,
} = require('../../../../../scripts/dev/check_environment_manifest');
const {
  resolveRuntimePolicy,
} = require('../../../../../shared/lib/settings/runtime_policy');

const FRONTEND_NAMES = [
  'VITE_API_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
];

test('environment manifest classifies source and example names without exposing secrets', () => {
  const manifest = loadEnvironmentManifest();
  const check = checkEnvironmentManifest();
  assert.equal(check.ok, true, `unclassified: ${check.unclassified.join(', ')}`);
  assert.equal(manifest.schema_version, 3);
  assert.ok(manifest.entries.length >= 60);
  assert.equal(
    manifest.entries.some((entry) => entry.frontend_exposure && entry.sensitivity !== 'public'),
    false,
  );
  assert.equal(
    manifest.entries.some((entry) => !entry.environment_class || entry.allowed_surfaces.length === 0),
    false,
  );
  assert.equal(
    manifest.entries.some((entry) => (
      entry.environment_class === 'execution'
      && (
        entry.central_copy
        || entry.profiles.includes('central-host')
        || entry.profiles.includes('client')
        || entry.frontend_exposure
      )
    )),
    false,
  );
  assert.deepEqual(check.frontend_names, FRONTEND_NAMES);
  assert.deepEqual(check.frontend_source_names, FRONTEND_NAMES);
  assert.deepEqual(check.frontend_example_names, FRONTEND_NAMES);
  assert.deepEqual(check.forbidden_frontend_names, []);
  assert.deepEqual([...discoverFrontendSourceNames()].sort(), FRONTEND_NAMES);
  assert.deepEqual(aliasesForCentralCopy().ALPACA_SECRET_KEY, [
    'ALPACA_SECRET_KEY',
    'ALPACA_API_SECRET',
  ]);
  assert.deepEqual(aliasesForCentralCopy().ALPACA_PAPER_API_KEY, [
    'ALPACA_PAPER_API_KEY',
  ]);
  assert.equal(aliasesForCentralCopy().ALPACA_LIVE_API_KEY, undefined);
});

test('child environment projection is immutable, frozen, and rejects forbidden overrides', () => {
  const parent = {
    PATH: '/usr/bin',
    HOME: '/tmp/example-home',
    NODE_OPTIONS: '--trace-warnings',
    FRED_API_KEY: 'provider-secret',
    POLYMARKET_PRIVATE_KEY: 'account-secret',
    SOVEREIGN_TRADE_PIN: '123456',
    SOVEREIGN_EXECUTION_AUTHORIZED: 'true',
    UNCLASSIFIED_SENTINEL: 'must-not-pass',
  };
  const before = { ...parent };
  const account = buildChildEnvironment(parent, 'gateway_account', {
    profile: 'developer',
    overrides: { NODE_OPTIONS: '--no-deprecation' },
  });

  assert.equal(Object.isFrozen(account), true);
  assert.equal(account.PATH, '/usr/bin');
  assert.equal(account.HOME, '/tmp/example-home');
  assert.equal(account.NODE_OPTIONS, '--no-deprecation');
  assert.equal(account.POLYMARKET_PRIVATE_KEY, 'account-secret');
  assert.equal(account.FRED_API_KEY, undefined);
  assert.equal(account.SOVEREIGN_TRADE_PIN, undefined);
  assert.equal(account.SOVEREIGN_EXECUTION_AUTHORIZED, undefined);
  assert.equal(account.UNCLASSIFIED_SENTINEL, undefined);
  assert.equal(account.SOVEREIGN_ENVIRONMENT_SURFACE, 'gateway_account');
  assert.deepEqual(parent, before);
  assert.throws(
    () => buildChildEnvironment(parent, 'gateway_account', {
      profile: 'developer',
      overrides: { SOVEREIGN_EXECUTION_AUTHORIZED: 'true' },
    }),
    /environment_override_not_allowed: SOVEREIGN_EXECUTION_AUTHORIZED/,
  );
});

test('execution projection strips mock authentication even from a poisoned parent', () => {
  const parent = {
    PATH: '/usr/bin',
    SOVEREIGN_DEPLOYMENT_PROFILE: 'developer',
    SOVEREIGN_MOCK: 'true',
  };
  const execution = buildChildEnvironment(parent, 'execution', {
    profile: 'developer',
  });

  assert.equal(execution.SOVEREIGN_MOCK, undefined);
  assert.equal(execution.SOVEREIGN_ENVIRONMENT_SURFACE, 'execution');
  assert.throws(
    () => buildChildEnvironment(parent, 'execution', {
      profile: 'developer',
      overrides: { SOVEREIGN_MOCK: 'true' },
    }),
    /environment_override_not_allowed: SOVEREIGN_MOCK/,
  );
});

test('environment manifest rejects schema 2, unknown surfaces, and execution profile bleed', () => {
  const base = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const load = (value) => loadEnvironmentManifest({
    path: '/tmp/environment-manifest-fixture.json',
    readFileSync: () => JSON.stringify(value),
  });

  assert.equal(load(base).schema_version, 3);
  assert.throws(
    () => load({ ...base, schema_version: 2 }),
    /unsupported_environment_manifest/,
  );
  assert.throws(
    () => load({
      ...base,
      groups: [{ ...base.groups[0], allowed_surfaces: ['missing_surface'] }, ...base.groups.slice(1)],
    }),
    /unknown environment surface/,
  );
  assert.throws(
    () => load({
      ...base,
      groups: base.groups.map((group, index) => index === 0
        ? {
          ...group,
          members: group.members.map((member, memberIndex) => memberIndex === 0
            ? {
              ...(typeof member === 'string' ? { name: member } : member),
              environment_class: 'execution',
              profiles: ['central-host'],
              allowed_surfaces: ['execution'],
            }
            : member),
        }
        : group),
    }),
    /execution environment entry crosses a forbidden profile/,
  );
});

test('compose service contract covers exactly seven isolated service surfaces', () => {
  const manifest = loadEnvironmentManifest();
  assert.deepEqual(Object.keys(manifest.compose_services).sort(), [...EXPECTED_COMPOSE_SERVICES]);
  const allEnvironment = Object.fromEntries(manifest.entries.map((entry) => [entry.name, `${entry.name}-value`]));

  for (const serviceName of EXPECTED_COMPOSE_SERVICES) {
    const service = manifest.compose_services[serviceName];
    const projected = projectEnvironmentForComposeService(allEnvironment, serviceName);
    const expectedNames = [
      ...service.required_keys,
      ...service.optional_keys,
      ...service.defaulted_keys,
    ].sort();
    assert.deepEqual(Object.keys(projected).sort(), expectedNames, serviceName);
    assert.equal(validateComposeServiceEnvironment(serviceName, projected).ok, true, serviceName);
    assert.equal(service.fixed_overrides.LIVE_TRADING, 'false');
    assert.equal(service.fixed_overrides.SOVEREIGN_EXECUTION_AUTHORIZED, 'false');
    assert.ok(service.forbidden_environment_classes.includes('execution'));
    assert.equal(projected.SOVEREIGN_TRADE_PIN, undefined);
    assert.equal(projected.POLYMARKET_PRIVATE_KEY, undefined);
  }

  assert.equal(projectEnvironmentForComposeService(allEnvironment, 'web').FRED_API_KEY, undefined);
  assert.equal(projectEnvironmentForComposeService(allEnvironment, 'host-health').ALPACA_API_KEY, undefined);
  const monitorEnvironment = projectEnvironmentForComposeService(allEnvironment, 'portfolio-monitor');
  assert.equal(monitorEnvironment.ALPACA_PAPER_API_KEY, 'ALPACA_PAPER_API_KEY-value');
  assert.equal(monitorEnvironment.ALPACA_PAPER_SECRET_KEY, 'ALPACA_PAPER_SECRET_KEY-value');
  assert.equal(monitorEnvironment.ALPACA_PAPER_BASE_URL, 'ALPACA_PAPER_BASE_URL-value');
  assert.equal(monitorEnvironment.ALPACA_LIVE_API_KEY, undefined);
  assert.equal(monitorEnvironment.ALPACA_LIVE_SECRET_KEY, undefined);
  assert.equal(monitorEnvironment.ALPACA_LIVE_BASE_URL, undefined);
  assert.equal(monitorEnvironment.SOVEREIGN_TRADE_PIN, undefined);
  assert.equal(monitorEnvironment.POLYMARKET_PRIVATE_KEY, undefined);
  const monitorRuntime = {
    ...monitorEnvironment,
    ...manifest.compose_services['portfolio-monitor'].fixed_overrides,
  };
  const poisonedExecutionAttempt = resolveRuntimePolicy({
    env: monitorRuntime,
    args: ['buy', 'AAPL', '1', '--live'],
    broker: 'alpaca',
  });
  assert.equal(poisonedExecutionAttempt.can_execute, false);
  assert.ok(
    poisonedExecutionAttempt.blocking_reasons.includes(
      'profile_cloud-compute_is_permanently_non_executing',
    ),
  );
  assert.equal(projectEnvironmentForComposeService(allEnvironment, 'backfill').FRED_API_KEY, 'FRED_API_KEY-value');
});

test('compose service fixtures fail closed by key name for missing, forbidden, and unknown inputs', () => {
  const manifest = loadEnvironmentManifest();
  for (const serviceName of EXPECTED_COMPOSE_SERVICES) {
    const service = manifest.compose_services[serviceName];
    const valid = Object.fromEntries([
      ...service.required_keys,
      ...service.optional_keys,
      ...service.defaulted_keys,
    ].map((name) => [name, `${name}-value`]));
    for (const missingName of service.required_keys) {
      const missing = { ...valid };
      delete missing[missingName];
      const result = validateComposeServiceEnvironment(serviceName, missing);
      assert.equal(result.ok, false);
      assert.deepEqual(result.missing_required_keys, [missingName]);
    }
    const poisoned = validateComposeServiceEnvironment(serviceName, {
      ...valid,
      SOVEREIGN_TRADE_PIN: 'execution-poison',
    });
    assert.equal(poisoned.ok, false);
    assert.deepEqual(poisoned.forbidden_keys, ['SOVEREIGN_TRADE_PIN']);
    assert.doesNotMatch(JSON.stringify(poisoned), /execution-poison/);
  }

  const unknown = validateComposeServiceEnvironment('web', {
    SOVEREIGN_API_TOKEN: 'token',
    SOVEREIGN_CLIENT_TOKEN: 'client',
    UNKNOWN_SERVICE_KEY: 'unknown-poison',
  });
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.unknown_keys, ['UNKNOWN_SERVICE_KEY']);
  assert.doesNotMatch(JSON.stringify(unknown), /unknown-poison/);
  assert.throws(() => validateComposeServiceEnvironment('missing', {}), /unknown compose service/);
});

test('schema-3 compose rows reject unknown services, keys, surfaces, profiles, and unsafe overrides', () => {
  const base = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const load = (value) => loadEnvironmentManifest({
    path: '/tmp/environment-manifest-compose-fixture.json',
    readFileSync: () => JSON.stringify(value),
  });
  assert.throws(
    () => load({
      ...base,
      compose_services: { ...base.compose_services, unknown: base.compose_services.web },
    }),
    /invalid compose service inventory/,
  );
  assert.throws(
    () => load({
      ...base,
      compose_services: {
        ...base.compose_services,
        web: {
          ...base.compose_services.web,
          optional_keys: [...base.compose_services.web.optional_keys, 'UNKNOWN_COMPOSE_KEY'],
        },
      },
    }),
    /unknown compose environment key: UNKNOWN_COMPOSE_KEY/,
  );
  assert.throws(
    () => load({
      ...base,
      compose_services: {
        ...base.compose_services,
        web: { ...base.compose_services.web, surface: 'missing_surface' },
      },
    }),
    /invalid compose service surface: web/,
  );
  assert.throws(
    () => load({
      ...base,
      compose_services: {
        ...base.compose_services,
        web: { ...base.compose_services.web, profile: 'missing-profile' },
      },
    }),
    /invalid compose service profile: web/,
  );
  assert.throws(
    () => load({
      ...base,
      compose_services: {
        ...base.compose_services,
        web: {
          ...base.compose_services.web,
          fixed_overrides: { ...base.compose_services.web.fixed_overrides, LIVE_TRADING: 'true' },
        },
      },
    }),
    /unsafe compose fixed override: LIVE_TRADING/,
  );
});

test('environment projection strips known forbidden names without copying server aliases into browser input', () => {
  const environment = {
    PATH: '/usr/bin',
    VITE_API_URL: 'http://127.0.0.1:8787',
    VITE_SUPABASE_URL: 'https://example.invalid',
    VITE_SUPABASE_ANON_KEY: 'public-placeholder',
    SOVEREIGN_SUPABASE_URL: 'https://server.example.invalid',
    SOVEREIGN_API_TOKEN: 'server-token-placeholder',
    FRED_API_KEY: 'provider-placeholder',
    POLYMARKET_PRIVATE_KEY: 'execution-placeholder',
    SOVEREIGN_EXECUTION_AUTHORIZED: 'true',
    UNCLASSIFIED_SENTINEL: 'unknown-placeholder',
  };

  assert.deepEqual(projectEnvironmentForSurface(environment, 'public_client', { profile: 'client' }), {
    VITE_API_URL: 'http://127.0.0.1:8787',
    VITE_SUPABASE_URL: 'https://example.invalid',
    VITE_SUPABASE_ANON_KEY: 'public-placeholder',
  });
  const cli = projectEnvironmentForSurface(environment, 'default_cli', { profile: 'developer' });
  assert.equal(cli.FRED_API_KEY, 'provider-placeholder');
  assert.equal(cli.POLYMARKET_PRIVATE_KEY, undefined);
  assert.equal(cli.SOVEREIGN_EXECUTION_AUTHORIZED, undefined);
  assert.equal(cli.UNCLASSIFIED_SENTINEL, undefined);
  assert.deepEqual(
    forbiddenEnvironmentNames(environment, 'default_cli', { profile: 'developer' }),
    ['POLYMARKET_PRIVATE_KEY', 'SOVEREIGN_API_TOKEN', 'SOVEREIGN_EXECUTION_AUTHORIZED'],
  );
});
