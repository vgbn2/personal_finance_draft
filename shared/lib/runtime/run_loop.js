'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
  fs.writeFileSync(p, JSON.stringify(status, null, 2), 'utf8');
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

  async function tick() {
    if (stopped) return;
    iteration++;
    const now = new Date().toISOString();
    _writeStatus(name, { iteration, lastRunAt: now });
    try {
      await fn({ name, iteration, startedAt });
      _writeStatus(name, { healthyAt: new Date().toISOString() });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      _writeStatus(name, { lastError: msg, lastErrorAt: new Date().toISOString() });
      if (!continueOnError) {
        stopped = true;
        _loops.delete(name);
        _writeStatus(name, { running: false, crashed: true, crashedAt: new Date().toISOString() });
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
