'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_REMOTE_URL = 'http://127.0.0.1:8788';
const DEFAULT_TIMEOUT_MS = 5000;
const CLIENT_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{24,256}$/;

function defaultConfigDir(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    return path.join(env.APPDATA || env.LOCALAPPDATA || os.homedir(), 'Sovereign');
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'sovereign');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function readSecret(filePath) {
  if (!filePath) return '';
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function normalizeBaseUrl(value) {
  const parsed = new URL(String(value || DEFAULT_REMOTE_URL));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('remote URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('remote URL must not contain credentials');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = hostname === 'localhost'
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  if (parsed.protocol === 'http:' && !loopback) {
    throw new Error('remote HTTP URL must use a loopback host; use HTTPS for remote hosts');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function loadRemoteConfig(options = {}) {
  const env = options.env || process.env;
  const configDir = options.configDir || defaultConfigDir(env, options.platform);
  const configPath = options.configPath || env.SOVEREIGN_CLIENT_CONFIG || path.join(configDir, 'client.json');
  const fileConfig = readJson(configPath);
  const tokenFile = options.tokenFile
    || env.SOVEREIGN_CLIENT_TOKEN_FILE
    || fileConfig.token_file
    || path.join(configDir, 'client.token');
  const token = options.token
    || env.SOVEREIGN_CLIENT_TOKEN
    || readSecret(tokenFile);
  const baseUrl = normalizeBaseUrl(
    options.baseUrl
      || env.SOVEREIGN_REMOTE_URL
      || fileConfig.base_url
      || DEFAULT_REMOTE_URL,
  );
  const refreshCandidate = Number(
    options.refreshSeconds
      || env.SOVEREIGN_REMOTE_REFRESH_SECONDS
      || fileConfig.refresh_seconds
      || 10,
  );
  const refreshSeconds = Number.isFinite(refreshCandidate)
    ? Math.max(2, refreshCandidate)
    : 10;

  return {
    baseUrl,
    configPath,
    tokenFile,
    token,
    refreshSeconds,
  };
}

function classifyRemoteState(status, payload) {
  if (status === 401 || status === 403) return 'unauthorized';
  if (!payload || payload.ok === false) return 'degraded';
  if (payload.stale === true || payload.data?.stale === true) return 'stale';
  if (payload.health?.degraded === true) return 'degraded';
  return 'connected';
}

async function requestRemote(endpoint, options = {}) {
  const config = options.config || loadRemoteConfig(options);
  if (!CLIENT_TOKEN_PATTERN.test(config.token || '')) {
    return {
      ok: false,
      state: 'unauthorized',
      status: 0,
      error: 'client token is missing or invalid',
    };
  }

  const url = new URL(endpoint, `${config.baseUrl}/`);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Sovereign-Token': config.token,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = { ok: false, error: 'host returned non-JSON response' };
    }
    return {
      ok: response.ok && payload.ok !== false,
      state: classifyRemoteState(response.status, payload),
      status: response.status,
      payload,
      error: response.ok ? null : (payload.error || `host returned HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      state: 'host_unavailable',
      status: 0,
      error: error && error.name === 'TimeoutError'
        ? `host request timed out after ${timeoutMs}ms`
        : `host unavailable: ${error.message}`,
    };
  }
}

module.exports = {
  CLIENT_TOKEN_PATTERN,
  DEFAULT_REMOTE_URL,
  classifyRemoteState,
  defaultConfigDir,
  loadRemoteConfig,
  normalizeBaseUrl,
  requestRemote,
};
