'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EphemeralKeyVault } = require('../../../backend/api/server/services/ephemeral_key_vault.js');

test('EphemeralKeyVault: registers and retrieves credentials in memory', () => {
  const vault = new EphemeralKeyVault();
  const sessionId = 'session_user_42';

  const res = vault.register(sessionId, {
    ALPACA_API_KEY: 'PKTEST1234567890',
    ALPACA_SECRET_KEY: 'SKTEST9876543210',
  });

  assert.equal(res.ok, true);
  assert.equal(res.sessionId, sessionId);
  assert.deepEqual(res.keysRegistered, ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY']);

  assert.equal(vault.has(sessionId, 'ALPACA_API_KEY'), true);
  assert.equal(vault.get(sessionId, 'ALPACA_API_KEY'), 'PKTEST1234567890');
  assert.equal(vault.get(sessionId, 'NONEXISTENT'), null);
});

test('EphemeralKeyVault: revokes credentials immediately on demand', () => {
  const vault = new EphemeralKeyVault();
  const sessionId = 'session_to_revoke';

  vault.register(sessionId, { SECRET: 'super_secret_value' });
  assert.equal(vault.has(sessionId, 'SECRET'), true);

  const revoked = vault.revoke(sessionId);
  assert.equal(revoked, true);
  assert.equal(vault.get(sessionId), null);
  assert.equal(vault.has(sessionId, 'SECRET'), false);
});

test('EphemeralKeyVault: auto-evicts expired credentials', async () => {
  const vault = new EphemeralKeyVault({ ttlMs: 15 });
  const sessionId = 'session_short_lived';

  vault.register(sessionId, { TEMP_TOKEN: 'temp_val' });
  assert.equal(vault.has(sessionId, 'TEMP_TOKEN'), true);

  // Wait for TTL to expire
  await new Promise(r => setTimeout(r, 25));

  assert.equal(vault.get(sessionId), null);
  assert.equal(vault.has(sessionId, 'TEMP_TOKEN'), false);
});

test('EphemeralKeyVault: telemetry redacts secret values without leaks', () => {
  const vault = new EphemeralKeyVault();
  vault.register('session_client_1', {
    LONG_SECRET: 'ABCDEF1234567890XYZ',
    SHORT_SEC: '1234',
  });

  const tel = vault.getTelemetry();
  assert.equal(tel.totalActiveSessions, 1);
  const sess = tel.sessions[0];
  assert.equal(sess.sessionId, 'session_client_1');

  const longSec = sess.keys.find(k => k.key === 'LONG_SECRET');
  assert.ok(longSec);
  assert.equal(longSec.masked, 'ABCD...0XYZ');
  assert.ok(!JSON.stringify(tel).includes('ABCDEF1234567890XYZ'));

  const shortSec = sess.keys.find(k => k.key === 'SHORT_SEC');
  assert.ok(shortSec);
  assert.equal(shortSec.masked, '***');
});

test('EphemeralKeyVault: strictly preserves zero-disk persistence', () => {
  const storageRuntime = path.resolve(__dirname, '../../../storage/runtime');
  const filesBefore = fs.existsSync(storageRuntime) ? fs.readdirSync(storageRuntime) : [];

  const vault = new EphemeralKeyVault();
  for (let i = 0; i < 10; i++) {
    vault.register(`sess_${i}`, { KEY: `secret_${i}` });
  }

  const filesAfter = fs.existsSync(storageRuntime) ? fs.readdirSync(storageRuntime) : [];
  assert.deepEqual(filesAfter, filesBefore, 'No disk files should be created by EphemeralKeyVault');
});
