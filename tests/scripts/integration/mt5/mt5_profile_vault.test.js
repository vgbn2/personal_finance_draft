'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  upsertMt5Profile,
  getMt5Profile,
  listMt5Profiles,
  deleteMt5Profile,
  normalizeMt5Slot,
  encryptSecret,
  decryptSecret,
  summarizeMt5Profile,
} = require('../../../../shared/lib/profiles/mt5_profiles.js');

test('MT5 Profile Vault: slot normalization handles standard slots and aliases', () => {
  assert.equal(normalizeMt5Slot('propfirm'), 'propfirm');
  assert.equal(normalizeMt5Slot('funded'), 'propfirm');
  assert.equal(normalizeMt5Slot('challenge'), 'propfirm');
  assert.equal(normalizeMt5Slot('test'), 'test');
  assert.equal(normalizeMt5Slot('demo'), 'test');
  assert.equal(normalizeMt5Slot('paper'), 'test');
  assert.equal(normalizeMt5Slot('live'), 'live');
  assert.equal(normalizeMt5Slot('real'), 'live');
  assert.equal(normalizeMt5Slot('invalid_slot'), '');
});

test('MT5 Profile Vault: AES-256-GCM encryption and decryption roundtrip', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sov-mt5-vault-test-'));
  try {
    const secret = 'MySuperSecretP@ssword123!';
    const ciphertext = encryptSecret(secret, { baseDir: tempDir });
    assert.ok(ciphertext.startsWith('v1:'));
    const parts = ciphertext.split(':');
    assert.equal(parts.length, 4, 'Ciphertext format: v1:iv:tag:data');

    const decrypted = decryptSecret(ciphertext, { baseDir: tempDir });
    assert.equal(decrypted, secret);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('MT5 Profile Vault: profile CRUD lifecycle with secret masking', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sov-mt5-vault-crud-'));
  try {
    const opts = { baseDir: tempDir };

    // 1. Upsert profile
    const saved = upsertMt5Profile({
      slot: 'demo', // alias for test
      label: 'ICMarkets Demo',
      login: '12345678',
      server: 'ICMarketsSC-Demo',
      password: 'DemoAccountPassword123',
      terminalPath: '/opt/mt5/terminal64.exe',
      notes: 'Automated test profile',
    }, opts);

    assert.equal(saved.slot, 'test');
    assert.equal(saved.login, '12345678');
    assert.equal(saved.has_password, true);
    assert.equal(saved.password, undefined, 'Summary must never expose raw password');

    // 2. Read back profile with secret
    const fetchedWithSecret = getMt5Profile('test', { ...opts, includeSecret: true });
    assert.ok(fetchedWithSecret);
    assert.equal(fetchedWithSecret.password, 'DemoAccountPassword123');
    assert.equal(fetchedWithSecret.server, 'ICMarketsSC-Demo');

    // 3. Read back profile without secret
    const fetchedSummary = getMt5Profile('test', opts);
    assert.equal(fetchedSummary.password, undefined);
    assert.equal(fetchedSummary.has_password, true);

    // 4. List profiles
    const profiles = listMt5Profiles(opts);
    assert.equal(profiles.length, 3, 'Must list all 3 standard slots: propfirm, test, live');
    const testSlot = profiles.find((p) => p.slot === 'test');
    assert.ok(testSlot);
    assert.equal(testSlot.login, '12345678');

    // 5. Delete profile
    const deleted = deleteMt5Profile('test', opts);
    assert.equal(deleted.slot, 'test');

    const checkDeleted = getMt5Profile('test', opts);
    assert.equal(checkDeleted, null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('MT5 Profile Vault: falls back to environment variables when slot is missing from vault', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sov-mt5-vault-env-'));
  try {
    const fakeEnv = {
      MT5_TEST_LOGIN: '77889900',
      MT5_TEST_PASSWORD: 'EnvTestPassword!',
      MT5_TEST_SERVER: 'Env-Demo-Server',
      MT5_TEST_TERMINAL_PATH: '/env/path/terminal64.exe',
    };

    const opts = { baseDir: tempDir, env: fakeEnv };

    // 1. getMt5Profile with secret reads from ENV
    const fetched = getMt5Profile('test', { ...opts, includeSecret: true });
    assert.ok(fetched);
    assert.equal(fetched.login, '77889900');
    assert.equal(fetched.password, 'EnvTestPassword!');
    assert.equal(fetched.server, 'Env-Demo-Server');
    assert.equal(fetched.source, 'env');

    // 2. getMt5Profile without secret masks password
    const summary = getMt5Profile('test', opts);
    assert.equal(summary.login, '77889900');
    assert.equal(summary.password, undefined);
    assert.equal(summary.has_password, true);

    // 3. Vault profile takes precedence over ENV when present
    upsertMt5Profile({
      slot: 'test',
      login: '11112222',
      server: 'Vault-Server',
      password: 'VaultPassword!',
    }, opts);

    const vaultOverride = getMt5Profile('test', { ...opts, includeSecret: true });
    assert.equal(vaultOverride.login, '11112222');
    assert.equal(vaultOverride.server, 'Vault-Server');
    assert.equal(vaultOverride.source, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
