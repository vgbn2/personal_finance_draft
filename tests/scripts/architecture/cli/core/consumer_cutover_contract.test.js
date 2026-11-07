const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('canonical portfolio weight normalizer and kelly sizer paths exist without misnomer or portfolio sizing copies', () => {
  assert.ok(!fs.existsSync(path.join(root, 'backend/cpp_core/src/portfolio/optimizer.hpp')));
  assert.ok(!fs.existsSync(path.join(root, 'backend/cpp_core/src/portfolio/kelly_sizing.hpp')));
  assert.ok(!fs.existsSync(path.join(root, 'backend/cpp_core/src/portfolio/kelly_sizing.cpp')));
  assert.ok(fs.statSync(path.join(root, 'backend/cpp_core/src/portfolio/weight_normalizer.hpp')).isFile());
  assert.ok(fs.statSync(path.join(root, 'backend/cpp_core/src/risk_management/position_sizing/kelly_sizer.hpp')).isFile());
  assert.ok(fs.statSync(path.join(root, 'backend/cpp_core/src/risk_management/position_sizing/kelly_sizer.cpp')).isFile());
});

test('gateway fallback bootstrap resolves the execution owner without loading brokers', async () => {
  let loadedEntry;
  let registered = false;
  let called = false;
  const bootstrap = path.join(root, 'frontend/cli-tui/lib/run_trade_gateway.js');
  vm.runInNewContext(fs.readFileSync(bootstrap, 'utf8'), {
    __dirname: path.dirname(bootstrap),
    process: { exitCode: 0 },
    console,
    require(request) {
      if (request === 'node:path') return path;
      if (request === 'ts-node') return { register() { registered = true; } };
      loadedEntry = request;
      return { main() { called = true; } };
    },
  }, { filename: bootstrap });
  await Promise.resolve();
  assert.ok(registered);
  assert.ok(called);
  assert.equal(loadedEntry, path.join(root, 'backend/execution/src/index.ts'));
  assert.ok(fs.statSync(loadedEntry).isFile());
});

test('native source and quoted include paths survive physical folder moves', () => {
  const native = path.join(root, 'backend/cpp_core');
  for (const [, source] of read('backend/cpp_core/CMakeLists.txt').matchAll(/\b((?:src|test)\/[\w./-]+\.(?:cpp|hpp))/g)) {
    assert.ok(fs.statSync(path.join(native, source)).isFile(), source);
  }
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.(?:cpp|hpp|h)$/.test(entry.name)) {
        const source = fs.readFileSync(file, 'utf8');
        for (const [, include] of source.matchAll(/^\s*#include\s*"([^"]+)"/gm)) {
          const candidates = [
            path.resolve(directory, include),
            path.resolve(native, 'src', include),
            path.resolve(native, 'include', include),
          ];
          assert.ok(candidates.some((candidate) => fs.existsSync(candidate)), `${file}: ${include}`);
        }
      }
    }
  }
  inspect(path.join(native, 'src'));
  inspect(path.join(native, 'test'));
});

test('debloat retains canonical owners without internal shadow copies', () => {
  for (const retired of [
    'backend/cpp_core/src/core/ohlcv.hpp',
    'backend/cpp_core/src/portfolio/position.hpp',
    'backend/cpp_core/src/trading_system.hpp',
    'backend/cpp_core/src/machine_learning/sentiment_ingestion.cpp',
    'backend/api/server/services/cache.js',
  ]) {
    assert.equal(fs.existsSync(path.join(root, retired)), false, retired);
  }
  for (const owner of [
    'backend/cpp_core/src/data/ohlcv_bar.hpp',
    'backend/cpp_core/src/portfolio/portfolio_state.hpp',
    'backend/cpp_core/include/trading_system.hpp',
    'backend/cpp_core/src/general_ingestion/sentiment_ingestion.cpp',
  ]) {
    assert.ok(fs.statSync(path.join(root, owner)).isFile(), owner);
  }
  const cmake = read('backend/cpp_core/CMakeLists.txt');
  assert.match(cmake, /src\/general_ingestion\/sentiment_ingestion\.cpp/);
  assert.doesNotMatch(cmake, /src\/machine_learning\/sentiment_ingestion\.cpp/);
  const cache = require('../../../../../backend/api/server/services/ttl_cache');
  const key = 'debloat-owner-contract';
  assert.equal(cache.getCached(key, 0), undefined);
  cache.setCached(key, { available: false }, 10, 0);
  assert.deepEqual(cache.getCached(key, 9), { available: false });
  assert.equal(cache.getCached(key, 10), undefined);
});

test('canonical consumer entrypoints are physical directories, not old-root shims', () => {
  for (const directory of ['tools', 'backend/execution', 'frontend/cli-tui', 'configs', 'backend/cpp_core']) {
    assert.equal(fs.lstatSync(path.join(root, directory)).isSymbolicLink(), false, directory);
  }
  for (const old of ['scripts', 'backend/gateway', 'backend/cli', 'config', 'backend/core']) {
    assert.equal(fs.existsSync(path.join(root, old)), false, old);
  }
  assert.ok(fs.statSync(path.join(root, 'backend/scripts/data_ops/ingest_market_data.js')).isFile());
  assert.ok(fs.statSync(path.join(root, 'tests/scripts/architecture/cli/core/structure_contract.test.js')).isFile());
});

test('package aliases, workspace lock and native source agree on canonical owners', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(pkg.workspaces, lock.packages[''].workspaces);
  assert.deepEqual(pkg.bin, lock.packages[''].bin);
  for (const entry of Object.values(pkg.bin)) assert.ok(fs.statSync(path.join(root, entry)).isFile());
  assert.ok(pkg.workspaces.includes('backend/execution'));
  assert.equal(lock.packages['node_modules/sovereign-gateway'].resolved, 'backend/execution');
  assert.match(pkg.scripts['native:build'], /cmake -S backend\/cpp_core -B build\/core /);
  assert.match(read('CMakeLists.txt'), /add_subdirectory\(backend\/cpp_core\)/);
  assert.equal(pkg.imports['#scripts/*'], './backend/scripts/data_ops/*.js');
  assert.match(pkg.scripts['test:structure'], /tests\/scripts\//);
  for (const command of Object.values(pkg.scripts)) {
    assert.doesNotMatch(command, /(?:^|\s)(?:backend\/(?:gateway|cli|core)\/|scripts\/)/);
  }
});

test('every static relative CLI dependency resolves from its relocated caller', () => {
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.js')) {
        const source = fs.readFileSync(file, 'utf8');
        for (const [, request] of source.matchAll(/require(?:\.resolve)?\(['"](\.[^'"]+)['"]\)/g)) {
          assert.doesNotMatch(request, /(?:^|\/)backend\/(?:gateway|cli|core)\//);
          const resolved = path.resolve(path.dirname(file), request);
          const candidates = [
            resolved,
            resolved.replace('/dist/', '/src/').replace(/\.js$/, '.ts'),
          ];
          assert.ok(
            candidates.some((c) => {
              try { return require.resolve(c); } catch { return fs.existsSync(c); }
            }),
            `${file}: ${request}`
          );
        }
      }
    }
  }
  walk(path.join(root, 'frontend/cli-tui'));
});
