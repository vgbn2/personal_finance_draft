'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('fresh-install is a compatibility wrapper for committed-archive evidence', () => {
  const wrapper = fs.readFileSync(path.resolve('scripts/dev/verify_fresh_install.sh'), 'utf8');
  const coordinator = fs.readFileSync(
    path.resolve('scripts/dev/verify_source_evidence.js'),
    'utf8',
  );
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['verify:source-snapshot'],
    'node scripts/dev/verify_source_evidence.js --mode worktree_snapshot',
  );
  assert.equal(
    packageJson.scripts['verify:committed-archive'],
    'node scripts/dev/verify_source_evidence.js --mode committed_archive',
  );
  assert.equal(packageJson.scripts['verify:fresh-install'], 'npm run verify:committed-archive --');
  assert.match(wrapper, /verify_source_evidence\.js/);
  assert.match(wrapper, /--mode committed_archive/);
  assert.doesNotMatch(wrapper, /ls-files|tar -xf|npm ci/);
  assert.match(coordinator, /\['archive', '--format=tar'/);
  assert.match(coordinator, /\['ls-files', '--cached'/);
  assert.match(coordinator, /npm_config_cache/);
  assert.match(coordinator, /writeEvidenceAtomic/);
  for (const packageRoot of [
    'backend/api',
    'backend/gateway',
    'backend/mcp_server',
    'Frontend/dashboard',
  ]) {
    assert.match(coordinator, new RegExp(packageRoot.replace('/', '\\/')));
  }
  assert.match(coordinator, /test_native_core/);
  assert.match(coordinator, /typecheck_gateway/);
  assert.match(coordinator, /backend\/api\/app\.js/);
  assert.match(coordinator, /test_secrets/);
  assert.match(coordinator, /test_contracts/);
  assert.doesNotMatch(`${wrapper}\n${coordinator}`, /git reset|git clean|checkout|rm -rf \//);
});
