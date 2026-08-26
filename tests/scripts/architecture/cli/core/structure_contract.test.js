const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

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
    'node_modules/',
    'backend/api/node_modules/',
    'backend/gateway/node_modules/',
    'Frontend/dashboard/node_modules/',
    'Frontend/dashboard/dist/',
    'storage/data/cache/',
    'storage/data/ml/',
    'storage/data/paper_trading/',
    'storage/data/polymarket_history/',
    'storage/data/ts/',
    '__pycache__/',
    '.mcp.json',
  ];

  const gitignoreContent = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
  ignoredPaths.forEach((relativePath) => {
    const result = git(['check-ignore', '--no-index', relativePath]);
    if (result.status === 128 && result.stderr.includes('beyond a symbolic link')) {
      assert.ok(gitignoreContent.includes(relativePath), `${relativePath} should be in .gitignore`);
      return;
    }
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
    'shared/lib/runtime/env.js',
    'shared/lib/data/ingestion.js',
    'shared/lib/data/macro_store.js',
    'shared/lib/ml/models.js',
    'tests/run_node_tests.js',
    'tests/fixtures/backend_history_sample.json',
    'tests/fixtures/real_bars_btc.json',
  ].forEach((relativePath) => {
    assert.equal(isTracked(relativePath), true, `${relativePath} should be tracked`);
  });
});

test('committed production and test sources contain no conflict markers', () => {
  const result = git([
    'grep',
    '-n',
    '-E',
    '^(<<<<<<<|=======|>>>>>>>)',
    'HEAD',
    '--',
    'backend',
    'shared',
    'config',
    'scripts',
    'tests',
  ]);

  assert.equal(result.status, 1, `Committed conflict markers found:\n${result.stdout}`);
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

test('every native test source is registered in both CMake manifests', () => {
  const testDir = path.join(REPO_ROOT, 'backend', 'core', 'test');
  const rootCmake = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'core', 'CMakeLists.txt'), 'utf8');
  const testCmake = fs.readFileSync(path.join(testDir, 'CMakeLists.txt'), 'utf8');
  const testSources = fs.readdirSync(testDir)
    .filter((file) => file.endsWith('_test.cpp'))
    .sort();

  for (const source of testSources) {
    const registration = rootCmake.match(
      new RegExp(`add_sovereign_test\\(([^\\s)]+)\\s+test/${source.replaceAll('.', '\\.')}\\)`)
    );
    assert.ok(registration, `${source} should be compiled and registered by backend/core/CMakeLists.txt`);
    const target = registration[1];
    assert.match(
      testCmake,
      new RegExp(`\\b${target}\\b`),
      `${target} should appear in backend/core/test/CMakeLists.txt`
    );
  }
});

test('default and strict api gates include every active API test', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const apiTests = fs.readdirSync(path.join(REPO_ROOT, 'backend', 'api', 'tests'))
    .filter((file) => file.endsWith('.test.js'))
    .sort();

  for (const file of apiTests) {
    assert.match(
      pkg.scripts['test:api'],
      new RegExp(`backend/api/tests/${file.replaceAll('.', '\\.')}`),
      `test:api should run ${file}`
    );
  }

  assert.match(pkg.scripts['verify:strict'], /npm run test:api/, 'verify:strict should run the complete API gate');
});

test('npm test scripts reference existing test files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

  for (const [scriptName, command] of Object.entries(pkg.scripts)) {
    const testFiles = [...command.matchAll(/(?:^|\s)([^\s]+\.test\.js)(?=\s|$)/g)]
      .map((match) => match[1]);

    for (const relativePath of testFiles) {
      assert.equal(
        exists(relativePath),
        true,
        `${scriptName} references missing test file ${relativePath}`
      );
    }
  }
});

test('repository hygiene checks pass', () => {
  const result = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'dev', 'check_hygiene.js')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Hygiene checks failed:\n${result.stdout}`);
});

test('test integrity anti-cheating audit scanner passes', () => {
  const result = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'dev', 'audit_test_integrity.js')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `Test integrity scanner failed:\n${result.stdout}\n${result.stderr}`);
});
