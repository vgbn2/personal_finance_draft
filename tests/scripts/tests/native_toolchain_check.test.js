const test = require('node:test');
const assert = require('node:assert/strict');

const { nativeToolchainStatus } = require('../dev/native_toolchain_check');

test('native toolchain status reports required CMake gates and compiler fallback', () => {
  const status = nativeToolchainStatus();

  assert.equal(status.type, 'native_toolchain_status');
  assert.equal(typeof status.ok, 'boolean');
  assert.equal(typeof status.can_run_cmake, 'boolean');
  assert.equal(typeof status.fallback_compile_available, 'boolean');
  assert.equal(Array.isArray(status.missing_required), true);
  assert.equal(Array.isArray(status.checks), true);
  assert.equal(status.checks.some((check) => check.id === 'cmake' && check.required), true);
  assert.equal(status.checks.some((check) => check.id === 'ctest' && check.required), true);
  assert.equal(status.checks.some((check) => check.id === 'gpp' && !check.required), true);
  assert.equal(status.ok, status.missing_required.length === 0);
  assert.equal(typeof status.guidance, 'string');

  console.log(JSON.stringify({
    type: status.type,
    ok: status.ok,
    missing_required: status.missing_required,
    fallback_compile_available: status.fallback_compile_available,
    checks: status.checks.map((check) => ({
      id: check.id,
      available: check.available,
      command: check.command,
      version: check.version,
    })),
  }, null, 2));
});
