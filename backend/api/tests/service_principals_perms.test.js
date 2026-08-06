'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  readRegistry,
  writeRegistry,
  emptyRegistry,
} = require('../../../shared/lib/auth/service_principals');

test('readRegistry warns on loose file permissions on POSIX', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-principal-test-'));
  const testFile = path.join(tmpDir, 'service_principals.json');

  try {
    writeRegistry(emptyRegistry(), { path: testFile });
    if (process.platform !== 'win32') {
      fs.chmodSync(testFile, 0o666);
    }

    let warned = false;
    const origWarn = console.warn;
    console.warn = (msg) => {
      if (typeof msg === 'string' && msg.includes('[SECURITY] Service principal registry')) {
        warned = true;
      }
    };

    const registry = readRegistry({ path: testFile });
    console.warn = origWarn;

    assert.equal(registry.schema_version, 1);
    if (process.platform !== 'win32') {
      assert.equal(warned, true, 'Expected warning for loose permissions');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
