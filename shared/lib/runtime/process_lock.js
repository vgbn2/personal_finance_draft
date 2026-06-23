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
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const age = Date.now() - new Date(lock.startedAt).getTime();
      if (age < maxAgeMs) {
        try {
          process.kill(lock.pid, 0);
          return false; // process alive, lock is valid
        } catch (e) {
          if (e.code !== 'ESRCH') return false; // unexpected error — stay cautious
          // ESRCH = process not found -> stale lock, fall through to acquire
        }
      }
      // stale lock — remove it
    } catch {
      // malformed lock file — remove it
    }
    fs.unlinkSync(lockPath);
  }
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
  return true;
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
}

module.exports = { acquireLock, releaseLock, LOCK_MAX_AGE_MS };
