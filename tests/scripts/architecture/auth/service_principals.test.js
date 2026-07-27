'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { CAPABILITIES } = require('../../../../shared/lib/auth/access_policy');
const {
  authenticateServiceToken,
  createServicePrincipal,
  listServicePrincipals,
  revokeServicePrincipal,
} = require('../../../../shared/lib/auth/service_principals');

test('service registry stores only a hash and supports create, authenticate, list, and revoke', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-services-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, 'services.json');
  const created = createServicePrincipal({
    id: 'mcp-research',
    capabilities: [CAPABILITIES.STATUS_READ, CAPABILITIES.RESEARCH_READ],
  }, { path: registryPath });

  assert.ok(created.token.length >= 32);
  const raw = fs.readFileSync(registryPath, 'utf8');
  assert.doesNotMatch(raw, new RegExp(created.token));
  assert.equal(fs.statSync(registryPath).mode & 0o777, 0o600);

  const principal = authenticateServiceToken(created.token, { path: registryPath });
  assert.equal(principal.id, 'mcp-research');
  assert.equal(principal.source, 'service_registry');
  assert.deepEqual(principal.capabilities, [
    CAPABILITIES.STATUS_READ,
    CAPABILITIES.RESEARCH_READ,
  ]);
  assert.equal(authenticateServiceToken('wrong-token-value-that-is-long-enough', { path: registryPath }), null);

  assert.deepEqual(listServicePrincipals({ path: registryPath }), [{
    id: 'mcp-research',
    capabilities: [CAPABILITIES.STATUS_READ, CAPABILITIES.RESEARCH_READ],
    active: true,
    acting_user_id: null,
    created_at: created.service.created_at,
    revoked_at: null,
  }]);

  assert.equal(revokeServicePrincipal('mcp-research', { path: registryPath }).changed, true);
  assert.equal(authenticateServiceToken(created.token, { path: registryPath }), null);
  assert.equal(listServicePrincipals({ path: registryPath })[0].active, false);
});

test('service registry rejects duplicate IDs and empty capability grants', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-services-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { path: path.join(root, 'services.json') };
  createServicePrincipal({ id: 'service-one' }, options);
  assert.throws(
    () => createServicePrincipal({ id: 'service-one' }, options),
    /service_principal_exists/,
  );
  assert.throws(
    () => createServicePrincipal({ id: 'service-two', capabilities: ['unknown'] }, options),
    /at least one valid capability/,
  );
});
