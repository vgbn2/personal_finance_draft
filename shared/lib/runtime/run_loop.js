'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeJson } = require('../market/validation.js');
const { errorCode, writeServiceHeartbeat } = require('./service_heartbeat.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function _statusPath() {
  return process.env.SOVEREIGN_RUN_STATUS_PATH
    || path.join(REPO_ROOT, 'storage', 'data', 'run_status.json');
}

// Active loop handles — in-memory only, cleared on stop
const _loops = new Map();

function _readStatus() {
  try { return JSON.parse(fs.readFileSync(_statusPath(), 'utf8')); }
  catch { return {}; }
}

function _writeStatus(name, patch) {
  const status = _readStatus();
  if (patch === null) {
    delete status[name];
  } else {
    status[name] = Object.assign({}, status[name] || {}, patch);
  }
  const p = _statusPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  writeJson(p, status);
}

function _heartbeat(name, patch) {
  try {
    writeServiceHeartbeat(name, patch);
  } catch (_) {
    // A telemetry failure must not stop the owned loop or change its safety policy.
  }
}

/**
 * Start a named persistent loop.
 * fn receives { name, iteration, startedAt } and may be async.
 * Returns { stop(), name, status }.
 */
function startLoop(name, fn, intervalMs, opts = {}) {
  if (_loops.has(name)) throw new Error(`Loop '${name}' is already running`);

  const continueOnError = opts.continueOnError !== false; // default true
  const startedAt = new Date().toISOString();
  let iteration = 0;
  let stopped = false;
  let clearTimer = null;

  _writeStatus(name, { running: true, startedAt, pid: process.pid, intervalMs, iteration: 0 });
  _heartbeat(name, { state: 'starting', next_run_at: new Date(Date.now() + intervalMs).toISOString() });

  async function tick() {
    if (stopped) return;
    iteration++;
    const now = new Date().toISOString();
    _writeStatus(name, { iteration, lastRunAt: now });
    _heartbeat(name, { state: 'running', last_attempt_at: now });
    try {
      await fn({ name, iteration, startedAt });
      _writeStatus(name, { healthyAt: new Date().toISOString() });
      _heartbeat(name, { state: 'healthy', success: true, next_run_at: new Date(Date.now() + intervalMs).toISOString() });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const code = errorCode(msg) || 'service_failed';
      _writeStatus(name, { lastError: code, lastErrorAt: new Date().toISOString() });
      _heartbeat(name, { state: 'degraded', error_code: code, next_run_at: new Date(Date.now() + intervalMs).toISOString() });
      if (!continueOnError) {
        stopped = true;
        _loops.delete(name);
        _writeStatus(name, { running: false, crashed: true, crashedAt: new Date().toISOString() });
        _heartbeat(name, { state: 'degraded', error_code: code });
        return;
      }
    }
    if (!stopped) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, intervalMs);
        clearTimer = () => { clearTimeout(t); resolve(); };
      });
      clearTimer = null;
      tick();
    }
  }

  function stop() {
    stopped = true;
    if (clearTimer) clearTimer();
    _loops.delete(name);
    _writeStatus(name, null);
    _heartbeat(name, { state: 'stopped', attempted: false, next_run_at: null });
  }

  const handle = { stop };
  _loops.set(name, handle);
  Promise.resolve().then(tick);

  return { stop, name, get status() { return _readStatus()[name] || null; } };
}

function stopLoop(name) {
  const h = _loops.get(name);
  if (!h) return false;
  h.stop();
  return true;
}

function stopAll() {
  for (const h of _loops.values()) h.stop();
}

function getStatus() {
  const raw = _readStatus();
  const now = Date.now();
  for (const info of Object.values(raw)) {
    if (info.running && info.lastRunAt && info.intervalMs) {
      const sinceLastRun = now - new Date(info.lastRunAt).getTime();
      info.stale = sinceLastRun > 2 * info.intervalMs;
      if (info.stale) info.staleForSec = Math.round(sinceLastRun / 1000);
    }
  }
  return raw;
}

function isRunning(name) { return _loops.has(name); }

function installShutdownHandlers() {
  const shutdown = (sig) => {
    console.log(`\n[run_loop] ${sig} — stopping all loops`);
    stopAll();
    setTimeout(() => process.exit(0), 500);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}

module.exports = { startLoop, stopLoop, stopAll, getStatus, isRunning, installShutdownHandlers };
