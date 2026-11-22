'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');

test('root CLI dispatches real help outside the repository working directory', () => {
  const result = spawnSync(path.join(root, 'sv'), ['--help'], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      SOVEREIGN_SKIP_DOTENV: 'true',
      SOVEREIGN_SKIP_LOCAL_ENV: 'true',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sovereign/i);
});

test('required orchestration shims reference existing canonical owners', () => {
  const scripts = [
    'sv',
    'sv.ps1',
    'start_local.sh',
    'start_local.ps1',
    'backend/scripts/data_ops/reset_portfolio.sh',
    'backend/scripts/data_ops/backtest_batch.sh',
  ];
  for (const script of scripts) {
    const text = fs.readFileSync(path.join(root, script), 'utf8');
    assert.doesNotMatch(text, /backend[/\\](?:cli|gateway)[/\\]/, script);
    assert.match(text, /frontend[/\\]cli-tui[/\\]sovereign_cli\.js/, script);
  }
  assert.ok(fs.existsSync(path.join(root, 'frontend/cli-tui/sovereign_cli.js')));
  assert.ok(fs.existsSync(path.join(root, 'backend/execution/src/index.ts')));
});

test('Make native targets share their build directory and reject zero tests', () => {
  for (const target of ['build-core', 'test']) {
    const result = spawnSync('make', ['-n', target, 'CORE_BUILD_DIR=/tmp/opencode/native-check'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\/tmp\/opencode\/native-check/);
    assert.doesNotMatch(result.stdout, /build\/cpp_core/);
    if (target === 'test') {
      assert.match(result.stdout, /--no-tests=error/);
    } else {
      assert.match(result.stdout, /cmake -S backend\/cpp_core/);
    }
  }
});
