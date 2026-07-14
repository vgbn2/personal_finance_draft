'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function candidateSession(id = 'user-1') {
  return { access_token: 'test-token', user: { id, email: 'local@example.com' } };
}

test('dashboard restores only sessions that the auth provider still recognizes', async () => {
  const { restoreVerifiedSession } = await import('../../../../Frontend/dashboard/src/lib/session.js');
  const candidate = candidateSession();
  const validatedTokens = [];
  const validAuth = {
    getSession: async () => ({ data: { session: candidate }, error: null }),
    getUser: async (token) => {
      validatedTokens.push(token);
      return { data: { user: candidate.user }, error: null };
    },
  };
  const revokedAuth = {
    ...validAuth,
    getUser: async () => ({ data: { user: null }, error: new Error('revoked') }),
  };
  const unavailableAuth = {
    ...validAuth,
    getUser: async () => { throw new Error('provider unavailable'); },
  };

  assert.equal((await restoreVerifiedSession(validAuth)).session.user.id, 'user-1');
  assert.deepEqual(validatedTokens, ['test-token']);
  assert.deepEqual(await restoreVerifiedSession(revokedAuth), {
    session: null,
    reason: 'invalid_session',
  });
  assert.deepEqual(await restoreVerifiedSession(unavailableAuth), {
    session: null,
    reason: 'provider_unavailable',
  });

  const staleCandidate = { ...candidate, access_token: 'old-revoked-token' };
  const currentSessionAuth = {
    getSession: async () => ({ data: { session: staleCandidate }, error: null }),
    getUser: async (token) => token === 'current-token'
      ? { data: { user: candidate.user }, error: null }
      : { data: { user: null }, error: new Error('revoked candidate') },
  };
  assert.equal((await restoreVerifiedSession(currentSessionAuth)).session, null);
});

test('logout is confirmed locally before the dashboard clears its user state', async () => {
  const { clearLocalSession } = await import('../../../../Frontend/dashboard/src/lib/session.js');
  let session = candidateSession();
  const workingAuth = {
    signOut: async () => { session = null; return { error: null }; },
    getSession: async () => ({ data: { session }, error: null }),
  };
  const failingAuth = {
    signOut: async () => ({ error: new Error('logout failed') }),
    getSession: async () => ({ data: { session: candidateSession() }, error: null }),
  };

  assert.equal(await clearLocalSession(workingAuth), true);
  assert.equal(await clearLocalSession(failingAuth), false);
});

test('browser auth wiring contains no privileged host token fallback', () => {
  const frontendFiles = [
    'Frontend/dashboard/src/App.tsx',
    'Frontend/dashboard/src/lib/api.ts',
    'Frontend/dashboard/src/lib/session.js',
    'Frontend/dashboard/src/lib/supabase.ts',
  ];
  const source = frontendFiles
    .map((relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'))
    .join('\n');

  assert.doesNotMatch(source, /VITE_API_TOKEN|SOVEREIGN_API_TOKEN/);
  assert.match(source, /restoreVerifiedSession/);
  assert.match(source, /Authorization.*Bearer/);
});
