'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'infra/docker/docker-compose.yml'), 'utf8');
const line = source.split('\n').find((item) => /^\s+SOVEREIGN_ROUTER_KEY:/.test(item));

test('quant credentials have no default and missing input fails whole Compose interpolation', () => {
  assert.equal(line?.trim(), 'SOVEREIGN_ROUTER_KEY: ${SOVEREIGN_ROUTER_KEY:?SOVEREIGN_ROUTER_KEY is required}');
  const input = `services:\n  quant:\n    image: local-fixture\n    environment:\n${line}\n`;
  for (const supplied of [undefined, '', 'local-test-value']) {
    const env = { ...process.env };
    delete env.SOVEREIGN_ROUTER_KEY;
    if (supplied !== undefined) {
      env.SOVEREIGN_ROUTER_KEY = supplied;
    }
    const result = spawnSync('docker', ['compose', '--env-file', '/dev/null', '-f', '-', 'config', '--quiet'], {
      cwd: '/tmp/opencode',
      encoding: 'utf8',
      input,
      env,
      timeout: 10000,
    });
    assert.ifError(result.error);
    if (supplied) {
      assert.equal(result.status, 0, result.stderr);
    } else {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /SOVEREIGN_ROUTER_KEY is required/);
    }
  }
});
