'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUserConfig,
  setUserConfig,
  getAuthStatus,
  getDatabaseStatus,
  isConfigured,
} = require('../server/services/supabase_client');

test('getUserConfig throws classified error on null client or invalid parameters', async () => {
  await assert.rejects(
    async () => getUserConfig(null, 'user-123'),
    /invalid_supabase_client_or_user_id/
  );
  await assert.rejects(
    async () => getUserConfig({}, null),
    /invalid_supabase_client_or_user_id/
  );
});

test('setUserConfig throws classified error on null parameters', async () => {
  await assert.rejects(
    async () => setUserConfig(null, 'user-123', 'theme', 'dark'),
    /invalid_supabase_client_or_params/
  );
  await assert.rejects(
    async () => setUserConfig({}, null, 'theme', 'dark'),
    /invalid_supabase_client_or_params/
  );
  await assert.rejects(
    async () => setUserConfig({}, 'user-123', null, 'dark'),
    /invalid_supabase_client_or_params/
  );
});

test('getUserConfig wraps database network errors cleanly', async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: null,
          error: { message: 'fetch failed', code: 'ENOTFOUND' },
        }),
      }),
    }),
  };

  await assert.rejects(
    async () => getUserConfig(mockClient, 'user-123'),
    /Unable to read user configuration/
  );
});

test('setUserConfig wraps database network errors cleanly', async () => {
  const mockClient = {
    from: () => ({
      upsert: async () => ({
        error: { message: 'fetch failed', code: 'ENOTFOUND' },
      }),
    }),
  };

  await assert.rejects(
    async () => setUserConfig(mockClient, 'user-123', 'theme', 'dark'),
    /Unable to write user configuration/
  );
});

test('getAuthStatus handles unauthenticated request cleanly', async () => {
  const status = await getAuthStatus({});
  assert.equal(status.type, 'auth_status');
  assert.equal(status.authenticated, false);
  assert.equal(status.user, null);
});
