'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifySupabaseError,
  isLikelySupabaseNetworkError,
} = require('../../../shared/lib/supabase/errors');

test('supabase errors: detects direct network codes', () => {
  const err = new Error('Connection failed');
  err.code = 'ECONNREFUSED';
  assert.equal(isLikelySupabaseNetworkError(err), true);
  assert.match(classifySupabaseError(err, 'authenticate'), /Unable to authenticate/);
});

test('supabase errors: detects nested cause network errors', () => {
  const rootErr = new TypeError('fetch failed', {
    cause: { code: 'EACCES', message: 'permission denied' },
  });
  assert.equal(isLikelySupabaseNetworkError(rootErr), true);
  const msg = classifySupabaseError(rootErr, 'sign in');
  assert.match(msg, /Unable to sign in\. Check network access/);
});

test('supabase errors: handles non-network standard error messages', () => {
  const err = new Error('Invalid login credentials');
  assert.equal(isLikelySupabaseNetworkError(err), false);
  assert.equal(classifySupabaseError(err), 'Invalid login credentials');
});

test('supabase errors: handles falsy or empty errors gracefully', () => {
  assert.equal(isLikelySupabaseNetworkError(null), false);
  assert.equal(classifySupabaseError(null), 'Unknown Supabase error');
});
