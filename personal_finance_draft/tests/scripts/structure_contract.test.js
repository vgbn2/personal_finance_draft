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
    'storage/data/ts',
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
    'storage/data/ts',
    '.mcp.json',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '', 'generated/local-only paths should not be tracked');
});
