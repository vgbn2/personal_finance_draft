'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const composePath = path.join(root, 'infra/docker/docker-compose.yml');

function cleanEnvironment(supplied) {
  const env = {
    PATH: process.env.PATH,
    HOME: '/tmp/opencode',
    COMPOSE_DISABLE_ENV_FILE: '1',
  };
  if (supplied !== undefined) {
    env.SOVEREIGN_ROUTER_KEY = supplied;
  }
  return env;
}

function renderCompose(supplied, profile) {
  const args = [
    'compose',
    '--env-file', '/dev/null',
    '--project-directory', root,
    '-f', composePath,
  ];
  if (profile) {
    args.push('--profile', profile);
    if (profile === 'monitoring') {
      args.push('--profile', 'writer');
    }
  }
  args.push('config', '--no-env-resolution', '--format', 'json');
  const result = spawnSync('docker', args, {
    cwd: '/tmp/opencode',
    encoding: 'utf8',
    env: cleanEnvironment(supplied),
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'keyless Compose rendering must preserve unrelated profiles');
  return JSON.parse(result.stdout);
}

test('quant key projection has no credential default and preserves unrelated profiles', () => {
  const source = fs.readFileSync(composePath, 'utf8');
  const line = source.split('\n').find((item) => /^\s+SOVEREIGN_ROUTER_KEY:/.test(item));
  assert.equal(line?.trim(), 'SOVEREIGN_ROUTER_KEY: ${SOVEREIGN_ROUTER_KEY:-}');

  for (const supplied of [undefined, '', 'local-test-value']) {
    for (const profile of [undefined, 'writer', 'paper', 'monitoring']) {
      const model = renderCompose(supplied, profile);
      assert.ok(model.services.web);
      assert.equal(model.services.quant, undefined);
    }
  }
});

test('actual rendered quant shell rejects absent/empty keys before Node and accepts supplied input', () => {
  const model = renderCompose('local-test-value', 'quant');
  const renderedCommand = model.services.quant.command;
  assert.match(renderedCommand[2], /^: "\$\$\{SOVEREIGN_ROUTER_KEY:\?/);
  // Compose keeps doubled dollars in config JSON and unescapes them for container execution.
  const command = renderedCommand.map((argument) => argument.replaceAll('$$', '$'));
  assert.deepEqual(command.slice(0, 2), ['/bin/sh', '-c']);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'quant-startup-'));
  const marker = path.join(scratch, 'node-dispatch');
  try {
    // Stop the existing loop at its first Node dispatch, without executing research or AI.
    fs.writeFileSync(path.join(scratch, 'node'), [
      '#!/bin/sh',
      'printf "%s\\n" "$@" > "$QUANT_TEST_MARKER"',
      'kill -TERM "$PPID"',
      '',
    ].join('\n'), { mode: 0o700 });

    for (const supplied of [undefined, '', 'local-test-value']) {
      fs.rmSync(marker, { force: true });
      const result = spawnSync(command[0], command.slice(1), {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...cleanEnvironment(supplied),
          PATH: `${scratch}:${process.env.PATH}`,
          QUANT_TEST_MARKER: marker,
        },
        timeout: 3000,
      });
      assert.ifError(result.error);
      if (supplied) {
        assert.equal(result.signal, 'SIGTERM');
        assert.equal(fs.readFileSync(marker, 'utf8'), 'tools/agent/quant_research_harness.js\n--once\n');
        assert.equal(model.services.quant.environment.SOVEREIGN_ROUTER_KEY, supplied);
      } else {
        assert.notEqual(result.status, 0);
        assert.equal(fs.existsSync(marker), false);
        assert.match(result.stderr, /SOVEREIGN_ROUTER_KEY is required/);
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
