'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const DEPLOY_WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'deploy.yml');
const TEST_WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'test.yml');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('central-host Actions workflow is a truthful readiness check with valid local inputs', () => {
  const workflow = fs.readFileSync(DEPLOY_WORKFLOW, 'utf8');
  assert.match(workflow, /^name: Central Host Readiness$/m);
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|schedule):/m);

  const referencedPaths = [
    'docs/operational/guides/DEPLOYMENT.md',
    '.env.central.example',
    'backend/scripts/ops/central_host_preflight.js',
    'infra/docker/docker-compose.yml',
    'infra/docker/update-central-host.sh',
    'infra/systemd/install-central-updater.sh',
    'infra/systemd/sovereign-central-update.service.in',
    'infra/systemd/sovereign-central-update.timer',
  ];
  for (const relativePath of referencedPaths) {
    assert.match(workflow, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(fs.existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} must exist`);
  }

  assert.match(workflow, /docker compose[^\n]+config --quiet/);
  assert.match(workflow, /docker compose[^\n]+build web/);
  assert.match(workflow, /central_host_preflight\.js/);
  assert.match(workflow, /No host was provisioned, updated, or started/);
  assert.doesNotMatch(workflow, /docs\/DEPLOYMENT\.md/);
  assert.doesNotMatch(workflow, /^\s+(?:\.\/)?infra\/docker\/update-central-host\.sh(?:\s|$)/m);
});

test('C++ Actions workflow executes CTest from the generated root-build directory', () => {
  const workflow = fs.readFileSync(TEST_WORKFLOW, 'utf8');
  assert.match(workflow, /node-version: '22'/);
  assert.match(workflow, /cmake -S \. -B build\/ci-debug/);
  assert.match(workflow, /ctest --test-dir build\/ci-debug\/backend\/core --output-on-failure/);
  assert.doesNotMatch(workflow, /build\/ci-debug\/cpp_core/);

  const rootCmake = read('CMakeLists.txt');
  assert.match(rootCmake, /add_subdirectory\(backend\/core\)/);
});

test('Node Actions workflow retains committed-archive evidence instead of root-only proof', () => {
  const workflow = fs.readFileSync(TEST_WORKFLOW, 'utf8');
  assert.match(workflow, /npm run verify:committed-archive/);
  assert.match(workflow, /--evidence-out "\$RUNNER_TEMP\/sovereign-source-evidence\.json"/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /^\s+- name: Install Node dependencies$/m);
  assert.doesNotMatch(workflow, /^\s+- name: Run Node tests$/m);

  const coordinator = read('scripts/dev/verify_source_evidence.js');
  assert.match(coordinator, /typecheck_gateway/);
  assert.match(coordinator, /shared\/lib\/market\/quote_router\.js/);
  assert.match(coordinator, /backend\/api\/app\.js/);
});

test('CI dependencies use non-interactive transports', () => {
  const packageJson = read('package.json');
  const packageLock = read('package-lock.json');

  assert.doesNotMatch(packageJson, /github:Mathieu2301\/TradingView-API/);
  assert.match(packageJson, /git\+https:\/\/github\.com\/Mathieu2301\/TradingView-API\.git#574a9948b2adb3396b934c612f58d2ab103a6915/);
  assert.match(packageLock, /TradingView-API\.git#574a9948b2adb3396b934c612f58d2ab103a6915/);
});
