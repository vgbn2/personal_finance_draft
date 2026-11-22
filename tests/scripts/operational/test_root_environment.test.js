'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  loadEnvironmentManifest,
  projectEnvironmentForSurface,
} = require('../../../shared/lib/runtime/environment_manifest');

test('SDK contract root is classified without entering production child environments', () => {
  const name = 'ALPACA_CONTRACT_ROOT';
  const manifest = loadEnvironmentManifest();
  const entry = manifest.entries.find((item) => item.name === name);
  assert.ok(entry);
  assert.equal(entry.environment_class, 'internal');
  assert.deepEqual(entry.profiles, ['developer']);
  assert.deepEqual(entry.allowed_surfaces, ['process_internal']);

  for (const profile of manifest.profiles) {
    for (const surface of manifest.surfaces) {
      const projected = projectEnvironmentForSurface({
        [name]: '/tmp/opencode/sdk-fixture',
      }, surface, { profile });
      assert.equal(Object.hasOwn(projected, name), profile === 'developer' && surface === 'process_internal');
    }
  }
});
