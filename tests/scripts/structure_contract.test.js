const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function exists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function git(args) {
  return spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function isTracked(relativePath) {
  return git(['ls-files', '--error-unmatch', relativePath]).status === 0;
}

test('active domain-layout entrypoints exist', () => {
  [
    'backend/core/CMakeLists.txt',
    'backend/api/app.js',
    'backend/cli/sovereign_cli.js',
    'backend/scripts/data_ops/ingest_market_data.js',
    'shared/lib',
    'Frontend/dashboard/package.json',
    'storage/data',
    'docs/ARCHITECTURE.md',
  ].forEach((relativePath) => {
    assert.equal(exists(relativePath), true, `${relativePath} should exist`);
  });
});

test('generated and local-only paths are ignored', () => {
  const ignoredPaths = [
    'node_modules',
    'backend/api/node_modules',
    'backend/gateway/node_modules',
    'Frontend/dashboard/node_modules',
    'Frontend/dashboard/dist',
    'storage/data/cache',
    'storage/data/ml',
    'storage/data/paper_trading',
    'storage/data/polymarket_history',
    'storage/data/ts',
    '__pycache__',
    '.mcp.json',
  ];

  ignoredPaths.forEach((relativePath) => {
    const result = git(['check-ignore', '--no-index', relativePath]);
    assert.equal(result.status, 0, `${relativePath} should be ignored`);
  });
});

test('shared/lib top-level files have no upward requires', () => {
  const SHARED_LIB = path.join(REPO_ROOT, 'shared', 'lib');
  const topLevelFiles = fs.readdirSync(SHARED_LIB)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(SHARED_LIB, f));

  for (const file of topLevelFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const upward = [...content.matchAll(/require\(['"](\.\.[/\\][^'"]+)['"]\)/g)].map(m => m[1]);
    assert.equal(
      upward.length, 0,
      `${path.basename(file)} has upward require(s): ${upward.join(', ')} — use #shared/* or ./sibling instead`
    );
  }
});

test('generated and local-only paths are not tracked', () => {
  const result = git([
    'ls-files',
    'node_modules',
    'backend/api/node_modules',
    'backend/gateway/node_modules',
    'Frontend/dashboard/node_modules',
    'Frontend/dashboard/dist',
    'storage/data/cache',
    'storage/data/ml',
    'storage/data/paper_trading',
    'storage/data/polymarket_history',
    'storage/data/ts',
    '__pycache__',
    '.mcp.json',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '', 'generated/local-only paths should not be tracked');
});

test('load-bearing clean-clone assets are tracked', () => {
  [
    '.dockerignore',
    'backend/api/tests/correlation_contract.test.js',
    'scripts/classify_strategy_assets.js',
    'scripts/mcp_stdio_probe.js',
    'notebooks/signal_library.json',
  ].forEach((relativePath) => {
    assert.equal(isTracked(relativePath), true, `${relativePath} should be tracked`);
  });
});

test('frame backtester sources referenced by the native build are tracked', () => {
  const cmake = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'core', 'CMakeLists.txt'), 'utf8');
  const main = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'core', 'src', 'main.cpp'), 'utf8');

  assert.match(cmake, /src\/backtest\/frame_backtester\.cpp/);
  assert.match(main, /backtest\/frame_backtester\.hpp/);

  [
    'backend/core/src/backtest/frame_backtester.cpp',
    'backend/core/src/backtest/frame_backtester.hpp',
  ].forEach((relativePath) => {
    assert.equal(isTracked(relativePath), true, `${relativePath} should be tracked`);
  });
});

test('default api gate includes the correlation contract', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.match(
    pkg.scripts['test:api'],
    /backend\/api\/tests\/correlation_contract\.test\.js/,
    'test:api should run the correlation contract'
  );
});

test('repository hygiene checks pass', () => {
  const result = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'dev', 'check_hygiene.js')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Hygiene checks failed:\n${result.stdout}`);
});

