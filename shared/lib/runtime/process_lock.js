'use strict';
const fs = require('node:fs');
const path = require('node:path');

const LOCK_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * PID-staleness file lock. Same pattern as backend/gateway/src/bot_state.ts's
 * acquireLock/releaseLock, generalized so non-Polymarket callers (e.g. the Alpaca
 * bot cycle) don't have to re-derive it.
 */
function acquireLock(lockPath, maxAgeMs = LOCK_MAX_AGE_MS) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });

  try {
    fs.writeFileSync(lockPath, payload, { flag: 'wx', mode: 0o600 });
    return true;
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      try {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const age = Date.now() - new Date(lock.startedAt).getTime();
        if (age < maxAgeMs) {
          try {
            process.kill(lock.pid, 0);
            return false; // process alive, lock is valid
          } catch (e) {
            if (e.code !== 'ESRCH') return false; // unexpected error — stay cautious
          }
        }
        // stale lock -> unlink and retry once atomically
        fs.unlinkSync(lockPath);
        fs.writeFileSync(lockPath, payload, { flag: 'wx', mode: 0o600 });
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
}

module.exports = { acquireLock, releaseLock, LOCK_MAX_AGE_MS };
