'use strict';

const crypto = require('node:crypto');

// Default session expiration: 1 hour of inactivity
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const MAX_VAULT_ENTRIES = 500;

/**
 * EphemeralKeyVault manages in-memory-only credentials for multi-user / BYOK sessions.
 * Invariant: Credentials are NEVER written to disk, databases, or unmasked logs.
 */
class EphemeralKeyVault {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = MAX_VAULT_ENTRIES } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.sessions = new Map();
  }

  _cleanupExpired() {
    const now = Date.now();
    for (const [sessionId, entry] of this.sessions.entries()) {
      if (now > entry.expiresAt) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Register or update ephemeral credentials for a session.
   * @param {string} sessionId - Unique session or WebSocket connection ID.
   * @param {Object} credentials - Dictionary of keys (e.g. { alpacaApiKey, alpacaSecret, polymarketKey }).
   * @param {Object} options - Custom TTL or metadata.
   */
  register(sessionId, credentials = {}, { ttlMs = this.ttlMs, role = 'ephemeral_operator' } = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('EphemeralKeyVault: sessionId must be a non-empty string');
    }
    if (!credentials || typeof credentials !== 'object') {
      throw new Error('EphemeralKeyVault: credentials must be an object');
    }

    this._cleanupExpired();

    if (this.sessions.size >= this.maxEntries && !this.sessions.has(sessionId)) {
      // Evict oldest session
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) this.sessions.delete(oldestKey);
    }

    const now = Date.now();
    const existing = this.sessions.get(sessionId);
    const existingCreds = existing ? existing.credentials : {};

    // Clone into isolated in-memory object
    const mergedCreds = { ...existingCreds, ...credentials };

    this.sessions.set(sessionId, {
      sessionId,
      role,
      credentials: mergedCreds,
      createdAt: existing ? existing.createdAt : now,
      lastAccessedAt: now,
      expiresAt: now + ttlMs,
    });

    return {
      ok: true,
      sessionId,
      expiresAt: new Date(now + ttlMs).toISOString(),
      keysRegistered: Object.keys(mergedCreds),
    };
  }

  /**
   * Retrieve credentials for a session. Touches lastAccessedAt and extends TTL.
   */
  get(sessionId, keyName = null) {
    this._cleanupExpired();
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    entry.lastAccessedAt = now;
    entry.expiresAt = now + this.ttlMs;

    if (keyName) {
      return entry.credentials[keyName] || null;
    }

    return { ...entry.credentials };
  }

  /**
   * Check if session has a specific key registered without returning its plaintext.
   */
  has(sessionId, keyName) {
    const val = this.get(sessionId, keyName);
    return typeof val === 'string' && val.length > 0;
  }

  /**
   * Securely revoke/purge a session's credentials from memory immediately.
   */
  revoke(sessionId) {
    if (!this.sessions.has(sessionId)) return false;
    const entry = this.sessions.get(sessionId);
    // Overwrite in-memory strings if possible before unlinking
    if (entry && entry.credentials) {
      for (const k of Object.keys(entry.credentials)) {
        entry.credentials[k] = '';
      }
    }
    return this.sessions.delete(sessionId);
  }

  /**
   * Produce safe telemetry report with all secrets redacted.
   */
  getTelemetry() {
    this._cleanupExpired();
    const activeSessions = [];
    for (const [sessionId, entry] of this.sessions.entries()) {
      const keys = Object.keys(entry.credentials).map(k => {
        const val = String(entry.credentials[k] || '');
        const masked = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : '***';
        return { key: k, masked, configured: val.length > 0 };
      });
      activeSessions.push({
        sessionId,
        role: entry.role,
        createdAt: new Date(entry.createdAt).toISOString(),
        expiresAt: new Date(entry.expiresAt).toISOString(),
        keys,
      });
    }

    return {
      totalActiveSessions: activeSessions.length,
      sessions: activeSessions,
    };
  }

  clearAll() {
    this.sessions.clear();
  }
}

// Global singleton instance for application runtime
const globalVault = new EphemeralKeyVault();

module.exports = {
  EphemeralKeyVault,
  globalVault,
};
