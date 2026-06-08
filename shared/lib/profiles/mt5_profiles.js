const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { REPO_ROOT, findTool } = require('../runtime/paths');
const { writeJson } = require('../market/validation');

const MT5_PROFILE_SLOTS = ['propfirm', 'test', 'live'];
const DEFAULT_MT5_VAULT_DIR = path.join(REPO_ROOT, 'storage', 'secrets', 'mt5');
const DEFAULT_MT5_STORE_PATH = path.join(DEFAULT_MT5_VAULT_DIR, 'profiles.json');
const DEFAULT_MT5_KEY_PATH = path.join(DEFAULT_MT5_VAULT_DIR, 'vault.key');

function normalizeMt5Slot(slot) {
  const value = String(slot || '').trim().toLowerCase();
  if (!value) return '';
  if (['propfirm', 'prop', 'funded', 'challenge'].includes(value)) return 'propfirm';
  if (['test', 'demo', 'paper', 'practice'].includes(value)) return 'test';
  if (['live', 'real', 'production'].includes(value)) return 'live';
  return MT5_PROFILE_SLOTS.includes(value) ? value : '';
}

function slotLabel(slot) {
  const normalized = normalizeMt5Slot(slot);
  if (!normalized) return 'MT5';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getMt5ProfileChoices() {
  return MT5_PROFILE_SLOTS.map((slot) => ({
    label: slotLabel(slot),
    value: slot,
  }));
}

function resolveVaultOptions(options = {}) {
  const baseDir = options.baseDir || DEFAULT_MT5_VAULT_DIR;
  return {
    baseDir,
    storePath: options.storePath || path.join(baseDir, 'profiles.json'),
    keyPath: options.keyPath || path.join(baseDir, 'vault.key'),
  };
}

function ensureVaultKey(options = {}) {
  const { baseDir, keyPath } = resolveVaultOptions(options);
  fs.mkdirSync(baseDir, { recursive: true });

  if (!fs.existsSync(keyPath)) {
    const generated = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(keyPath, generated, 'utf8');
    return Buffer.from(generated, 'base64');
  }

  const raw = fs.readFileSync(keyPath, 'utf8').trim();
  if (!raw) {
    const generated = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(keyPath, generated, 'utf8');
    return Buffer.from(generated, 'base64');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    const generated = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(keyPath, generated, 'utf8');
    return Buffer.from(generated, 'base64');
  }

  return key;
}

function encryptSecret(secret, options = {}) {
  if (secret === undefined || secret === null || String(secret).length === 0) {
    return '';
  }

  const key = ensureVaultKey(options);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(secret), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

function decryptSecret(payload, options = {}) {
  if (!payload) return '';

  const [version, ivB64, tagB64, ciphertextB64] = String(payload).split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error('Invalid MT5 secret payload');
  }

  const key = ensureVaultKey(options);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

function getDefaultMt5TerminalPath() {
  return findTool('metatrader5', 'SOVEREIGN_MT5_TERMINAL_PATH') || '';
}

function readMt5ProfileStore(options = {}) {
  const { storePath } = resolveVaultOptions(options);
  if (!fs.existsSync(storePath)) {
    return { version: 1, profiles: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    if (Array.isArray(parsed)) {
      const profiles = {};
      for (const entry of parsed) {
        const slot = normalizeMt5Slot(entry && (entry.slot || entry.profile || entry.kind));
        if (!slot) continue;
        profiles[slot] = {
          slot,
          label: slotLabel(slot),
          terminal_path: String(entry.terminal_path || entry.terminalPath || '').trim(),
          login: String(entry.login || '').trim(),
          server: String(entry.server || '').trim(),
          account_type: slot,
          password_ciphertext: String(entry.password_ciphertext || entry.passwordCiphertext || ''),
          updated_at: String(entry.updated_at || entry.updatedAt || new Date().toISOString()),
        };
      }
      return { version: 1, profiles };
    }

    if (parsed && typeof parsed === 'object') {
      const rawProfiles = parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : parsed;
      const profiles = {};
      for (const [key, entry] of Object.entries(rawProfiles)) {
        if (!entry || typeof entry !== 'object') continue;
        const slot = normalizeMt5Slot(entry.slot || entry.kind || key);
        if (!slot) continue;
        profiles[slot] = {
          slot,
          label: String(entry.label || slotLabel(slot)),
          terminal_path: String(entry.terminal_path || entry.terminalPath || '').trim(),
          login: String(entry.login || '').trim(),
          server: String(entry.server || '').trim(),
          account_type: String(entry.account_type || entry.accountType || slot).trim() || slot,
          password_ciphertext: String(entry.password_ciphertext || entry.passwordCiphertext || ''),
          updated_at: String(entry.updated_at || entry.updatedAt || new Date().toISOString()),
          notes: String(entry.notes || '').trim(),
        };
      }
      return {
        version: Number(parsed.version || 1),
        updated_at: String(parsed.updated_at || parsed.updatedAt || ''),
        profiles,
      };
    }
  } catch (error) {
    throw new Error(`Failed to read MT5 profile store: ${error.message}`);
  }

  return { version: 1, profiles: {} };
}

function writeMt5ProfileStore(store, options = {}) {
  const { storePath } = resolveVaultOptions(options);
  writeJson(storePath, store);
}

function summarizeMt5Profile(record) {
  if (!record) return null;
  return {
    slot: normalizeMt5Slot(record.slot),
    label: String(record.label || slotLabel(record.slot)),
    account_type: String(record.account_type || record.accountType || normalizeMt5Slot(record.slot)),
    terminal_path: String(record.terminal_path || record.terminalPath || '').trim(),
    login: String(record.login || '').trim(),
    server: String(record.server || '').trim(),
    has_password: Boolean(record.password_ciphertext || record.passwordCiphertext),
    updated_at: String(record.updated_at || record.updatedAt || ''),
  };
}

function getMt5Profile(slot, options = {}) {
  const normalized = normalizeMt5Slot(slot);
  if (!normalized) return null;
  const store = readMt5ProfileStore(options);
  const record = store.profiles[normalized];
  if (!record) return null;
  const summary = summarizeMt5Profile(record);
  if (options.includeSecret) {
    return {
      ...summary,
      password: record.password_ciphertext ? decryptSecret(record.password_ciphertext, options) : '',
    };
  }
  return summary;
}

function listMt5Profiles(options = {}) {
  const store = readMt5ProfileStore(options);
  return MT5_PROFILE_SLOTS.map((slot) => summarizeMt5Profile(store.profiles[slot] || { slot }));
}

function upsertMt5Profile(input, options = {}) {
  const slot = normalizeMt5Slot(input && input.slot);
  if (!slot) {
    throw new Error('MT5 profile slot is required');
  }

  const store = readMt5ProfileStore(options);
  const existing = store.profiles[slot] || {};
  const now = new Date().toISOString();
  const hasPasswordField = Object.prototype.hasOwnProperty.call(input || {}, 'password');
  let passwordCiphertext = String(existing.password_ciphertext || '');

  if (hasPasswordField) {
    const passwordValue = input.password;
    if (passwordValue === null || passwordValue === '') {
      passwordCiphertext = '';
    } else {
      passwordCiphertext = encryptSecret(passwordValue, options);
    }
  }

  const record = {
    slot,
    label: String(input.label || existing.label || slotLabel(slot)),
    account_type: String(input.accountType || input.account_type || existing.account_type || slot),
    terminal_path: String(input.terminalPath || input.terminal_path || existing.terminal_path || '').trim(),
    login: String(input.login || existing.login || '').trim(),
    server: String(input.server || existing.server || '').trim(),
    password_ciphertext: passwordCiphertext,
    updated_at: now,
  };

  if (input.notes || existing.notes) {
    record.notes = String(input.notes || existing.notes || '').trim();
  }

  store.version = 1;
  store.updated_at = now;
  store.profiles[slot] = record;
  writeMt5ProfileStore(store, options);
  return summarizeMt5Profile(record);
}

function deleteMt5Profile(slot, options = {}) {
  const normalized = normalizeMt5Slot(slot);
  if (!normalized) {
    throw new Error('MT5 profile slot is required');
  }

  const store = readMt5ProfileStore(options);
  const removed = store.profiles[normalized] || null;
  if (removed) {
    delete store.profiles[normalized];
    store.version = 1;
    store.updated_at = new Date().toISOString();
    writeMt5ProfileStore(store, options);
  }
  return summarizeMt5Profile(removed);
}

module.exports = {
  DEFAULT_MT5_KEY_PATH,
  DEFAULT_MT5_STORE_PATH,
  DEFAULT_MT5_VAULT_DIR,
  MT5_PROFILE_SLOTS,
  deleteMt5Profile,
  decryptSecret,
  encryptSecret,
  getDefaultMt5TerminalPath,
  getMt5Profile,
  getMt5ProfileChoices,
  listMt5Profiles,
  normalizeMt5Slot,
  readMt5ProfileStore,
  slotLabel,
  summarizeMt5Profile,
  upsertMt5Profile,
};
