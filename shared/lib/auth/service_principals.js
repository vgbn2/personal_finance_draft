'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  CAPABILITIES,
  buildPrincipal,
  normalizeCapabilities,
} = require('./access_policy');
const { REPO_ROOT } = require('../runtime/paths');

const SCHEMA_VERSION = 1;
const DEFAULT_REGISTRY_PATH = path.join(
  REPO_ROOT,
  'storage',
  'runtime',
  'service_principals.json',
);

function registryPath(env = process.env) {
  return path.resolve(env.SOVEREIGN_SERVICE_PRINCIPALS_PATH || DEFAULT_REGISTRY_PATH);
}

function emptyRegistry() {
  return { schema_version: SCHEMA_VERSION, services: [] };
}

function normalizeService(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const salt = String(value.salt || '').trim();
  const tokenHash = String(value.token_hash || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$/.test(id)) return null;
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  return {
    id,
    salt,
    token_hash: tokenHash,
    capabilities: normalizeCapabilities(value.capabilities),
    active: value.active !== false,
    acting_user_id: value.acting_user_id ? String(value.acting_user_id) : null,
    created_at: value.created_at ? String(value.created_at) : null,
    revoked_at: value.revoked_at ? String(value.revoked_at) : null,
  };
}

function readRegistry(options = {}) {
  const filePath = path.resolve(options.path || registryPath(options.env));
  const readFileSync = options.readFileSync || fs.readFileSync;
  const statSync = options.statSync || fs.statSync;
  try {
    if (process.platform !== 'win32' && fs.existsSync(filePath)) {
      const stats = statSync(filePath);
      if (stats.mode && (stats.mode & 0o077) !== 0) {
        console.warn(`[SECURITY] Service principal registry ${filePath} has broad permissions (${(stats.mode & 0o777).toString(8)}). Expected 600.`);
      }
    }
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!parsed || parsed.schema_version !== SCHEMA_VERSION || !Array.isArray(parsed.services)) {
      throw new Error('unsupported_service_principal_registry');
    }
    const services = parsed.services.map(normalizeService).filter(Boolean);
    if (services.length !== parsed.services.length) {
      throw new Error('invalid_service_principal_registry');
    }
    if (new Set(services.map((service) => service.id)).size !== services.length) {
      throw new Error('duplicate_service_principal_id');
    }
    return { schema_version: SCHEMA_VERSION, services };
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyRegistry();
    throw error;
  }
}

function tokenDigest(token, salt) {
  return crypto.scryptSync(String(token || ''), Buffer.from(salt, 'hex'), 32).toString('hex');
}

function constantTimeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(String(left)) || !/^[a-f0-9]{64}$/.test(String(right))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function authenticateServiceToken(token, options = {}) {
  const candidate = String(token || '');
  if (candidate.length < 32 || candidate.length > 512) return null;
  const registry = options.registry || readRegistry(options);
  for (const service of registry.services) {
    if (!service.active) continue;
    const digest = tokenDigest(candidate, service.salt);
    if (!constantTimeHexEqual(digest, service.token_hash)) continue;
    return buildPrincipal({
      id: service.id,
      identityType: 'service',
      role: 'service',
      capabilities: service.capabilities,
      authenticated: true,
      source: 'service_registry',
      sessionId: crypto.createHash('sha256').update(`service:${service.id}`).digest('hex').slice(0, 24),
      actingUserId: service.acting_user_id,
    });
  }
  return null;
}

function writeRegistry(registry, options = {}) {
  const filePath = path.resolve(options.path || registryPath(options.env));
  const mkdirSync = options.mkdirSync || fs.mkdirSync;
  const writeFileSync = options.writeFileSync || fs.writeFileSync;
  const renameSync = options.renameSync || fs.renameSync;
  const unlinkSync = options.unlinkSync || fs.unlinkSync;
  const existsSync = options.existsSync || fs.existsSync;
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporary, filePath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return filePath;
}

function createServicePrincipal({
  id,
  capabilities = [CAPABILITIES.STATUS_READ],
  actingUserId = null,
} = {}, options = {}) {
  const normalizedId = String(id || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$/.test(normalizedId)) {
    throw new TypeError('service id must be 3-64 safe characters');
  }
  const registry = readRegistry(options);
  if (registry.services.some((service) => service.id === normalizedId)) {
    throw new Error('service_principal_exists');
  }
  const normalizedCapabilities = normalizeCapabilities(capabilities);
  if (normalizedCapabilities.length === 0) {
    throw new TypeError('service principal requires at least one valid capability');
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const service = {
    id: normalizedId,
    salt,
    token_hash: tokenDigest(token, salt),
    capabilities: normalizedCapabilities,
    active: true,
    acting_user_id: actingUserId ? String(actingUserId) : null,
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
  writeRegistry({ ...registry, services: [...registry.services, service] }, options);
  return {
    token,
    service: {
      id: service.id,
      capabilities: service.capabilities,
      active: service.active,
      acting_user_id: service.acting_user_id,
      created_at: service.created_at,
    },
  };
}

function listServicePrincipals(options = {}) {
  return readRegistry(options).services.map((service) => ({
    id: service.id,
    capabilities: service.capabilities,
    active: service.active,
    acting_user_id: service.acting_user_id,
    created_at: service.created_at,
    revoked_at: service.revoked_at,
  }));
}

function revokeServicePrincipal(id, options = {}) {
  const registry = readRegistry(options);
  const service = registry.services.find((entry) => entry.id === String(id || ''));
  if (!service) throw new Error('service_principal_not_found');
  if (!service.active) return { changed: false, service: { id: service.id, active: false } };
  service.active = false;
  service.revoked_at = new Date().toISOString();
  writeRegistry(registry, options);
  return { changed: true, service: { id: service.id, active: false, revoked_at: service.revoked_at } };
}

module.exports = {
  DEFAULT_REGISTRY_PATH,
  SCHEMA_VERSION,
  authenticateServiceToken,
  createServicePrincipal,
  emptyRegistry,
  listServicePrincipals,
  readRegistry,
  registryPath,
  revokeServicePrincipal,
  tokenDigest,
  writeRegistry,
};
