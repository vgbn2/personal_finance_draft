'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { handleCommand } = require('../../../../backend/cli/sovereign_cli');
const { authenticateServiceToken } = require('../../../../shared/lib/auth/service_principals');

test('service CLI creates a one-time credential and can revoke it', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-service-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, 'services.json');
  const previousPath = process.env.SOVEREIGN_SERVICE_PRINCIPALS_PATH;
  const previousAdmin = process.env.SOVEREIGN_API_TOKEN;
  process.env.SOVEREIGN_SERVICE_PRINCIPALS_PATH = registryPath;
  process.env.SOVEREIGN_API_TOKEN = 'test-owner-token-that-is-long-enough';
  t.after(() => {
    if (previousPath === undefined) delete process.env.SOVEREIGN_SERVICE_PRINCIPALS_PATH;
    else process.env.SOVEREIGN_SERVICE_PRINCIPALS_PATH = previousPath;
    if (previousAdmin === undefined) delete process.env.SOVEREIGN_API_TOKEN;
    else process.env.SOVEREIGN_API_TOKEN = previousAdmin;
  });

  const writes = [];
  const originalLog = console.log;
  console.log = (value) => writes.push(String(value));
  t.after(() => { console.log = originalLog; });

  assert.equal(await handleCommand([
    'auth', 'service', 'create',
    '--id', 'mcp-fixture',
    '--capabilities', 'status.read,research.read',
  ]), 0);
  const created = JSON.parse(writes.pop());
  assert.equal(created.service.id, 'mcp-fixture');
  assert.equal(authenticateServiceToken(created.token, { path: registryPath }).id, 'mcp-fixture');

  assert.equal(await handleCommand(['auth', 'service', 'revoke', '--id', 'mcp-fixture']), 0);
  assert.equal(authenticateServiceToken(created.token, { path: registryPath }), null);
});
