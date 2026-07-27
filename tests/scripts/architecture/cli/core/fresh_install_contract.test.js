'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('fresh-install verifier is disposable, lockfile-driven, and covers every package root', () => {
  const script = fs.readFileSync(path.resolve('scripts/dev/verify_fresh_install.sh'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.equal(packageJson.scripts['verify:fresh-install'], 'bash scripts/dev/verify_fresh_install.sh');
  assert.match(script, /mktemp -d/);
  assert.match(script, /npm_config_cache="\$verify_root\/\.npm-cache"/);
  assert.match(script, /git ls-files --cached --others --exclude-standard/);
  assert.match(script, /\.sovereign-source-files/);
  assert.match(script, /npm --prefix "\$verify_root\/\$package_root" ci/);
  assert.match(script, /npm --prefix "\$verify_root\/\$package_root" ls --depth=0/);
  for (const packageRoot of [
    'backend/api',
    'backend/gateway',
    'backend/mcp_server',
    'Frontend/dashboard',
  ]) {
    assert.match(script, new RegExp(packageRoot.replace('/', '\\/')));
  }
  assert.match(script, /run test:core/);
  assert.match(script, /run test:secrets/);
  assert.match(script, /run test:contracts/);
  assert.match(script, /npm --prefix "\$verify_root" test/);
  assert.doesNotMatch(script, /git reset|git clean|checkout|rm -rf \//);
});
