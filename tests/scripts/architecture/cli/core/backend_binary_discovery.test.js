const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  BACKEND_CANDIDATES,
  REPO_ROOT,
} = require('../../../../../shared/lib/runtime/paths');

test('backend discovery includes the standard single-config CMake output', () => {
  const binaryName = process.platform === 'win32' ? 'sovereign_wealth.exe' : 'sovereign_wealth';
  const expected = path.join(REPO_ROOT, 'backend', 'core', 'build', binaryName);

  assert.equal(BACKEND_CANDIDATES.includes(expected), true);
});
