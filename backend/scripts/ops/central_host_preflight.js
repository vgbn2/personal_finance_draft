#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT } = require('../../../shared/lib/runtime/paths.js');

const MIN_API_TOKEN_LENGTH = 24;
const DEFAULT_MIN_FREE_BYTES = 10 * 1024 ** 3;
const EXECUTION_ONLY_KEYS = [
  'SOVEREIGN_TRADE_PIN',
  'POLYMARKET_PRIVATE_KEY',
  'POLYMARKET_API_KEY',
  'POLYMARKET_API_SECRET',
  'POLYMARKET_API_PASSPHRASE',
];

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }
  return parsed;
}

function loadCentralEnvironment(baseEnv = process.env, repoRoot = REPO_ROOT) {
  const envPath = path.resolve(baseEnv.SOVEREIGN_ENV_FILE || path.join(repoRoot, '.env.central'));
  return {
    ...parseEnvFile(envPath),
    ...baseEnv,
    SOVEREIGN_ENV_FILE: envPath,
  };
}

function isPrivateBind(value) {
  const bind = String(value || '').trim().toLowerCase();
  if (bind === 'localhost') return true;
  const family = net.isIP(bind);
  if (family === 6) return bind === '::1' || /^(?:fc|fd)/i.test(bind);
  if (family !== 4) return false;
  const octets = bind.split('.').map(Number);
  if (octets[0] === 127 || octets[0] === 10) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

function validateCentralEnvironment(env = process.env) {
  const runtimeMode = String(env.SOVEREIGN_RUNTIME_MODE || '').trim();
  const liveTrading = String(env.LIVE_TRADING || '').trim().toLowerCase();
  const executionAuthorized = String(env.SOVEREIGN_EXECUTION_AUTHORIZED || '').trim().toLowerCase();
  const bind = String(env.SOVEREIGN_WEB_BIND || '127.0.0.1').trim();
  const intervalSecs = Number(env.BACKFILL_INTERVAL_SECS || 1800);
  const executionKeysPresent = EXECUTION_ONLY_KEYS.filter((key) => nonEmpty(env[key]));
  const checks = {
    runtime_mode: {
      ok: runtimeMode === 'cloud-compute',
      expected: 'cloud-compute',
      configured: runtimeMode || null,
    },
    live_trading_disabled: {
      ok: liveTrading === 'false',
      configured: liveTrading || null,
    },
    execution_authorization_disabled: {
      ok: executionAuthorized === '' || executionAuthorized === 'false',
      configured: executionAuthorized || null,
    },
    private_bind: {
      ok: isPrivateBind(bind),
      bind,
    },
    api_token: {
      ok: nonEmpty(env.SOVEREIGN_API_TOKEN) && env.SOVEREIGN_API_TOKEN.trim().length >= MIN_API_TOKEN_LENGTH,
      present: nonEmpty(env.SOVEREIGN_API_TOKEN),
      minimum_length: MIN_API_TOKEN_LENGTH,
    },
    backfill_interval: {
      ok: Number.isInteger(intervalSecs) && intervalSecs >= 60 && intervalSecs <= 86400,
      seconds: Number.isFinite(intervalSecs) ? intervalSecs : null,
      allowed_seconds: [60, 86400],
    },
    no_execution_secrets: {
      ok: executionKeysPresent.length === 0,
      present_keys: executionKeysPresent,
    },
  };
  return {
    ok: Object.values(checks).every((check) => check.ok),
    checks,
  };
}

function commandAvailable(run, command, args) {
  const result = run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    ok: result.status === 0,
    exit_code: result.status,
    reason: result.status === 0 ? 'available' : 'unavailable',
  };
}

function gitClean(run, repoRoot) {
  const result = run('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const dirtyEntries = result.status === 0
    ? String(result.stdout || '').split(/\r?\n/).filter(Boolean).length
    : null;
  return {
    ok: result.status === 0 && dirtyEntries === 0,
    exit_code: result.status,
    dirty_entry_count: dirtyEntries,
    reason: result.status !== 0 ? 'git_status_failed' : (dirtyEntries === 0 ? 'clean' : 'dirty'),
  };
}

function diskCheck(targetPath, minFreeBytes = DEFAULT_MIN_FREE_BYTES) {
  try {
    const stats = fs.statfsSync(targetPath);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      ok: freeBytes >= minFreeBytes,
      path: targetPath,
      free_bytes: freeBytes,
      minimum_free_bytes: minFreeBytes,
      reason: freeBytes >= minFreeBytes ? 'healthy' : 'free_bytes_below_threshold',
    };
  } catch (error) {
    return { ok: false, path: targetPath, reason: 'statfs_failed', error: error.message };
  }
}

function envFileCheck(env, repoRoot) {
  const envPath = path.resolve(env.SOVEREIGN_ENV_FILE || path.join(repoRoot, '.env.central'));
  if (!fs.existsSync(envPath)) return { ok: false, path: envPath, reason: 'missing' };
  const mode = fs.statSync(envPath).mode & 0o777;
  return {
    ok: (mode & 0o077) === 0,
    path: envPath,
    mode: mode.toString(8).padStart(3, '0'),
    reason: (mode & 0o077) === 0 ? 'owner_only' : 'group_or_world_readable',
  };
}

function probeCentralHost(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const env = options.env || process.env;
  const run = options.run || spawnSync;
  const storagePath = fs.existsSync(path.join(repoRoot, 'storage'))
    ? path.join(repoRoot, 'storage')
    : repoRoot;
  const checks = {
    environment: validateCentralEnvironment(env),
    env_file: envFileCheck(env, repoRoot),
    git_clean: gitClean(run, repoRoot),
    docker_compose: commandAvailable(run, 'docker', ['compose', 'version']),
    docker_daemon: commandAvailable(run, 'docker', ['info', '--format', '{{.ServerVersion}}']),
    flock: commandAvailable(run, 'flock', ['--version']),
    curl: commandAvailable(run, 'curl', ['--version']),
    compose_manifest: {
      ok: fs.existsSync(path.join(repoRoot, 'infra', 'docker', 'docker-compose.yml')),
      path: path.join(repoRoot, 'infra', 'docker', 'docker-compose.yml'),
    },
    disk: diskCheck(storagePath, options.minFreeBytes ?? DEFAULT_MIN_FREE_BYTES),
  };
  return {
    ok: Object.values(checks).every((check) => check.ok),
    type: 'central_host_preflight',
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    checks,
  };
}

if (require.main === module) {
  try {
    const result = probeCentralHost({ env: loadCentralEnvironment() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, type: 'central_host_preflight', error: error.message })}\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  DEFAULT_MIN_FREE_BYTES,
  EXECUTION_ONLY_KEYS,
  MIN_API_TOKEN_LENGTH,
  diskCheck,
  isPrivateBind,
  loadCentralEnvironment,
  parseEnvFile,
  probeCentralHost,
  validateCentralEnvironment,
};
