'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');

test('captured SearXNG startup preserves image/state and publishes IPv4 loopback only', () => {
  const result = spawnSync('docker', [
    'compose',
    '--env-file', '/dev/null',
    '-f', path.join(root, 'infra/docker/searxng/compose.yml'),
    'config', '--no-env-resolution', '--format', 'json',
  ], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: '/tmp/opencode',
      COMPOSE_DISABLE_ENV_FILE: '1',
      SEARXNG_ENV_FILE: '/dev/null',
    },
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'actual SearXNG Compose definition must render');
  const model = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(model.services), ['searxng']);
  const service = model.services.searxng;
  assert.equal(service.container_name, 'sv-searxng');
  assert.equal(service.image, 'searxng/searxng@sha256:a36a9d52d6f9014eb032998e72cb8c82beb6a3f8a17dd05da4bc2e0fcd73bd7f');
  assert.equal(service.pull_policy, 'never');
  assert.equal(service.user, '0');
  assert.equal(service.restart, 'unless-stopped');
  assert.equal(service.network_mode, 'bridge');
  assert.equal(service.environment, undefined);
  assert.equal(service.env_file[0].path, '/dev/null');
  assert.notEqual(service.env_file[0].required, false);
  assert.equal(service.env_file[0].format, 'raw');
  assert.equal(service.ports.length, 1);
  assert.equal(service.ports[0].host_ip, '127.0.0.1');
  assert.equal(service.ports[0].published, '8888');
  assert.equal(service.ports[0].target, 8080);
  assert.equal(service.ports[0].protocol, 'tcp');
  const mounts = service.volumes.map((mount) => [mount.source, mount.target, mount.read_only]);
  assert.deepEqual(mounts, [
    ['search-config', '/etc/searxng', undefined],
    ['search-cache', '/var/cache/searxng', undefined],
  ]);
  assert.deepEqual(model.volumes['search-config'], {
    name: 'a95e0f51192da50204771df5364a36bf570e7e6a0bdd4671c118106e8f94c600',
    external: true,
  });
  assert.deepEqual(model.volumes['search-cache'], {
    name: 'f604a8165306fc84e0832bbe557ed4494746c51ddf0def48590323b91bb11017',
    external: true,
  });
  for (const override of ['entrypoint', 'command', 'healthcheck', 'cap_add', 'cap_drop', 'security_opt', 'read_only', 'tmpfs']) {
    assert.equal(service[override] ?? undefined, undefined, `preserve captured image/runtime default: ${override}`);
  }
});
