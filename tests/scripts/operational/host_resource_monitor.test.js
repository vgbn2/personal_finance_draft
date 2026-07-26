'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MONITOR = path.join(REPO_ROOT, 'backend', 'scripts', 'ops', 'host_resource_monitor.sh');

test('host resource monitor exposes safe foreground options', () => {
  const result = spawnSync('bash', [MONITOR, '--help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /foreground-only/);
  assert.match(result.stdout, /--once/);
  assert.match(result.stdout, /--containers/);
  assert.match(result.stdout, /Ctrl\+C/);
});

test('host resource monitor produces one bounded snapshot without a service', () => {
  const result = spawnSync('bash', [
    MONITOR,
    '--once',
    '--no-clear',
    '--top',
    '2',
    '--filter',
    'node|sovereign',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /Sovereign Host Resource Monitor/);
  assert.match(result.stdout, /CPU: [0-9]+[.][0-9]+%/);
  assert.match(result.stdout, /\nMemory\n/);
  assert.match(result.stdout, /\nGPU\n/);
  assert.match(result.stdout, /\nTop processes/);
  assert.match(result.stdout, /\nRelevant applications/);
  assert.match(result.stdout, /Refresh: 2s  Stop: Ctrl\+C/);
});

test('host resource monitor rejects invalid intervals', () => {
  const result = spawnSync('bash', [MONITOR, '--interval', '0'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /positive number/);
});
