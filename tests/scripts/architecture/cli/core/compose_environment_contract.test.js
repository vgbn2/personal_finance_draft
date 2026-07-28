'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  EXPECTED_COMPOSE_SERVICES,
  loadEnvironmentManifest,
} = require('../../../../../shared/lib/runtime/environment_manifest');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const COMPOSE_PATH = path.join(REPO_ROOT, 'infra', 'docker', 'docker-compose.yml');
const DOCKERFILE_PATH = path.join(REPO_ROOT, 'infra', 'docker', 'Dockerfile');

function composeService(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(
    `^  ${escaped}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`,
    'm',
  ));
  assert.ok(match, `missing Compose service: ${name}`);
  return match[0];
}

test('schema-3 service rows match all seven current Compose identities without changing injection', () => {
  const manifest = loadEnvironmentManifest();
  const compose = fs.readFileSync(COMPOSE_PATH, 'utf8');
  const dockerfile = fs.readFileSync(DOCKERFILE_PATH, 'utf8');
  const commandFragments = {
    web: 'backend/api/app.js',
    bot: 'run bot paper --strategy low_prob_dip',
    backfill: 'backfill-daemon --interval-secs',
    'portfolio-monitor': 'portfolio-monitor --once --json',
    'host-health': 'backend/scripts/ops/host_health.js',
    'host-backup': 'backend/scripts/ops/host_backup.js',
    'polymarket-research': 'polymarket history schedule',
  };

  assert.deepEqual(Object.keys(manifest.compose_services).sort(), [...EXPECTED_COMPOSE_SERVICES]);
  assert.equal((compose.match(/env_file:\s*\*central-env-files/g) || []).length, 7);
  assert.match(compose, /x-central-env-files:\s*&central-env-files/);

  for (const serviceName of EXPECTED_COMPOSE_SERVICES) {
    const row = manifest.compose_services[serviceName];
    const source = composeService(compose, serviceName);
    if (row.compose_profile === null) {
      assert.doesNotMatch(source, /^\s+profiles:/m, serviceName);
      assert.match(dockerfile, new RegExp(commandFragments[serviceName].replace(/\//g, '\\/')));
    } else {
      assert.match(source, new RegExp(`profiles:\\s*\\[\\s*${row.compose_profile}\\s*\\]`), serviceName);
      assert.ok(source.includes(commandFragments[serviceName]), serviceName);
    }
    for (const mount of row.mounts) assert.ok(source.includes(mount), `${serviceName}: ${mount}`);
  }

  assert.match(compose, /LIVE_TRADING:\s*"false"/);
  assert.match(compose, /SOVEREIGN_EXECUTION_AUTHORIZED:\s*"false"/);
  assert.match(composeService(compose, 'backfill'), /NODE_OPTIONS:\s*--max-old-space-size=6144/);
  assert.match(composeService(compose, 'web'), /SOVEREIGN_WEB_HOST:\s*0\.0\.0\.0/);
});

test('service rows keep provider and account authority out of non-writer services', () => {
  const services = loadEnvironmentManifest().compose_services;
  for (const serviceName of ['web', 'host-health', 'host-backup', 'portfolio-monitor']) {
    const keys = [
      ...services[serviceName].required_keys,
      ...services[serviceName].optional_keys,
      ...services[serviceName].defaulted_keys,
    ];
    assert.equal(keys.some((name) => /^(?:ALPACA|FRED|FINNHUB|POLYMARKET)_/.test(name)), false, serviceName);
  }
  assert.ok(services.backfill.optional_keys.includes('FRED_API_KEY'));
  assert.ok(services.backfill.optional_keys.includes('ALPACA_API_KEY'));
  assert.deepEqual(services['polymarket-research'].required_keys, ['POLYMARKET_RESEARCH_SCOPE_FILE']);
});
