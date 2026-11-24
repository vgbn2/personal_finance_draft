'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const scriptPath = path.join(root, 'tools/operational/searxng_private_cutover.sh');

test('searxng_private_cutover.sh exists and passes bash syntax validation', () => {
  assert.ok(fs.existsSync(scriptPath), 'cutover script must exist');
  const res = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
  assert.equal(res.status, 0, 'script must pass bash -n');
});

test('searxng_private_cutover.sh fails closed when SEARXNG_ENV_FILE is missing', () => {
  const res = spawnSync('bash', [scriptPath, 'preflight'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /SEARXNG_ENV_FILE is not set/);
});

test('searxng_private_cutover.sh blocks cutover when consumers are unconfirmed (exit 2)', () => {
  const dummyEnv = '/dev/null';
  const res = spawnSync('bash', [scriptPath, 'preflight'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SEARXNG_ENV_FILE: dummyEnv,
    },
  });
  assert.equal(res.status, 2, 'unconfirmed consumer route must exit with block code 2');
  assert.match(res.stderr, /BLOCK: Standalone LAN clients and container bridge consumers are not authoritatively identified/);
});

test('searxng_private_cutover.sh passes preflight when consumers are qualified', () => {
  const dummyEnv = '/dev/null';
  const res = spawnSync('bash', [scriptPath, 'preflight'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SEARXNG_ENV_FILE: dummyEnv,
      SEARXNG_CONSUMER_ROUTE_CONFIRMED: '1',
    },
  });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /Preflight passed/);
});

test('searxng_private_cutover.sh script enforces volume inventory and numeric-owner tarball flags', () => {
  const src = fs.readFileSync(scriptPath, 'utf8');
  assert.ok(src.includes('tar --numeric-owner -cpf'), 'must archive with --numeric-owner');
  assert.ok(src.includes('tar --numeric-owner -xpf'), 'must restore with --numeric-owner');
  assert.ok(src.includes('-mindepth 1 -delete'), 'must clean candidate state before restore');
});
