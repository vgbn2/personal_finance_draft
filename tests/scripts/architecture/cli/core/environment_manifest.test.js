'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { aliasesForCentralCopy, loadEnvironmentManifest } = require('../../../../../shared/lib/runtime/environment_manifest');
const { checkEnvironmentManifest } = require('../../../../../scripts/dev/check_environment_manifest');

test('environment manifest classifies source and example names without exposing secrets', () => {
  const manifest = loadEnvironmentManifest();
  const check = checkEnvironmentManifest();
  assert.equal(check.ok, true, `unclassified: ${check.unclassified.join(', ')}`);
  assert.ok(manifest.entries.length >= 60);
  assert.equal(
    manifest.entries.some((entry) => entry.frontend_exposure && entry.sensitivity !== 'public'),
    false,
  );
  assert.deepEqual(aliasesForCentralCopy().ALPACA_SECRET_KEY, [
    'ALPACA_SECRET_KEY',
    'ALPACA_API_SECRET',
  ]);
});
