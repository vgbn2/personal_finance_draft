'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROFILE_NAMES,
  resolveDeploymentProfile,
  serviceAllowed,
  validateDeploymentProfile,
} = require('../../../../shared/lib/settings/deployment_profile');

test('deployment profiles separate machine services from user authorization', () => {
  assert.deepEqual(PROFILE_NAMES, ['all-in-one', 'central-host', 'developer', 'client']);
  const laptop = resolveDeploymentProfile('all-in-one');
  assert.equal(laptop.ok, true);
  assert.equal(laptop.canonical_writer, true);
  assert.deepEqual(laptop.default_services, ['web']);
  assert.equal(laptop.persistent_work_requires_explicit_start, true);
  assert.equal(serviceAllowed(laptop, 'backfill'), true);
  assert.equal(serviceAllowed(laptop, 'bot'), true);

  const client = resolveDeploymentProfile('client');
  assert.deepEqual(client.available_services, ['connector']);
  assert.equal(client.canonical_writer, false);
  assert.equal(serviceAllowed(client, 'backfill'), false);
});

test('unknown profiles fail closed instead of inheriting a writer role', () => {
  const unknown = resolveDeploymentProfile('everything');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.effective_profile, 'developer');
  assert.equal(unknown.canonical_writer, false);
  assert.equal(unknown.reason, 'unsupported_deployment_profile');
});

test('host validation accepts only profiles that own a canonical writer', () => {
  assert.equal(validateDeploymentProfile('central-host', { requireWriter: true }).ok, true);
  assert.equal(validateDeploymentProfile('all-in-one', { requireWriter: true }).ok, true);
  const developer = validateDeploymentProfile('developer', { requireWriter: true });
  assert.equal(developer.ok, false);
  assert.equal(developer.reason, 'deployment_profile_has_no_canonical_writer');
  assert.equal(validateDeploymentProfile('client', { requireWriter: true }).ok, false);
});
