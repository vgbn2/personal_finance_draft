'use strict';

const {
  loadEnvironmentManifest,
  projectEnvironmentForSurface,
} = require('./environment_manifest');

function validateEnv(env = process.env, surface = 'default_cli', options = {}) {
  const targetEnv = env || {};
  const manifest = options.manifest || loadEnvironmentManifest();
  const errors = [];
  const missing = [];
  const forbidden = [];
  const warnings = [];

  const surfaceAllowed = new Set(
    (manifest.surfaces && manifest.surfaces[surface]) || []
  );

  for (const entry of manifest.variables || []) {
    const key = entry.name;
    const value = targetEnv[key];
    const present = value !== undefined && value !== null && String(value).trim() !== '';

    if (entry.required && !present) {
      errors.push(`missing_required:${key}`);
      missing.push(key);
    }

    if (present && surfaceAllowed.size > 0 && !surfaceAllowed.has(key)) {
      warnings.push(`unallowed_surface_key:${key}:${surface}`);
    }

    if (present && entry.sensitivity === 'secret' && String(value).length < 8) {
      warnings.push(`low_entropy_secret:${key}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    missing,
    forbidden,
    warnings,
  };
}

function sanitizeEnv(env = process.env, surface = 'default_cli', options = {}) {
  const projected = projectEnvironmentForSurface(env || {}, surface, options);
  const manifest = options.manifest || loadEnvironmentManifest();
  const sanitized = { ...projected };

  for (const entry of manifest.variables || []) {
    if (sanitized[entry.name] === undefined && entry.default_value !== undefined && entry.default_value !== null) {
      sanitized[entry.name] = String(entry.default_value);
    }
  }

  return sanitized;
}

function exportMaskedEnv(env = process.env, options = {}) {
  const targetEnv = env || {};
  const manifest = options.manifest || loadEnvironmentManifest();
  const secretKeys = new Set(
    (manifest.variables || [])
      .filter((entry) => entry.sensitivity === 'secret')
      .map((entry) => entry.name)
  );

  const masked = {};
  for (const [key, value] of Object.entries(targetEnv)) {
    if (value === undefined || value === null) {
      masked[key] = value;
      continue;
    }
    if (secretKeys.has(key) || /SECRET|KEY|TOKEN|PASSWORD|PRIVATE/i.test(key)) {
      const valStr = String(value);
      if (valStr.length === 0) {
        masked[key] = '';
      } else {
        masked[key] = '***MASKED***';
      }
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function verifyCredential(key, value) {
  const name = String(key || '').trim();
  const raw = String(value || '').trim();

  if (!name) return { valid: false, reason: 'missing_key_name' };
  if (!raw) return { valid: false, reason: 'empty_credential_value' };

  const dummyPlaceholders = [
    'your_api_key_here',
    'your_secret_here',
    '00000000',
    '12345678',
    'changeme',
    'placeholder',
  ];
  if (dummyPlaceholders.some((p) => raw.toLowerCase().includes(p))) {
    return { valid: false, reason: 'placeholder_credential' };
  }

  if (raw.length < 4) {
    return { valid: false, reason: 'insufficient_length' };
  }

  return { valid: true, reason: null };
}

module.exports = {
  exportMaskedEnv,
  sanitizeEnv,
  validateEnv,
  verifyCredential,
};
